BEGIN;

-- Keep returning the complete saved-order snapshot so save/lock RPCs retain
-- their existing contract, but expose archive state for the UI to hide rows
-- without dropping their reserved chest-number slots.
CREATE OR REPLACE FUNCTION public.get_festival_chest_order(p_festival_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT jsonb_build_object('festival_id',f.id,'template',f.chest_number_template,
    'range',f.chest_number_category_range,'locked',COALESCE(c.locked,false),'revision',COALESCE(c.revision,0),
    'teams',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'archived_at',r.archived_at,
        'slot_number',r.slot_number,'total',r.total,'numeric',r.numeric)
        ORDER BY r.slot_number NULLS LAST,r.created_at,r.id)
      FROM (
        SELECT o.id,o.name,o.archived_at,o.created_at,s.slot_number,
          COALESCE(p.total,0) AS total,COALESCE(p.numeric,0) AS numeric
        FROM public.tenants t JOIN public.organisations o ON o.parent_id=t.organisation_id
        LEFT JOIN public.festival_team_chest_slots s ON s.festival_id=f.id AND s.organisation_id=o.id
        LEFT JOIN (
          SELECT p.organisation_id,count(*) AS total,
            count(*) FILTER (WHERE p.chest_number ~ '^[0-9]+$') AS numeric
          FROM public.participants p WHERE p.festival_id=p_festival_id GROUP BY p.organisation_id
        ) p ON p.organisation_id=o.id
        WHERE t.id=f.tenant_id
      ) r
    ),'[]'::jsonb)) INTO v_result
  FROM public.festival_calendar f
  LEFT JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
  WHERE f.id=p_festival_id;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.get_festival_chest_order(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_festival_chest_order(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_festival_chest_order(uuid) IS
  'Returns the complete tenant-admin chest order snapshot with archived-state metadata. Clients may hide archived rows while retaining their reserved slots in save/lock snapshots.';

-- Reorder active teams only across the slot numbers they already occupy.
-- Archived teams and their ranges stay unchanged, including when deleted teams
-- have left gaps in the slot sequence.
CREATE OR REPLACE FUNCTION public.save_festival_chest_order(
  p_festival_id uuid,
  p_team_ids uuid[],
  p_expected_team_ids uuid[],
  p_expected_revision integer,
  p_expected_range integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tenant uuid;
  v_state jsonb;
  v_current uuid[];
  v_active_slots integer[];
  v_active_count integer;
BEGIN
  v_tenant:=public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  -- Serialize this save with archive/restore updates to the team rows.
  PERFORM o.id
  FROM public.tenants t
  JOIN public.organisations o ON o.parent_id=t.organisation_id
  WHERE t.id=v_tenant
  ORDER BY o.id
  FOR UPDATE OF o;

  v_state:=public.get_festival_chest_order(p_festival_id);
  IF v_state->>'template'<>'team' THEN RAISE EXCEPTION 'Team ordering requires the team chest-number template.'; END IF;
  IF (v_state->>'locked')::boolean THEN RAISE EXCEPTION 'Chest numbers are finally locked.' USING ERRCODE='55000'; END IF;
  SELECT COALESCE(array_agg((e.value->>'id')::uuid ORDER BY e.ordinality),'{}'::uuid[]) INTO v_current
    FROM jsonb_array_elements(v_state->'teams') WITH ORDINALITY AS e(value,ordinality);
  IF (v_state->>'revision')::integer IS DISTINCT FROM p_expected_revision OR
     (v_state->>'range')::integer IS DISTINCT FROM p_expected_range OR v_current IS DISTINCT FROM p_expected_team_ids THEN
    RAISE EXCEPTION 'Chest-number settings or teams changed. Reload before saving.' USING ERRCODE='40001';
  END IF;
  IF p_team_ids IS NULL OR cardinality(p_team_ids)<>cardinality(v_current) OR
     (SELECT count(DISTINCT x.id) FROM unnest(p_team_ids) AS x(id))<>cardinality(v_current) OR
     EXISTS (SELECT 1 FROM unnest(p_team_ids) AS x(id) WHERE x.id IS NULL OR NOT x.id=ANY(v_current)) THEN
    RAISE EXCEPTION 'Include every festival team exactly once.';
  END IF;

  PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
  SELECT count(*)::integer INTO v_active_count
  FROM public.organisations o
  JOIN public.tenants t ON t.organisation_id=o.parent_id
  WHERE t.id=v_tenant AND o.archived_at IS NULL;
  SELECT COALESCE(array_agg(s.slot_number ORDER BY s.slot_number),'{}'::integer[])
    INTO v_active_slots
  FROM public.festival_team_chest_slots s
  JOIN public.organisations o ON o.id=s.organisation_id
  JOIN public.tenants t ON t.organisation_id=o.parent_id
  WHERE s.festival_id=p_festival_id AND t.id=v_tenant AND o.archived_at IS NULL;
  IF cardinality(v_active_slots)<>v_active_count THEN
    RAISE EXCEPTION 'Stored active team slots are inconsistent. Review team ownership first.';
  END IF;

  DELETE FROM public.festival_team_chest_slots s
  USING public.organisations o,public.tenants t
  WHERE s.festival_id=p_festival_id AND s.organisation_id=o.id
    AND o.parent_id=t.organisation_id AND t.id=v_tenant AND o.archived_at IS NULL;
  WITH active_order AS (
    SELECT x.id,row_number() OVER (ORDER BY x.ordinality)::integer AS active_position
    FROM unnest(p_team_ids) WITH ORDINALITY AS x(id,ordinality)
    JOIN public.organisations o ON o.id=x.id
    WHERE o.parent_id=(SELECT t.organisation_id FROM public.tenants t WHERE t.id=v_tenant)
      AND o.archived_at IS NULL
  )
  INSERT INTO public.festival_team_chest_slots(festival_id,organisation_id,slot_number)
  SELECT p_festival_id,a.id,v_active_slots[a.active_position]
  FROM active_order a;

  -- Existing two-phase regeneration preserves festival-wide uniqueness and
  -- audit records. Failure rolls back active slots, numbers and revision.
  PERFORM public.regenerate_festival_chest_numbers_internal(p_festival_id,auth.uid());
  INSERT INTO public.festival_chest_number_controls(festival_id,revision,updated_by)
    VALUES(p_festival_id,1,auth.uid()) ON CONFLICT (festival_id) DO UPDATE
    SET revision=festival_chest_number_controls.revision+1,updated_by=auth.uid(),updated_at=now();
  RETURN public.get_festival_chest_order(p_festival_id);
END $$;

REVOKE ALL ON FUNCTION public.save_festival_chest_order(uuid,uuid[],uuid[],integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_festival_chest_order(uuid,uuid[],uuid[],integer,integer) TO authenticated;
COMMENT ON FUNCTION public.save_festival_chest_order(uuid,uuid[],uuid[],integer,integer) IS
  'Saves active-team order across existing active slots while preserving archived team slots, then regenerates chest numbers transactionally.';

NOTIFY pgrst,'reload schema';
COMMIT;
