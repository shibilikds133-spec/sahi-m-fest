-- Standalone, venue-scoped Stage Management access using a generated PIN.
-- PIN storage and rate-limit state live outside the exposed Data API schemas.
BEGIN;

CREATE SCHEMA IF NOT EXISTS stage_portal_private;
REVOKE ALL ON SCHEMA stage_portal_private FROM PUBLIC, anon, authenticated;

-- Repeat the idempotent Stage Management lock columns from migration 139 so
-- this portal migration also validates cleanly against older cloned schemas.
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS is_shuffle_locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS shuffle_locked_at timestamptz;

CREATE TABLE stage_portal_private.venue_access_codes (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  festival_id uuid NOT NULL,
  pin text NOT NULL CHECK (pin ~ '^[0-9]{4}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, pin)
);

CREATE TABLE stage_portal_private.pin_attempts (
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  attempt_key text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  PRIMARY KEY (venue_id, attempt_key)
);

ALTER TABLE stage_portal_private.venue_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_portal_private.pin_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA stage_portal_private FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA stage_portal_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION stage_portal_private.generate_venue_pin(
  p_venue_id uuid, p_tenant_id uuid, p_festival_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_pin text;
  v_random bytea;
  v_try integer := 0;
BEGIN
  WHILE v_try < 100 LOOP
    v_try := v_try + 1;
    v_random := extensions.gen_random_bytes(2);
    v_pin := lpad(((pg_catalog.get_byte(v_random, 0) * 256 + pg_catalog.get_byte(v_random, 1)) % 10000)::text, 4, '0');
    BEGIN
      INSERT INTO stage_portal_private.venue_access_codes (venue_id, tenant_id, festival_id, pin)
      VALUES (p_venue_id, p_tenant_id, p_festival_id, v_pin)
      ON CONFLICT (venue_id) DO UPDATE
        SET tenant_id = EXCLUDED.tenant_id,
            festival_id = EXCLUDED.festival_id,
            pin = EXCLUDED.pin,
            created_at = pg_catalog.now();
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not allocate a unique stage PIN for this festival.';
END;
$function$;

CREATE OR REPLACE FUNCTION stage_portal_private.ensure_venue_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.id IS NULL OR NEW.tenant_id IS NULL OR NEW.festival_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.tenant_id = NEW.tenant_id AND OLD.festival_id = NEW.festival_id
     AND EXISTS (SELECT 1 FROM stage_portal_private.venue_access_codes c WHERE c.venue_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  PERFORM stage_portal_private.generate_venue_pin(NEW.id, NEW.tenant_id, NEW.festival_id);
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_ensure_stage_venue_pin
AFTER INSERT OR UPDATE OF tenant_id, festival_id ON public.venues
FOR EACH ROW EXECUTE FUNCTION stage_portal_private.ensure_venue_pin();

DO $backfill$
DECLARE
  v_venue record;
BEGIN
  FOR v_venue IN
    SELECT v.id, v.tenant_id, v.festival_id FROM public.venues v
    LEFT JOIN stage_portal_private.venue_access_codes c ON c.venue_id = v.id
    WHERE c.venue_id IS NULL
    ORDER BY v.festival_id, v.id
  LOOP
    IF v_venue.tenant_id IS NOT NULL AND v_venue.festival_id IS NOT NULL THEN
      PERFORM stage_portal_private.generate_venue_pin(v_venue.id, v_venue.tenant_id, v_venue.festival_id);
    END IF;
  END LOOP;
END;
$backfill$;

CREATE OR REPLACE FUNCTION stage_portal_private.assert_pin(p_venue_id uuid, p_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_code stage_portal_private.venue_access_codes%ROWTYPE;
  v_headers jsonb;
  v_attempt_key text;
  v_attempt stage_portal_private.pin_attempts%ROWTYPE;
BEGIN
  IF p_venue_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RETURN 'Invalid stage link or PIN.';
  END IF;

  v_headers := COALESCE(NULLIF(pg_catalog.current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_attempt_key := pg_catalog.md5(COALESCE(
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip',
    v_headers ->> 'x-forwarded-for',
    'unknown'
  ));

  SELECT * INTO v_attempt
  FROM stage_portal_private.pin_attempts a
  WHERE a.venue_id = p_venue_id AND a.attempt_key = v_attempt_key;
  IF FOUND AND v_attempt.locked_until > pg_catalog.now() THEN
    RETURN 'Too many incorrect PIN attempts. Please wait before trying again.';
  END IF;

  SELECT * INTO v_code FROM stage_portal_private.venue_access_codes c
  WHERE c.venue_id = p_venue_id;
  IF NOT FOUND OR v_code.pin <> p_pin THEN
    INSERT INTO stage_portal_private.pin_attempts (venue_id, attempt_key, attempts, window_started_at, locked_until)
    VALUES (p_venue_id, v_attempt_key, 1, pg_catalog.now(), NULL)
    ON CONFLICT (venue_id, attempt_key) DO UPDATE SET
      attempts = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now() - interval '10 minutes'
        THEN 1 ELSE stage_portal_private.pin_attempts.attempts + 1 END,
      window_started_at = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now() - interval '10 minutes'
        THEN pg_catalog.now() ELSE stage_portal_private.pin_attempts.window_started_at END,
      locked_until = CASE WHEN stage_portal_private.pin_attempts.window_started_at < pg_catalog.now() - interval '10 minutes'
        THEN NULL WHEN stage_portal_private.pin_attempts.attempts + 1 >= 8
        THEN pg_catalog.now() + interval '5 minutes' ELSE NULL END;
    RETURN 'Incorrect PIN.';
  END IF;

  DELETE FROM stage_portal_private.pin_attempts a
  WHERE a.venue_id = p_venue_id AND a.attempt_key = v_attempt_key;
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_stage_management_venue_codes(p_festival_id uuid)
RETURNS TABLE (venue_id uuid, pin text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, c.pin
  FROM public.venues v
  JOIN stage_portal_private.venue_access_codes c ON c.venue_id = v.id
  WHERE v.tenant_id = v_tenant_id AND v.festival_id = p_festival_id
  ORDER BY v.name, v.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_data(p_venue_id uuid, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedules jsonb;
  v_registrations jsonb;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stage not found.' USING ERRCODE = 'P0002'; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', s.id, 'tenant_id', s.tenant_id, 'festival_id', s.festival_id, 'item_id', s.item_id,
    'venue_id', s.venue_id, 'start_time', s.start_time, 'end_time', s.end_time, 'status', s.status,
    'is_shuffle_locked', COALESCE(s.is_shuffle_locked, false), 'shuffle_locked_at', s.shuffle_locked_at,
    'item_code', i.item_code, 'item_name_en', i.item_name_en, 'item_name_ml', i.item_name_ml,
    'category_codes', i.category_codes, 'venue_name', v_venue.name,
    'registration_scope_ambiguous', (SELECT count(*) > 1 FROM public.schedules same_item
      WHERE same_item.tenant_id = s.tenant_id AND same_item.festival_id = s.festival_id AND same_item.item_id = s.item_id)
  ) ORDER BY s.start_time NULLS LAST, s.id), '[]'::jsonb)
  INTO v_schedules
  FROM public.schedules s
  JOIN public.items i ON i.id = s.item_id AND i.tenant_id = v_venue.tenant_id AND i.festival_id = v_venue.festival_id
  WHERE s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'schedule_id', s.id, 'item_id', r.item_id, 'participant_id', r.participant_id,
    'organisation_id', COALESCE(r.organisation_id, p.organisation_id), 'status', r.status,
    'is_verified', r.is_verified, 'code_letter', r.code_letter,
    'participant_name', CASE WHEN r.entry_kind = 'general_team' THEN COALESCE(o.name, 'General team') ELSE p.name END,
    'participant_chest_number', COALESCE(r.entry_chest_number, p.chest_number),
    'participant_category_code', CASE WHEN r.entry_kind = 'general_team' THEN 'GN' ELSE p.category_code END,
    'organisation_name', o.name, 'organisation_type', o.org_type,
    'entry_kind', r.entry_kind,
    'members', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', gp.name, 'chest_number', gp.chest_number)
      ORDER BY gp.chest_number NULLS LAST, gp.name)
      FROM public.group_members gm JOIN public.participants gp ON gp.id = gm.participant_id
      WHERE gm.registration_id = r.id), '[]'::jsonb)
  ) ORDER BY COALESCE(r.entry_chest_number, p.chest_number) NULLS LAST, p.name, r.id), '[]'::jsonb)
  INTO v_registrations
  FROM public.schedules s
  JOIN public.registrations r ON r.item_id = s.item_id AND r.festival_id = s.festival_id
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.festival_id = v_venue.festival_id
  LEFT JOIN public.organisations o ON o.id = COALESCE(r.organisation_id, p.organisation_id)
  WHERE s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id
    AND (SELECT count(*) FROM public.schedules same_item WHERE same_item.tenant_id = s.tenant_id
      AND same_item.festival_id = s.festival_id AND same_item.item_id = s.item_id) = 1
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible))
    AND (r.entry_kind = 'general_team' OR p.id IS NOT NULL);

  RETURN jsonb_build_object(
    'venue', jsonb_build_object('id', v_venue.id, 'name', v_venue.name, 'location', v_venue.location),
    'schedules', v_schedules,
    'registrations', v_registrations
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_update_registration(
  p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_action text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules s WHERE s.id = p_schedule_id
    AND s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other_schedule WHERE other_schedule.tenant_id = v_schedule.tenant_id
    AND other_schedule.festival_id = v_schedule.festival_id AND other_schedule.item_id = v_schedule.item_id
    AND other_schedule.id <> v_schedule.id) THEN
    RAISE EXCEPTION 'This item is scheduled at more than one stage. Registration ownership is ambiguous; ask an administrator to resolve the schedule before editing.' USING ERRCODE = '55000';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN RAISE EXCEPTION 'This event is locked.' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id AND r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)));
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF p_action NOT IN ('verify', 'unverify', 'reject', 'restore') THEN RAISE EXCEPTION 'Unsupported action.' USING ERRCODE = '22023'; END IF;
  v_old := to_jsonb(v_registration);
  IF p_action = 'verify' THEN UPDATE public.registrations SET is_verified = true WHERE id = p_registration_id;
  ELSIF p_action = 'unverify' THEN UPDATE public.registrations SET is_verified = false WHERE id = p_registration_id;
  ELSIF p_action = 'reject' THEN UPDATE public.registrations SET status = 'rejected', is_verified = false, code_letter = NULL WHERE id = p_registration_id;
  ELSE UPDATE public.registrations SET status = 'approved', is_verified = false WHERE id = p_registration_id;
  END IF;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = p_registration_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_portal_' || p_action, 'registrations', p_registration_id,
    v_old || jsonb_build_object('schedule_id', p_schedule_id, 'venue_id', p_venue_id),
    v_new || jsonb_build_object('schedule_id', p_schedule_id, 'venue_id', p_venue_id));
  RETURN jsonb_build_object('registration_id', p_registration_id, 'action', p_action);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_update_code_letter(
  p_venue_id uuid, p_pin text, p_schedule_id uuid, p_registration_id uuid, p_code_letter text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  IF p_code_letter IS NULL OR pg_catalog.upper(trim(p_code_letter)) !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Code letter must be a single letter from A to Z.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules s WHERE s.id = p_schedule_id
    AND s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other_schedule WHERE other_schedule.tenant_id = v_schedule.tenant_id
    AND other_schedule.festival_id = v_schedule.festival_id AND other_schedule.item_id = v_schedule.item_id
    AND other_schedule.id <> v_schedule.id) THEN
    RAISE EXCEPTION 'This item is scheduled at more than one stage. Registration ownership is ambiguous; ask an administrator to resolve the schedule before editing.' USING ERRCODE = '55000';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN RAISE EXCEPTION 'Code letters are locked.' USING ERRCODE = '55000'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_schedule.festival_id::text || ':' || v_schedule.item_id::text, 0));
  SELECT * INTO v_registration FROM public.registrations r WHERE r.id = p_registration_id
    AND r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)));
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF v_registration.status = 'rejected' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified and active registrations can receive a code letter.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.id <> p_registration_id
    AND r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE
    AND pg_catalog.upper(trim(r.code_letter)) = pg_catalog.upper(trim(p_code_letter))
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)))) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.' USING ERRCODE = '23505';
  END IF;
  UPDATE public.registrations SET code_letter = pg_catalog.upper(trim(p_code_letter)) WHERE id = p_registration_id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_portal_code_letter_update', 'registrations', p_registration_id,
    to_jsonb(v_registration) || jsonb_build_object('venue_id', p_venue_id, 'schedule_id', p_schedule_id),
    (to_jsonb(v_registration) - 'code_letter') || jsonb_build_object('code_letter', pg_catalog.upper(trim(p_code_letter)), 'venue_id', p_venue_id, 'schedule_id', p_schedule_id));
  RETURN jsonb_build_object('registration_id', p_registration_id, 'code_letter', pg_catalog.upper(trim(p_code_letter)));
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_draw_letters(
  p_venue_id uuid, p_pin text, p_schedule_id uuid, p_overwrite boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_registration record;
  v_participant_ids uuid[];
  v_conflicts text[];
  v_pool text[];
  v_used text[] := ARRAY[]::text[];
  v_letter text;
  v_start integer;
  v_count integer := 0;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  SELECT * INTO v_schedule FROM public.schedules s WHERE s.id = p_schedule_id
    AND s.venue_id = p_venue_id AND s.tenant_id = v_venue.tenant_id AND s.festival_id = v_venue.festival_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other_schedule WHERE other_schedule.tenant_id = v_schedule.tenant_id
    AND other_schedule.festival_id = v_schedule.festival_id AND other_schedule.item_id = v_schedule.item_id
    AND other_schedule.id <> v_schedule.id) THEN
    RAISE EXCEPTION 'This item is scheduled at more than one stage. Registration ownership is ambiguous; ask an administrator to resolve the schedule before editing.' USING ERRCODE = '55000';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN RAISE EXCEPTION 'Code letters are locked.' USING ERRCODE = '55000'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_schedule.festival_id::text || ':' || v_schedule.item_id::text, 0));

  IF p_overwrite THEN
    UPDATE public.registrations r SET code_letter = NULL
    WHERE r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
      AND r.status <> 'rejected' AND r.is_verified IS TRUE
      AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
        OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
        OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
          AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)));
  END IF;

  SELECT COALESCE(pg_catalog.max(pg_catalog.ascii(r.code_letter)), 64) - 64
    INTO v_start
  FROM public.registrations r
  WHERE r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter ~ '^[A-Z]$'
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)));
  v_start := greatest(1, v_start + 1);
  SELECT COALESCE(pg_catalog.array_agg(chr(n) ORDER BY pg_catalog.random()), ARRAY[]::text[])
    INTO v_pool FROM pg_catalog.generate_series(65 + v_start - 1, 90) n;
  IF pg_catalog.cardinality(v_pool) = 0 THEN RAISE EXCEPTION 'No unused code letters remain.' USING ERRCODE = '22023'; END IF;

  SELECT COALESCE(pg_catalog.array_agg(DISTINCT r.code_letter), ARRAY[]::text[]) INTO v_used
  FROM public.registrations r WHERE r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter IS NOT NULL
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)));

  FOR v_registration IN
    SELECT r.* FROM public.registrations r
    WHERE r.item_id = v_schedule.item_id AND r.festival_id = v_schedule.festival_id
      AND r.status <> 'rejected' AND r.is_verified IS TRUE AND r.code_letter IS NULL
      AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
        OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
        OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
          AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)))
    ORDER BY COALESCE(r.entry_chest_number, (SELECT p.chest_number FROM public.participants p WHERE p.id = r.participant_id)) NULLS LAST, r.id
  LOOP
    IF v_registration.participant_id IS NOT NULL THEN
      v_participant_ids := ARRAY[v_registration.participant_id];
    ELSE
      SELECT COALESCE(pg_catalog.array_agg(gm.participant_id), ARRAY[]::uuid[]) INTO v_participant_ids
      FROM public.group_members gm WHERE gm.registration_id = v_registration.id AND gm.participant_id IS NOT NULL;
      IF pg_catalog.cardinality(v_participant_ids) = 0 THEN
        RAISE EXCEPTION 'A General team entry has no roster; code letters cannot be assigned safely.' USING ERRCODE = '22023';
      END IF;
    END IF;

    SELECT COALESCE(pg_catalog.array_agg(DISTINCT r2.code_letter), ARRAY[]::text[]) INTO v_conflicts
    FROM public.registrations r2
    JOIN public.schedules s2 ON s2.item_id = r2.item_id AND s2.festival_id = r2.festival_id
    WHERE r2.festival_id = v_schedule.festival_id AND r2.code_letter IS NOT NULL
      AND r2.participant_id = ANY(v_participant_ids) AND s2.id <> v_schedule.id
      AND v_schedule.start_time IS NOT NULL AND v_schedule.end_time IS NOT NULL
      AND s2.start_time IS NOT NULL AND s2.end_time IS NOT NULL
      AND s2.start_time < v_schedule.end_time AND s2.end_time > v_schedule.start_time;

    SELECT candidate INTO v_letter
    FROM unnest(v_pool) AS candidate
    WHERE NOT (candidate = ANY(v_used)) AND NOT (candidate = ANY(v_conflicts))
    ORDER BY (SELECT pg_catalog.min(pg_catalog.abs(pg_catalog.ascii(candidate) - pg_catalog.ascii(conflict))) FROM unnest(v_conflicts) AS conflict) DESC NULLS FIRST,
      pg_catalog.random()
    LIMIT 1;
    IF v_letter IS NULL THEN
      SELECT candidate INTO v_letter FROM unnest(v_pool) AS candidate
      WHERE NOT (candidate = ANY(v_used)) ORDER BY pg_catalog.random() LIMIT 1;
    END IF;
    IF v_letter IS NULL THEN RAISE EXCEPTION 'Not enough unique code letters available.' USING ERRCODE = '22023'; END IF;

    UPDATE public.registrations SET code_letter = v_letter WHERE id = v_registration.id;
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_portal_code_letter_draw', 'registrations', v_registration.id,
      to_jsonb(v_registration) || jsonb_build_object('venue_id', p_venue_id, 'schedule_id', p_schedule_id),
      (to_jsonb(v_registration) - 'code_letter') || jsonb_build_object('code_letter', v_letter, 'venue_id', p_venue_id, 'schedule_id', p_schedule_id));
    v_used := pg_catalog.array_append(v_used, v_letter);
    v_pool := pg_catalog.array_remove(v_pool, v_letter);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.item_id = v_schedule.item_id
    AND r.festival_id = v_schedule.festival_id AND r.status <> 'rejected' AND r.is_verified IS TRUE
    AND r.code_letter IS NOT NULL
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_venue.tenant_id) visible)
      OR EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id
        AND p.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_venue.tenant_id) visible)))) THEN
    RAISE EXCEPTION 'No verified active entries are available for the draw.' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('schedule_id', p_schedule_id, 'assigned', v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.stage_venue_portal_lock_schedule(p_venue_id uuid, p_pin text, p_schedule_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_venue public.venues%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_pin_error text;
BEGIN
  v_pin_error := stage_portal_private.assert_pin(p_venue_id, p_pin);
  IF v_pin_error IS NOT NULL THEN RETURN jsonb_build_object('error', v_pin_error); END IF;
  SELECT * INTO v_venue FROM public.venues v WHERE v.id = p_venue_id;
  UPDATE public.schedules SET is_shuffle_locked = true, shuffle_locked_at = pg_catalog.now(), updated_at = pg_catalog.now()
  WHERE id = p_schedule_id AND venue_id = p_venue_id AND tenant_id = v_venue.tenant_id AND festival_id = v_venue.festival_id
  RETURNING * INTO v_schedule;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside this stage.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.schedules other_schedule WHERE other_schedule.tenant_id = v_schedule.tenant_id
    AND other_schedule.festival_id = v_schedule.festival_id AND other_schedule.item_id = v_schedule.item_id
    AND other_schedule.id <> v_schedule.id) THEN
    RAISE EXCEPTION 'This item is scheduled at more than one stage. Registration ownership is ambiguous; ask an administrator to resolve the schedule before editing.' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'stage_venue_portal_schedule_lock', 'schedules', p_schedule_id,
    to_jsonb(v_schedule) || jsonb_build_object('is_shuffle_locked', false), to_jsonb(v_schedule));
  RETURN jsonb_build_object('schedule_id', p_schedule_id, 'locked', true);
END;
$function$;

-- Serialize existing authenticated-admin assignments with PIN-portal draws and
-- edits so the two supported paths cannot race into duplicate letters.
CREATE OR REPLACE FUNCTION public.stage_update_code_letter(
  p_schedule_id uuid, p_registration_id uuid, p_code_letter text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();
  IF p_code_letter IS NULL OR upper(trim(p_code_letter)) !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Code letter must be a single letter from A to Z.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Schedule is outside the current tenant scope.' USING ERRCODE = '42501'; END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN RAISE EXCEPTION 'Code letters are locked for this event.' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id AND r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible));
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration is outside the current schedule scope.' USING ERRCODE = '42501'; END IF;
  IF v_registration.status = 'rejected' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified and active registrations can receive a code letter.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_schedule.festival_id::text || ':' || v_schedule.item_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.id <> v_registration.id
    AND r.festival_id = v_schedule.festival_id AND r.item_id = v_schedule.item_id
    AND r.status <> 'rejected' AND r.is_verified IS TRUE
    AND upper(trim(r.code_letter)) = upper(trim(p_code_letter))
    AND (r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible))) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.' USING ERRCODE = '23505';
  END IF;

  v_old := to_jsonb(v_registration);
  UPDATE public.registrations SET code_letter = upper(trim(p_code_letter)) WHERE id = v_registration.id;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'stage_management_code_letter_update', 'registrations', v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id));
  RETURN jsonb_build_object('registration_id', v_registration.id, 'code_letter', upper(trim(p_code_letter)));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_stage_management_venue_codes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_venue_portal_data(uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.stage_venue_portal_update_code_letter(uuid, text, uuid, uuid, text) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.stage_venue_portal_draw_letters(uuid, text, uuid, boolean) FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.stage_venue_portal_lock_schedule(uuid, text, uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stage_management_venue_codes(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_data(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_update_registration(uuid, text, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_update_code_letter(uuid, text, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_draw_letters(uuid, text, uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_venue_portal_lock_schedule(uuid, text, uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION stage_portal_private.ensure_venue_pin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION stage_portal_private.generate_venue_pin(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION stage_portal_private.assert_pin(uuid, text) FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

