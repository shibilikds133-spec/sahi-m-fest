BEGIN;

-- Allow administrators to place a participant within the active numbering
-- scope for either template: team range or category range. Keep the existing
-- optimistic concurrency, tenant authorization, final lock, audit and award
-- ownership behavior from edit_participant_profile.
CREATE OR REPLACE FUNCTION public.edit_participant_profile(
  p_participant_id uuid,p_updates jsonb,p_new_org_id uuid,p_chest_number text,
  p_expected_updated_at timestamptz,p_expected_org_id uuid,p_expected_chest_number text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  before public.participants;
  edited public.participants;
  f public.festival_calendar;
  target_team uuid;
  target_number integer;
  first_gap integer;
  old_number integer;
  slot integer;
  source_slot integer;
  target_start integer;
  target_end integer;
  source_start integer;
  source_end integer;
  initial_festival uuid;
  plan jsonb;
  originals jsonb;
  row record;
  new_number integer;
  team_changed boolean;
  category_changed boolean;
  requested_number boolean;
  reorder_numbers boolean;
  numbering_changed boolean;
  same_scope boolean;
  source_row boolean;
  target_row boolean;
BEGIN
  SELECT * INTO before FROM public.participants WHERE id=p_participant_id;
  IF before.id IS NULL THEN RAISE EXCEPTION 'Participant not found.'; END IF;
  initial_festival:=before.festival_id;
  PERFORM public.assert_festival_chest_admin(before.festival_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(before.festival_id::text),pg_catalog.hashtext('participant-chest-number'));
  SELECT * INTO before FROM public.participants WHERE id=p_participant_id FOR UPDATE;
  IF before.id IS NULL OR before.festival_id IS DISTINCT FROM initial_festival THEN
    RAISE EXCEPTION 'Participant festival changed. Reload before saving.' USING ERRCODE='40001'; END IF;
  PERFORM public.assert_festival_chest_admin(before.festival_id);
  IF before.updated_at IS DISTINCT FROM p_expected_updated_at OR before.organisation_id IS DISTINCT FROM p_expected_org_id
    OR before.chest_number IS DISTINCT FROM p_expected_chest_number THEN
    RAISE EXCEPTION 'Participant changed after opening. Reload before saving.' USING ERRCODE='40001'; END IF;
  IF before.is_locked IS TRUE THEN RAISE EXCEPTION 'Unlock this participant before editing.' USING ERRCODE='55000'; END IF;
  IF jsonb_typeof(p_updates) IS DISTINCT FROM 'object' OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_updates) k WHERE k NOT IN
      ('name','dob','category_code','class_std','education_type','gender','public_profile_enabled','show_organisation_public')) THEN
    RAISE EXCEPTION 'Unsupported participant edit fields.'; END IF;
  edited:=jsonb_populate_record(before,p_updates);
  edited.name:=btrim(edited.name);
  IF edited.name IS NULL OR edited.name='' THEN RAISE EXCEPTION 'Name is required.'; END IF;
  target_team:=COALESCE(p_new_org_id,before.organisation_id);
  team_changed:=target_team IS DISTINCT FROM before.organisation_id;
  category_changed:=COALESCE(pg_catalog.lower(pg_catalog.btrim(edited.category_code)),'') IS DISTINCT FROM
    COALESCE(pg_catalog.lower(pg_catalog.btrim(before.category_code)),'');
  requested_number:=nullif(pg_catalog.btrim(p_chest_number),'') IS NOT NULL;
  SELECT * INTO f FROM public.festival_calendar WHERE id=before.festival_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Festival not found.'; END IF;

  reorder_numbers:=(f.chest_number_template='team' AND (team_changed OR requested_number AND pg_catalog.btrim(p_chest_number) IS DISTINCT FROM before.chest_number))
    OR (f.chest_number_template IS DISTINCT FROM 'team' AND
      (requested_number AND pg_catalog.btrim(p_chest_number) IS DISTINCT FROM before.chest_number OR category_changed
        AND nullif(pg_catalog.btrim(before.category_code),'') IS NOT NULL AND nullif(pg_catalog.btrim(edited.category_code),'') IS NOT NULL));
  numbering_changed:=team_changed OR reorder_numbers OR
    (f.chest_number_template IS DISTINCT FROM 'team' AND category_changed);
  IF numbering_changed AND EXISTS(SELECT 1 FROM public.festival_chest_number_controls WHERE festival_id=f.id AND locked) THEN
    RAISE EXCEPTION 'Chest numbers are finally locked. Unlock before changing team, category or number.' USING ERRCODE='55000'; END IF;

  IF reorder_numbers THEN
    IF f.chest_number_template='team' THEN
      IF NOT EXISTS(SELECT 1 FROM public.organisations o JOIN public.tenants t ON o.parent_id=t.organisation_id
        WHERE t.id=f.tenant_id AND o.id=target_team) THEN RAISE EXCEPTION 'Select a team under this festival organisation.'; END IF;
      slot:=public.festival_team_chest_slot(f.id,target_team);
      SELECT slot_number INTO source_slot FROM public.festival_team_chest_slots WHERE festival_id=f.id AND organisation_id=before.organisation_id;
      IF before.chest_number IS NULL OR before.chest_number !~ '^[0-9]+$' OR source_slot IS NULL THEN
        RAISE EXCEPTION 'Generate valid team chest numbers before reordering.'; END IF;
      target_start:=slot*f.chest_number_category_range;
      target_end:=(slot+1)*f.chest_number_category_range;
      source_start:=source_slot*f.chest_number_category_range;
      source_end:=(source_slot+1)*f.chest_number_category_range;
      same_scope:=target_team=before.organisation_id;
    ELSE
      IF nullif(pg_catalog.btrim(edited.category_code),'') IS NULL THEN
        RAISE EXCEPTION 'Select a category before changing this chest number.'; END IF;
      WITH category_codes AS (
        SELECT pg_catalog.lower(pg_catalog.btrim(fc.code)) AS category_code FROM public.festival_categories fc
          WHERE fc.festival_id=f.id AND pg_catalog.btrim(COALESCE(fc.code,''))<>''
        UNION SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(p.category_code)) FROM public.participants p
          WHERE p.festival_id=f.id AND pg_catalog.btrim(COALESCE(p.category_code,''))<>''
        UNION SELECT pg_catalog.lower(pg_catalog.btrim(edited.category_code))
        UNION SELECT pg_catalog.lower(pg_catalog.btrim(before.category_code)) WHERE pg_catalog.btrim(COALESCE(before.category_code,''))<>''
      ), ordered_categories AS (
        SELECT codes.category_code,row_number() OVER (ORDER BY fc.sort_order NULLS LAST,codes.category_code)::integer AS position
        FROM category_codes codes LEFT JOIN LATERAL (
          SELECT min(fc.sort_order) AS sort_order FROM public.festival_categories fc
          WHERE fc.festival_id=f.id AND pg_catalog.lower(pg_catalog.btrim(fc.code))=codes.category_code
        ) fc ON true
      )
      SELECT max(position) FILTER(WHERE category_code=pg_catalog.lower(pg_catalog.btrim(before.category_code))),
        max(position) FILTER(WHERE category_code=pg_catalog.lower(pg_catalog.btrim(edited.category_code)))
      INTO source_slot,slot FROM ordered_categories;
      IF slot IS NULL THEN RAISE EXCEPTION 'Unable to resolve the participant category number range.'; END IF;
      IF source_slot IS NOT NULL THEN
        source_start:=source_slot*f.chest_number_category_range;
        source_end:=(source_slot+1)*f.chest_number_category_range;
      END IF;
      target_start:=slot*f.chest_number_category_range;
      target_end:=(slot+1)*f.chest_number_category_range;
      same_scope:=source_slot IS NOT NULL AND source_slot=slot;
    END IF;

    IF source_slot IS NOT NULL THEN
      IF before.chest_number IS NULL OR before.chest_number !~ '^[0-9]+$' THEN
        RAISE EXCEPTION 'Generate valid chest numbers before reordering.'; END IF;
      old_number:=before.chest_number::integer;
      IF old_number<source_start OR old_number>=source_end THEN
        RAISE EXCEPTION 'Current chest number is outside its existing range.'; END IF;
    END IF;

    IF f.chest_number_template='team' AND requested_number THEN
      IF pg_catalog.btrim(p_chest_number) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Enter a numeric chest number.'; END IF;
      target_number:=pg_catalog.btrim(p_chest_number)::integer;
    ELSIF f.chest_number_template IS DISTINCT FROM 'team' AND requested_number
      AND pg_catalog.btrim(p_chest_number) IS DISTINCT FROM before.chest_number THEN
      IF pg_catalog.btrim(p_chest_number) !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Enter a numeric chest number.'; END IF;
      target_number:=pg_catalog.btrim(p_chest_number)::integer;
    ELSE
      SELECT n INTO target_number FROM generate_series(target_start,target_end-1) n
      WHERE NOT EXISTS(SELECT 1 FROM public.participants p WHERE p.festival_id=f.id AND p.id<>before.id
        AND CASE WHEN f.chest_number_template='team' THEN p.organisation_id=target_team
          ELSE pg_catalog.lower(pg_catalog.btrim(p.category_code))=pg_catalog.lower(pg_catalog.btrim(edited.category_code)) END
        AND p.chest_number=n::text) ORDER BY n LIMIT 1;
    END IF;
    IF target_number IS NULL OR target_number<target_start OR target_number>=target_end THEN
      IF f.chest_number_template='team' THEN RAISE EXCEPTION 'Choose a number inside the destination team range.';
      ELSE RAISE EXCEPTION 'Choose a number inside the selected category range.'; END IF;
    END IF;

    SELECT n INTO first_gap FROM generate_series(target_number,target_end-1) n
    WHERE NOT EXISTS(SELECT 1 FROM public.participants p WHERE p.festival_id=f.id AND p.id<>before.id
      AND CASE WHEN f.chest_number_template='team' THEN p.organisation_id=target_team
        ELSE pg_catalog.lower(pg_catalog.btrim(p.category_code))=pg_catalog.lower(pg_catalog.btrim(edited.category_code)) END
      AND CASE WHEN p.chest_number ~ '^[0-9]+$' THEN p.chest_number::integer-
        CASE WHEN same_scope AND p.chest_number::integer>old_number THEN 1 ELSE 0 END END=n)
    ORDER BY n LIMIT 1;
    IF first_gap IS NULL THEN RAISE EXCEPTION 'No room to shift chest numbers inside the selected range.'; END IF;

    plan:='{}'::jsonb;
    FOR row IN SELECT p.* FROM public.participants p WHERE p.festival_id=f.id AND p.id<>before.id
      AND CASE WHEN f.chest_number_template='team' THEN p.organisation_id IN(before.organisation_id,target_team)
        ELSE pg_catalog.lower(pg_catalog.btrim(p.category_code)) IN
          (pg_catalog.lower(pg_catalog.btrim(before.category_code)),pg_catalog.lower(pg_catalog.btrim(edited.category_code))) END
      ORDER BY p.id FOR UPDATE LOOP
      source_row:=CASE WHEN f.chest_number_template='team' THEN row.organisation_id=before.organisation_id
        ELSE source_slot IS NOT NULL AND pg_catalog.lower(pg_catalog.btrim(row.category_code))=pg_catalog.lower(pg_catalog.btrim(before.category_code)) END;
      target_row:=CASE WHEN f.chest_number_template='team' THEN row.organisation_id=target_team
        ELSE pg_catalog.lower(pg_catalog.btrim(row.category_code))=pg_catalog.lower(pg_catalog.btrim(edited.category_code)) END;
      IF row.chest_number IS NULL OR row.chest_number !~ '^[0-9]+$' THEN RAISE EXCEPTION 'Generate valid chest numbers before reordering.'; END IF;
      new_number:=row.chest_number::integer;
      IF source_row AND (new_number<source_start OR new_number>=source_end) THEN
        RAISE EXCEPTION 'A source chest number is outside its existing range.'; END IF;
      IF target_row AND (new_number<target_start OR new_number>=target_end) THEN
        RAISE EXCEPTION 'A destination chest number is outside its range.'; END IF;
      IF source_row AND new_number>old_number THEN new_number:=new_number-1; END IF;
      IF target_row AND new_number>=target_number AND new_number<first_gap THEN new_number:=new_number+1; END IF;
      IF target_row AND new_number>=target_end THEN RAISE EXCEPTION 'No room to shift chest numbers inside the selected range.'; END IF;
      IF new_number::text IS DISTINCT FROM row.chest_number THEN plan:=plan||jsonb_build_object(row.id::text,new_number::text); END IF;
    END LOOP;
    plan:=plan||jsonb_build_object(before.id::text,target_number::text);
    SELECT jsonb_agg(to_jsonb(p)) INTO originals FROM public.participants p WHERE p.id::text IN(SELECT jsonb_object_keys(plan));
    UPDATE public.participants p SET chest_number='__regen__'||p.id::text WHERE p.id::text IN(SELECT jsonb_object_keys(plan));
  END IF;

  UPDATE public.participants SET name=edited.name,dob=edited.dob,category_code=edited.category_code,
    class_std=edited.class_std,education_type=edited.education_type,gender=edited.gender,
    public_profile_enabled=edited.public_profile_enabled,show_organisation_public=edited.show_organisation_public,
    updated_at=clock_timestamp() WHERE id=before.id;
  IF team_changed THEN
    PERFORM public.transfer_participant_team(before.id,target_team,auth.uid());
  END IF;
  IF plan IS NOT NULL THEN
    UPDATE public.participants SET chest_number='__regen__'||id::text WHERE id=before.id;
    UPDATE public.participants p SET chest_number=e.value,updated_at=clock_timestamp()
      FROM jsonb_each_text(plan) e WHERE p.id::text=e.key;
    INSERT INTO public.participant_chest_number_changes
      (tenant_id,festival_id,participant_id,old_chest_number,new_chest_number,old_organisation_id,new_organisation_id,changed_by)
    SELECT f.tenant_id,f.id,p.id,old->>'chest_number',p.chest_number,(old->>'organisation_id')::uuid,p.organisation_id,auth.uid()
    FROM jsonb_array_elements(originals) old JOIN public.participants p ON p.id=(old->>'id')::uuid
    WHERE old->>'chest_number' IS DISTINCT FROM p.chest_number;
  END IF;
  SELECT * INTO edited FROM public.participants WHERE id=before.id;
  RETURN to_jsonb(edited);
END $$;

REVOKE ALL ON FUNCTION public.edit_participant_profile(uuid,jsonb,uuid,text,timestamptz,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_participant_profile(uuid,jsonb,uuid,text,timestamptz,uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
