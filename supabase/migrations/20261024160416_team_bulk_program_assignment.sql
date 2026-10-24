-- A single request reads candidates; each write reuses the existing per-student
-- validation. A failed member rolls back the whole bulk assignment transaction.
BEGIN;

CREATE FUNCTION public.get_team_leader_program_candidates(p_item_id uuid, p_category_code text)
RETURNS TABLE (participant_id uuid, name text, chest_number text, category_code text,
  is_eligible boolean, registration_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_context record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id=p_item_id AND i.festival_id=v_context.festival_id
      AND (i.tenant_id IS NULL OR i.tenant_id=v_context.parent_tenant_id)
      AND i.is_active IS TRUE AND lower(COALESCE(i.participation_type,''))='individual'
      AND p_category_code = ANY(i.category_codes)
  ) THEN RAISE EXCEPTION 'Select an active individual program and category.' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT p.id, p.name, p.chest_number, p.category_code, option.is_eligible, r.id
  FROM (SELECT * FROM public.get_team_leader_participants()
        WHERE status IS DISTINCT FROM 'rejected') p
  JOIN public.participants source_participant ON source_participant.id=p.id
  JOIN LATERAL public.get_team_leader_programs(p.id) option
    ON option.item_id=p_item_id AND option.entry_kind='participant'
  LEFT JOIN public.registrations r ON r.participant_id=p.id AND r.item_id=p_item_id
    AND r.festival_id=v_context.festival_id AND r.organisation_id=v_context.organisation_id
    AND r.entry_kind='participant'
  WHERE (
      upper(btrim(COALESCE(p.category_code,''))) = upper(btrim(p_category_code))
      OR (upper(btrim(COALESCE(p.category_code,''))) IN ('JR','JUNIOR') AND upper(btrim(p_category_code)) IN ('JR','JUNIOR'))
      OR (upper(btrim(COALESCE(p.category_code,''))) IN ('SR','SENIOR') AND upper(btrim(p_category_code)) IN ('SR','SENIOR'))
      OR (upper(btrim(COALESCE(p.category_code,''))) IN ('CA','CAMPUS') AND upper(btrim(p_category_code)) IN ('CA','CAMPUS'))
      OR upper(btrim(p_category_code)) IN ('GN','GENERAL')
      OR (COALESCE((to_jsonb(source_participant)->>'is_post_hs_religious')::boolean,false)
          AND upper(btrim(p_category_code)) IN ('JR','JUNIOR','SR','SENIOR'))
    )
  ORDER BY p.name, p.id;
END;
$$;

CREATE FUNCTION public.team_leader_bulk_assign_program(
  p_item_id uuid, p_category_code text, p_participant_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id uuid; v_allowed uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  IF p_participant_ids IS NULL OR cardinality(p_participant_ids) = 0
    OR array_position(p_participant_ids, NULL) IS NOT NULL
    OR (SELECT count(DISTINCT id) FROM unnest(p_participant_ids) ids(id)) <> cardinality(p_participant_ids)
  THEN RAISE EXCEPTION 'Select distinct students.' USING ERRCODE='22023'; END IF;

  SELECT array_agg(c.participant_id) INTO v_allowed
  FROM public.get_team_leader_program_candidates(p_item_id,p_category_code) c
  WHERE c.is_eligible AND c.registration_id IS NULL;
  IF EXISTS (SELECT 1 FROM unnest(p_participant_ids) ids(id)
             WHERE NOT ids.id = ANY(COALESCE(v_allowed, ARRAY[]::uuid[])))
  THEN RAISE EXCEPTION 'Selection contains an assigned or ineligible student.' USING ERRCODE='42501'; END IF;

  FOREACH v_id IN ARRAY p_participant_ids LOOP
    PERFORM public.team_leader_assign_program(v_id,p_item_id);
  END LOOP;
  RETURN jsonb_build_object('added_count',cardinality(p_participant_ids));
END;
$$;

CREATE FUNCTION public.team_leader_unassign_program(p_registration_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_context record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication is required.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_context FROM public.get_team_leader_context();
  IF NOT FOUND THEN RAISE EXCEPTION 'An active Team Leader portal assignment is required.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.registrations r
    JOIN public.participants p ON p.id=r.participant_id
    WHERE r.id=p_registration_id AND r.festival_id=v_context.festival_id
      AND r.organisation_id=v_context.organisation_id AND r.entry_kind='participant'
      AND p.festival_id=v_context.festival_id AND p.organisation_id=v_context.organisation_id
      AND p.tenant_id IN (v_context.parent_tenant_id,
        (SELECT o.tenant_id FROM public.organisations o WHERE o.id=v_context.organisation_id)))
  THEN RAISE EXCEPTION 'This assignment is outside your team.' USING ERRCODE='42501'; END IF;
  RETURN public.safe_unassign_registration(p_registration_id,'Team Leader program correction');
END;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_program_candidates(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_leader_bulk_assign_program(uuid,text,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.team_leader_unassign_program(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_program_candidates(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_leader_bulk_assign_program(uuid,text,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.team_leader_unassign_program(uuid) TO authenticated;
COMMIT;
