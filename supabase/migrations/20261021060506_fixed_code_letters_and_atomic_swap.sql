-- Manual assignments survive draws. All edits/draws are atomic and share locks.
-- No existing assignments are inferred to be manual.
BEGIN;
CREATE SCHEMA IF NOT EXISTS code_letter_private;
REVOKE ALL ON SCHEMA code_letter_private FROM PUBLIC, anon, authenticated;
ALTER TABLE public.registrations ADD COLUMN code_letter_fixed boolean NOT NULL DEFAULT false;
ALTER TABLE public.registrations ADD CONSTRAINT registrations_fixed_letter_valid
  CHECK (NOT code_letter_fixed OR (code_letter IS NOT NULL AND code_letter ~ '^[A-Z]$'));

CREATE FUNCTION code_letter_private.clear_fixed_on_clear() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN
  IF NEW.code_letter IS NULL THEN NEW.code_letter_fixed := false; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER registrations_clear_fixed_letter BEFORE UPDATE OF code_letter ON public.registrations
FOR EACH ROW EXECUTE FUNCTION code_letter_private.clear_fixed_on_clear();

CREATE FUNCTION code_letter_private.entries(s public.schedules, portal boolean)
RETURNS SETOF public.registrations LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r.* FROM public.registrations r
  WHERE r.item_id = s.item_id AND r.festival_id = s.festival_id
    AND (r.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v)
      OR r.tenant_id IN (SELECT v.tenant_id FROM public.get_visible_organisations(s.tenant_id) v)
      OR (portal AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v))));
$$;

CREATE FUNCTION code_letter_private.lock_schedule(tenant uuid, schedule uuid)
RETURNS public.schedules LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s public.schedules; original_festival uuid; original_item uuid;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id = schedule AND tenant_id = tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside the current scope.' USING ERRCODE = '42501'; END IF;
  original_festival := s.festival_id;
  original_item := s.item_id;
  -- Festival lock also serializes edits to overlapping events against each other.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('code-letters:' || s.festival_id::text, 0));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(s.festival_id::text || ':' || s.item_id::text, 0));
  SELECT * INTO s FROM public.schedules WHERE id = schedule AND tenant_id = tenant FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside the current scope.' USING ERRCODE = '42501'; END IF;
  IF s.festival_id IS DISTINCT FROM original_festival OR s.item_id IS DISTINCT FROM original_item THEN
    RAISE EXCEPTION 'Schedule changed. Refresh and try again.' USING ERRCODE = '40001'; END IF;
  IF s.is_shuffle_locked THEN RAISE EXCEPTION 'Code letters are locked.' USING ERRCODE = '55000'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other WHERE other.tenant_id = tenant
    AND other.festival_id = s.festival_id AND other.item_id = s.item_id AND other.id <> s.id) THEN
    RAISE EXCEPTION 'Registration ownership is ambiguous: this item has multiple schedules.' USING ERRCODE = '55000';
  END IF;
  -- Re-read registrations only after obtaining both assignment and row locks.
  PERFORM r.id FROM public.registrations r WHERE r.item_id = s.item_id AND r.festival_id = s.festival_id
    ORDER BY r.id FOR UPDATE;
  RETURN s;
END $$;

CREATE FUNCTION code_letter_private.people(registration uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT r.participant_id FROM public.registrations r WHERE r.id = registration AND r.participant_id IS NOT NULL
  UNION SELECT g.participant_id FROM public.group_members g WHERE g.registration_id = registration AND g.participant_id IS NOT NULL;
$$;

CREATE FUNCTION code_letter_private.conflicts(s public.schedules, registration uuid, portal boolean)
RETURNS text[] LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH members AS MATERIALIZED (SELECT person FROM code_letter_private.people(registration) person)
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT r.code_letter), ARRAY[]::text[])
  FROM public.registrations r JOIN public.schedules other
    ON other.item_id = r.item_id AND other.festival_id = r.festival_id AND other.tenant_id = s.tenant_id
  WHERE r.festival_id = s.festival_id AND other.id <> s.id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter IS NOT NULL
    AND other.start_time < s.end_time AND other.end_time > s.start_time
    AND (r.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v)
      OR r.tenant_id IN (SELECT v.tenant_id FROM public.get_visible_organisations(s.tenant_id) v)
      OR (portal AND EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT v.id FROM public.get_visible_organisations(s.tenant_id) v))))
    AND (r.participant_id IN (SELECT person FROM members) OR EXISTS (
      SELECT 1 FROM public.group_members g WHERE g.registration_id = r.id AND g.participant_id IN (SELECT person FROM members)));
$$;

CREATE FUNCTION code_letter_private.edit(tenant uuid, schedule uuid, registration uuid, letter text,
  expected_letter text, expected_swap uuid, portal boolean, venue uuid DEFAULT NULL, festival uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s public.schedules; source public.registrations; target public.registrations;
  targets integer; before_rows jsonb; changed jsonb;
BEGIN
  IF letter IS NULL OR pg_catalog.upper(pg_catalog.btrim(letter)) !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Enter one letter from A to Z.' USING ERRCODE = '22023'; END IF;
  letter := pg_catalog.upper(pg_catalog.btrim(letter));
  s := code_letter_private.lock_schedule(tenant, schedule);
  IF portal AND (s.venue_id IS DISTINCT FROM venue OR s.festival_id IS DISTINCT FROM festival) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO source FROM code_letter_private.entries(s, portal) r WHERE r.id = registration;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside the current schedule scope.' USING ERRCODE = '42501'; END IF;
  IF source.status = 'rejected' OR source.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified active entries can receive code letters.' USING ERRCODE = '22023'; END IF;
  IF source.code_letter IS DISTINCT FROM expected_letter THEN
    RAISE EXCEPTION 'Code letters changed. Refresh and review the edit again.' USING ERRCODE = '40001'; END IF;
  SELECT count(*) INTO targets FROM code_letter_private.entries(s, portal) r
    WHERE r.id <> registration AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter = letter;
  IF targets > 1 THEN RAISE EXCEPTION 'Duplicate existing letters must be resolved before swapping.' USING ERRCODE = '23505'; END IF;
  SELECT * INTO target FROM code_letter_private.entries(s, portal) r
    WHERE r.id <> registration AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter = letter;
  IF target.id IS DISTINCT FROM expected_swap THEN
    RAISE EXCEPTION 'The target letter changed. Refresh and review the swap again.' USING ERRCODE = '40001'; END IF;
  IF target.id IS NOT NULL AND (source.code_letter IS NULL OR source.code_letter !~ '^[A-Z]$') THEN
    RAISE EXCEPTION 'This entry has no letter to swap. Choose an unused letter.' USING ERRCODE = '22023'; END IF;
  IF target.id IS NOT NULL AND EXISTS (SELECT 1 FROM code_letter_private.entries(s, portal) r
    WHERE r.id NOT IN (source.id, target.id) AND r.status <> 'rejected' AND r.is_verified IS TRUE
      AND r.code_letter = source.code_letter) THEN
    RAISE EXCEPTION 'Duplicate existing letters must be resolved before swapping.' USING ERRCODE = '23505'; END IF;
  IF NOT EXISTS (SELECT 1 FROM code_letter_private.people(source.id)) OR
    (target.id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM code_letter_private.people(target.id))) THEN
    RAISE EXCEPTION 'The entry has no participant roster; letters cannot be assigned safely.' USING ERRCODE = '22023'; END IF;
  IF letter = ANY(code_letter_private.conflicts(s, source.id, portal)) OR
    (target.id IS NOT NULL AND source.code_letter = ANY(code_letter_private.conflicts(s, target.id, portal))) THEN
    RAISE EXCEPTION 'The new letter conflicts with an overlapping event for one of these entries.' USING ERRCODE = '22023'; END IF;
  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO before_rows FROM public.registrations r WHERE r.id IN (source.id, target.id);
  UPDATE public.registrations r SET code_letter = CASE WHEN r.id = source.id THEN letter ELSE source.code_letter END,
    code_letter_fixed = true WHERE r.id IN (source.id, target.id);
  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO changed FROM public.registrations r WHERE r.id IN (source.id, target.id);
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    SELECT tenant, auth.uid(), CASE WHEN target.id IS NULL THEN 'code_letter_manual_assign' ELSE 'code_letter_swap' END,
      'registrations', (old_row->>'id')::uuid, old_row || pg_catalog.jsonb_build_object('schedule_id', schedule),
      new_row || pg_catalog.jsonb_build_object('schedule_id', schedule)
    FROM pg_catalog.jsonb_array_elements(before_rows) old_row
    JOIN pg_catalog.jsonb_array_elements(changed) new_row ON old_row->>'id' = new_row->>'id';
  RETURN pg_catalog.jsonb_build_object('changed', (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', row->'id', 'code_letter', row->'code_letter', 'code_letter_fixed', row->'code_letter_fixed'))
    FROM pg_catalog.jsonb_array_elements(changed) row), 'swapped', target.id IS NOT NULL);
END $$;

-- Augmenting paths find a complete conflict-free draw; a greedy draw can fail
-- even when a valid allocation exists. Maximum problem size is 26 letters.
CREATE FUNCTION code_letter_private.match_entry(entry text, choices jsonb, matching jsonb, seen text[])
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE letter text; moved jsonb;
BEGIN
  FOR letter IN SELECT pg_catalog.jsonb_array_elements_text(choices->entry) LOOP
    IF letter = ANY(seen) THEN CONTINUE; END IF;
    IF NOT matching ? letter THEN RETURN matching || pg_catalog.jsonb_build_object(letter, entry); END IF;
    moved := code_letter_private.match_entry(matching->>letter, choices, matching, pg_catalog.array_append(seen, letter));
    IF moved IS NOT NULL THEN RETURN moved || pg_catalog.jsonb_build_object(letter, entry); END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION code_letter_private.draw(tenant uuid, schedule uuid, overwrite boolean, portal boolean,
  venue uuid DEFAULT NULL, festival uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE s public.schedules; current_entry public.registrations; used text[]; pool text[]; blocked text[];
  choices jsonb := '{}'::jsonb; matching jsonb := '{}'::jsonb; candidates jsonb; before_rows jsonb;
  remaining integer; eligible integer; total_fixed integer; entry text; conflict_fallback boolean := false;
BEGIN
  s := code_letter_private.lock_schedule(tenant, schedule);
  IF portal AND (s.venue_id IS DISTINCT FROM venue OR s.festival_id IS DISTINCT FROM festival) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  SELECT count(*), count(*) FILTER (WHERE code_letter_fixed) INTO eligible, total_fixed
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE;
  IF eligible = 0 THEN RAISE EXCEPTION 'No verified active entries are available for the draw.' USING ERRCODE = '22023'; END IF;
  IF eligible > 26 THEN RAISE EXCEPTION 'Only 26 unique A-Z letters are available.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
    AND r.code_letter IS NOT NULL AND (r.code_letter_fixed OR NOT overwrite)
    GROUP BY r.code_letter HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate preserved letters must be resolved before drawing.' USING ERRCODE = '23505'; END IF;
  SELECT COALESCE(pg_catalog.array_agg(r.code_letter), ARRAY[]::text[]) INTO used
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
      AND r.code_letter IS NOT NULL AND (r.code_letter_fixed OR NOT overwrite);
  SELECT pg_catalog.jsonb_agg(to_jsonb(r)), count(*) INTO before_rows, remaining
    FROM code_letter_private.entries(s, portal) r WHERE r.status <> 'rejected' AND r.is_verified IS TRUE
      AND NOT r.code_letter_fixed AND (overwrite OR r.code_letter IS NULL);
  IF remaining = 0 THEN RETURN pg_catalog.jsonb_build_object('assigned', 0, 'fixed', total_fixed); END IF;
  SELECT pg_catalog.array_agg(letter) INTO pool FROM (
    SELECT pg_catalog.chr(n) AS letter FROM pg_catalog.generate_series(65,90) n
    WHERE NOT pg_catalog.chr(n) = ANY(used) ORDER BY n LIMIT remaining
  ) letters;
  FOR current_entry IN SELECT e.* FROM code_letter_private.entries(s, portal) e WHERE e.status <> 'rejected' AND e.is_verified IS TRUE
    AND NOT e.code_letter_fixed AND (overwrite OR e.code_letter IS NULL) LOOP
    IF NOT EXISTS (SELECT 1 FROM code_letter_private.people(current_entry.id)) THEN
      RAISE EXCEPTION 'The entry has no participant roster; letters cannot be drawn safely.' USING ERRCODE = '22023'; END IF;
    blocked := code_letter_private.conflicts(s, current_entry.id, portal);
    SELECT COALESCE(pg_catalog.jsonb_agg(letter ORDER BY (SELECT pg_catalog.min(pg_catalog.abs(pg_catalog.ascii(letter) - pg_catalog.ascii(conflict)))
      FROM pg_catalog.unnest(blocked) conflict) DESC NULLS FIRST, pg_catalog.random()), '[]'::jsonb) INTO candidates
      FROM pg_catalog.unnest(pool) letter WHERE NOT letter = ANY(blocked);
    choices := choices || pg_catalog.jsonb_build_object(current_entry.id::text, candidates);
  END LOOP;
  FOR entry IN SELECT key FROM pg_catalog.jsonb_each(choices) ORDER BY pg_catalog.jsonb_array_length(value), key LOOP
    matching := code_letter_private.match_entry(entry, choices, matching, ARRAY[]::text[]);
    IF matching IS NULL THEN conflict_fallback := true; EXIT; END IF;
  END LOOP;
  IF conflict_fallback THEN
    -- Preserve the established draw's best-effort fallback when a fully safe
    -- permutation is impossible. Manual edits/swaps still reject conflicts.
    matching := '{}'::jsonb;
    FOR entry IN SELECT key FROM pg_catalog.jsonb_each(choices) ORDER BY pg_catalog.jsonb_array_length(value), key LOOP
      candidates := choices->entry;
      SELECT COALESCE(pg_catalog.jsonb_agg(letter ORDER BY pg_catalog.random()), '[]'::jsonb) INTO candidates
        FROM pg_catalog.unnest(pool) letter WHERE NOT matching ? letter
        AND candidates ? letter;
      IF pg_catalog.jsonb_array_length(candidates) = 0 THEN
        SELECT pg_catalog.jsonb_agg(letter ORDER BY pg_catalog.random()) INTO candidates
          FROM pg_catalog.unnest(pool) letter WHERE NOT matching ? letter;
      END IF;
      matching := matching || pg_catalog.jsonb_build_object(candidates->>0, entry);
    END LOOP;
  END IF;
  UPDATE public.registrations r SET code_letter = allocation.key
    FROM pg_catalog.jsonb_each_text(matching) allocation WHERE r.id = allocation.value::uuid;
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    SELECT tenant, auth.uid(), 'code_letter_draw', 'registrations', r.id,
      old_row || pg_catalog.jsonb_build_object('schedule_id', schedule),
      to_jsonb(r) || pg_catalog.jsonb_build_object('schedule_id', schedule)
    FROM pg_catalog.jsonb_array_elements(before_rows) old_row JOIN public.registrations r ON r.id = (old_row->>'id')::uuid;
  RETURN pg_catalog.jsonb_build_object('assigned', remaining, 'fixed', total_fixed, 'conflictsUnavoidable', conflict_fallback);
END $$;

CREATE FUNCTION public.stage_edit_code_letter(p_schedule_id uuid, p_registration_id uuid, p_code_letter text,
  p_expected_letter text, p_expected_swap_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  RETURN code_letter_private.edit(public.stage_assert_admin_access(), p_schedule_id, p_registration_id,
    p_code_letter, p_expected_letter, p_expected_swap_id, false);
END $$;
CREATE FUNCTION public.stage_draw_code_letters(p_schedule_id uuid, p_overwrite boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$ BEGIN
  RETURN code_letter_private.draw(public.stage_assert_admin_access(), p_schedule_id, p_overwrite, false);
END $$;
CREATE FUNCTION public.stage_venue_portal_edit_code_letter(p_venue_id uuid, p_pin text, p_schedule_id uuid,
  p_registration_id uuid, p_code_letter text, p_expected_letter text, p_expected_swap_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.venues; pin_error text;
BEGIN
  pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF pin_error IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('error', pin_error); END IF;
  SELECT * INTO v FROM public.venues WHERE id = p_venue_id;
  IF NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = p_schedule_id AND s.venue_id = v.id
    AND s.tenant_id = v.tenant_id AND s.festival_id = v.festival_id) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN code_letter_private.edit(v.tenant_id, p_schedule_id, p_registration_id, p_code_letter,
    p_expected_letter, p_expected_swap_id, true, v.id, v.festival_id);
END $$;
CREATE OR REPLACE FUNCTION public.stage_venue_portal_draw_letters(p_venue_id uuid, p_pin text, p_schedule_id uuid,
  p_overwrite boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v public.venues; pin_error text;
BEGIN
  pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF pin_error IS NOT NULL THEN RETURN pg_catalog.jsonb_build_object('error', pin_error); END IF;
  SELECT * INTO v FROM public.venues WHERE id = p_venue_id;
  IF NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = p_schedule_id AND s.venue_id = v.id
    AND s.tenant_id = v.tenant_id AND s.festival_id = v.festival_id) THEN
    RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  RETURN code_letter_private.draw(v.tenant_id, p_schedule_id, p_overwrite, true, v.id, v.festival_id);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA code_letter_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stage_edit_code_letter(uuid,uuid,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_draw_code_letters(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_edit_code_letter(uuid,uuid,text,text,uuid),
  public.stage_draw_code_letters(uuid,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.stage_venue_portal_edit_code_letter(uuid,text,uuid,uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_edit_code_letter(uuid,text,uuid,uuid,text,text,uuid) TO anon, authenticated;
COMMENT ON COLUMN public.registrations.code_letter_fixed IS 'Explicit manual assignment; preserved during draws and redraws. Cleared when code_letter is cleared.';
NOTIFY pgrst, 'reload schema';
COMMIT;
