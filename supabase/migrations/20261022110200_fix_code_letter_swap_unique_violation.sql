-- Unique indexes are checked per row update in PostgreSQL. Release both
-- existing letters before assigning the swapped pair so swaps work with the
-- deployment's immediate unique code-letter index.
BEGIN;

CREATE OR REPLACE FUNCTION code_letter_private.edit(tenant uuid, schedule uuid, registration uuid, letter text,
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

  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO before_rows
    FROM public.registrations r WHERE r.id IN (source.id, target.id);

  IF target.id IS NULL THEN
    UPDATE public.registrations r SET code_letter = letter, code_letter_fixed = true WHERE r.id = source.id;
  ELSE
    -- NULL is excluded from the deployment's unique index. Both letters are
    -- released first; assigning the distinct final values then cannot collide,
    -- regardless of row update order. Both statements remain in this RPC's
    -- transaction, so other sessions never observe the intermediate values.
    UPDATE public.registrations r SET code_letter = NULL, code_letter_fixed = false
      WHERE r.id IN (source.id, target.id);
    UPDATE public.registrations r
      SET code_letter = CASE WHEN r.id = source.id THEN letter ELSE source.code_letter END,
          code_letter_fixed = true
      WHERE r.id IN (source.id, target.id);
  END IF;

  SELECT pg_catalog.jsonb_agg(to_jsonb(r)) INTO changed
    FROM public.registrations r WHERE r.id IN (source.id, target.id);
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

CREATE OR REPLACE FUNCTION code_letter_private.draw(tenant uuid, schedule uuid, overwrite boolean, portal boolean,
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

  -- Redraws can permute existing automatic letters. Clear the entries being
  -- reassigned first so an immediate unique index never sees a transient clash.
  UPDATE public.registrations r SET code_letter = NULL, code_letter_fixed = false
    WHERE r.code_letter IS NOT NULL AND r.id IN (
      SELECT allocation.value::uuid FROM pg_catalog.jsonb_each_text(matching) allocation
    );
  UPDATE public.registrations r SET code_letter = allocation.key, code_letter_fixed = false
    FROM pg_catalog.jsonb_each_text(matching) allocation WHERE r.id = allocation.value::uuid;
  INSERT INTO public.audit_logs(tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    SELECT tenant, auth.uid(), 'code_letter_draw', 'registrations', r.id,
      old_row || pg_catalog.jsonb_build_object('schedule_id', schedule),
      to_jsonb(r) || pg_catalog.jsonb_build_object('schedule_id', schedule)
    FROM pg_catalog.jsonb_array_elements(before_rows) old_row JOIN public.registrations r ON r.id = (old_row->>'id')::uuid;
  RETURN pg_catalog.jsonb_build_object('assigned', remaining, 'fixed', total_fixed, 'conflictsUnavoidable', conflict_fallback);
END $$;

COMMIT;
