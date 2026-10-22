BEGIN;

CREATE TABLE public.festival_chest_number_controls (
  festival_id uuid PRIMARY KEY REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  locked boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.festival_chest_number_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.festival_chest_number_controls FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.assert_festival_chest_admin(p_festival_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT f.tenant_id INTO v_tenant FROM public.festival_calendar f WHERE f.id=p_festival_id;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Festival not found.' USING ERRCODE='P0002'; END IF;
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND
      (p.is_superadmin IS TRUE OR p.role='super_admin' OR
       (p.role IN ('admin','tenant_admin','festival_admin') AND p.tenant_id=v_tenant))
  ) THEN RAISE EXCEPTION 'Administrator access to this festival is required.' USING ERRCODE='42501'; END IF;
  RETURN v_tenant;
END $$;
REVOKE ALL ON FUNCTION public.assert_festival_chest_admin(uuid) FROM PUBLIC, anon, authenticated;

-- Every protected write uses the existing festival numbering lock. New
-- participants in an existing team can still receive their next unused number.
CREATE FUNCTION public.guard_final_chest_numbers() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_festival uuid; v_other uuid;
BEGIN
  IF TG_TABLE_NAME='festival_calendar' THEN
    IF OLD.chest_number_template IS NOT DISTINCT FROM NEW.chest_number_template AND
       OLD.chest_number_category_range IS NOT DISTINCT FROM NEW.chest_number_category_range THEN RETURN NEW; END IF;
    v_festival:=OLD.id;
  ELSIF TG_TABLE_NAME='participants' THEN
    IF OLD.chest_number IS NOT DISTINCT FROM NEW.chest_number AND
       OLD.organisation_id IS NOT DISTINCT FROM NEW.organisation_id AND
       OLD.festival_id IS NOT DISTINCT FROM NEW.festival_id THEN RETURN NEW; END IF;
    v_festival:=OLD.festival_id; v_other:=NEW.festival_id;
  ELSIF TG_OP='DELETE' THEN v_festival:=OLD.festival_id;
  ELSE v_festival:=NEW.festival_id;
  END IF;
  -- Allow the existing ON DELETE CASCADE when the festival itself is removed.
  IF TG_TABLE_NAME='festival_team_chest_slots' AND TG_OP='DELETE' AND
     NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id=v_festival) THEN RETURN OLD; END IF;
  -- Deterministic order also covers a direct cross-festival participant update.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(f.id::text),pg_catalog.hashtext('participant-chest-number'))
    FROM public.festival_calendar f WHERE f.id IN (v_festival,v_other) ORDER BY f.id;
  IF EXISTS (SELECT 1 FROM public.festival_chest_number_controls c
             WHERE c.festival_id IN (v_festival,v_other) AND c.locked) THEN
    RAISE EXCEPTION 'Chest numbers are finally locked. Unlock with the tenant ID before changing them.' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_final_chest_numbers() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_final_chest_calendar BEFORE UPDATE OF chest_number_template,chest_number_category_range
  ON public.festival_calendar FOR EACH ROW EXECUTE FUNCTION public.guard_final_chest_numbers();
CREATE TRIGGER guard_final_chest_participant BEFORE UPDATE OF chest_number,organisation_id,festival_id
  ON public.participants FOR EACH ROW EXECUTE FUNCTION public.guard_final_chest_numbers();
CREATE TRIGGER guard_final_chest_slots BEFORE INSERT OR UPDATE OR DELETE
  ON public.festival_team_chest_slots FOR EACH ROW EXECUTE FUNCTION public.guard_final_chest_numbers();
CREATE TRIGGER guard_final_chest_regeneration BEFORE INSERT
  ON public.chest_number_regeneration_audits FOR EACH ROW EXECUTE FUNCTION public.guard_final_chest_numbers();

CREATE FUNCTION public.get_festival_chest_order(p_festival_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT jsonb_build_object('festival_id',f.id,'template',f.chest_number_template,
    'range',f.chest_number_category_range,'locked',COALESCE(c.locked,false),'revision',COALESCE(c.revision,0),
    'teams',COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'slot_number',r.slot_number,
        'total',r.total,'numeric',r.numeric) ORDER BY r.slot_number NULLS LAST,r.created_at,r.id)
      FROM (
        SELECT o.id,o.name,o.created_at,s.slot_number,COALESCE(p.total,0) AS total,COALESCE(p.numeric,0) AS numeric
        FROM public.tenants t JOIN public.organisations o ON o.parent_id=t.organisation_id
        LEFT JOIN public.festival_team_chest_slots s ON s.festival_id=f.id AND s.organisation_id=o.id
        LEFT JOIN (
          SELECT p.organisation_id,count(*) AS total,count(*) FILTER (WHERE p.chest_number ~ '^[0-9]+$') AS numeric
          FROM public.participants p WHERE p.festival_id=p_festival_id GROUP BY p.organisation_id
        ) p ON p.organisation_id=o.id
        WHERE t.id=f.tenant_id
      ) r
    ),'[]'::jsonb)) INTO v_result
  FROM public.festival_calendar f LEFT JOIN public.festival_chest_number_controls c ON c.festival_id=f.id
  WHERE f.id=p_festival_id;
  RETURN v_result;
END $$;

CREATE FUNCTION public.save_festival_chest_order(
  p_festival_id uuid,p_team_ids uuid[],p_expected_team_ids uuid[],p_expected_revision integer,p_expected_range integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_state jsonb; v_current uuid[]; v_count integer;
BEGIN
  PERFORM public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
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
  SELECT count(*) INTO v_count FROM public.festival_team_chest_slots s WHERE s.festival_id=p_festival_id;
  IF v_count<>cardinality(v_current) THEN RAISE EXCEPTION 'Stored team slots no longer match the festival organisation. Review team ownership first.'; END IF;
  DELETE FROM public.festival_team_chest_slots s WHERE s.festival_id=p_festival_id;
  INSERT INTO public.festival_team_chest_slots(festival_id,organisation_id,slot_number)
    SELECT p_festival_id,x.id,x.position::integer FROM unnest(p_team_ids) WITH ORDINALITY AS x(id,position);
  -- Existing two-phase regeneration preserves festival-wide uniqueness and
  -- audit records. Failure rolls back both the slots and all participant numbers.
  PERFORM public.regenerate_festival_chest_numbers_internal(p_festival_id,auth.uid());
  INSERT INTO public.festival_chest_number_controls(festival_id,revision,updated_by)
    VALUES(p_festival_id,1,auth.uid()) ON CONFLICT (festival_id) DO UPDATE
    SET revision=festival_chest_number_controls.revision+1,updated_by=auth.uid(),updated_at=now();
  RETURN public.get_festival_chest_order(p_festival_id);
END $$;

CREATE FUNCTION public.set_festival_chest_lock(
  p_festival_id uuid,p_locked boolean,p_expected_revision integer,p_expected_team_ids uuid[],p_expected_range integer,p_unlock_code text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_tenant uuid; v_state jsonb; v_current uuid[];
BEGIN
  v_tenant:=public.assert_festival_chest_admin(p_festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  v_state:=public.get_festival_chest_order(p_festival_id);
  IF p_locked IS NULL THEN RAISE EXCEPTION 'Choose lock or unlock.'; END IF;
  IF (v_state->>'revision')::integer IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Chest-number settings changed. Reload before continuing.' USING ERRCODE='40001'; END IF;
  IF NOT p_locked AND lower(btrim(COALESCE(p_unlock_code,''))) IS DISTINCT FROM v_tenant::text THEN
    RAISE EXCEPTION 'Incorrect unlock code.' USING ERRCODE='42501'; END IF;
  IF p_locked THEN
    SELECT COALESCE(array_agg((e.value->>'id')::uuid ORDER BY e.ordinality),'{}'::uuid[]) INTO v_current
      FROM jsonb_array_elements(v_state->'teams') WITH ORDINALITY AS e(value,ordinality);
    IF v_state->>'template'<>'team' OR (v_state->>'range')::integer IS DISTINCT FROM p_expected_range OR
       v_current IS DISTINCT FROM p_expected_team_ids THEN
      RAISE EXCEPTION 'Chest-number settings or teams changed. Reload before locking.' USING ERRCODE='40001'; END IF;
    IF NOT (v_state->>'locked')::boolean THEN
      PERFORM public.ensure_festival_team_chest_slots(p_festival_id);
      IF EXISTS (SELECT 1 FROM public.participants p
        LEFT JOIN public.festival_team_chest_slots s ON s.festival_id=p.festival_id AND s.organisation_id=p.organisation_id
        WHERE p.festival_id=p_festival_id AND (s.slot_number IS NULL OR p.chest_number IS NULL OR
          CASE WHEN p.chest_number ~ '^[0-9]+$' THEN
            p.chest_number::numeric < s.slot_number*p_expected_range::numeric OR
            p.chest_number::numeric >= (s.slot_number+1)*p_expected_range::numeric ELSE true END)) THEN
        RAISE EXCEPTION 'Generate valid team chest numbers before final locking.';
      END IF;
    END IF;
  END IF;
  IF (v_state->>'locked')::boolean IS NOT DISTINCT FROM p_locked THEN RETURN v_state; END IF;
  INSERT INTO public.festival_chest_number_controls(festival_id,locked,revision,updated_by)
    VALUES(p_festival_id,p_locked,1,auth.uid()) ON CONFLICT (festival_id) DO UPDATE
    SET locked=p_locked,revision=festival_chest_number_controls.revision+1,updated_by=auth.uid(),updated_at=now();
  RETURN public.get_festival_chest_order(p_festival_id);
END $$;

REVOKE ALL ON FUNCTION public.get_festival_chest_order(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.save_festival_chest_order(uuid,uuid[],uuid[],integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.set_festival_chest_lock(uuid,boolean,integer,uuid[],integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_festival_chest_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_festival_chest_order(uuid,uuid[],uuid[],integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_festival_chest_lock(uuid,boolean,integer,uuid[],integer,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
