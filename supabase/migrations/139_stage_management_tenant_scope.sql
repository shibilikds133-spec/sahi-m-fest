-- Stage Management tenant/festival security boundary.
--
-- The Stage Management UI is an operational surface, not a public schedule
-- page.  All reads and writes below derive the caller's tenant from profiles
-- and require an authenticated admin/superadmin session.

BEGIN;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS is_shuffle_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.schedules
  ADD COLUMN IF NOT EXISTS shuffle_locked_at timestamptz;

CREATE OR REPLACE FUNCTION public.stage_assert_admin_access()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_role text;
  v_is_superadmin boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Stage Management requires an authenticated account.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.tenant_id, p.role, COALESCE(p.is_superadmin, false)
    INTO v_tenant_id, v_role, v_is_superadmin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_tenant_id IS NULL OR (v_role <> 'admin' AND NOT v_is_superadmin) THEN
    RAISE EXCEPTION 'Stage Management is restricted to festival administrators.'
      USING ERRCODE = '42501';
  END IF;

  RETURN v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_management_context()
RETURNS TABLE (
  tenant_id uuid,
  festival_id uuid,
  festival_name text,
  festival_level text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  RETURN QUERY
  SELECT f.tenant_id,
         f.id,
         COALESCE(NULLIF(trim(f.custom_name), ''),
                  initcap(COALESCE(f.level, 'festival')) || ' Festival'),
         f.level
  FROM public.festival_calendar f
  WHERE f.tenant_id = v_tenant_id
    AND f.is_active IS TRUE
  ORDER BY f.festival_year DESC, f.start_date DESC NULLS LAST, f.id DESC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_management_schedules(p_festival_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  festival_id uuid,
  item_id uuid,
  venue_id uuid,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  is_shuffle_locked boolean,
  shuffle_locked_at timestamptz,
  item_code text,
  item_name_en text,
  item_name_ml text,
  category_codes text[],
  venue_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF NOT EXISTS (
    SELECT 1 FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT s.id, s.tenant_id, s.festival_id, s.item_id, s.venue_id,
         s.start_time, s.end_time, s.status,
         COALESCE(s.is_shuffle_locked, false), s.shuffle_locked_at,
         i.item_code, i.item_name_en, i.item_name_ml, i.category_codes,
         v.name
  FROM public.schedules s
  JOIN public.items i
    ON i.id = s.item_id
   AND i.tenant_id = v_tenant_id
   AND i.festival_id = p_festival_id
  LEFT JOIN public.venues v
    ON v.id = s.venue_id
   AND v.tenant_id = v_tenant_id
   AND v.festival_id = p_festival_id
  WHERE s.tenant_id = v_tenant_id
    AND s.festival_id = p_festival_id
  ORDER BY s.start_time NULLS LAST, s.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations(
  p_schedule_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  participant_id uuid,
  organisation_id uuid,
  status text,
  is_verified boolean,
  code_letter text,
  participant_name text,
  participant_chest_number text,
  participant_category_code text,
  organisation_name text,
  organisation_type text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_festival_id uuid;
  v_item_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id, s.item_id
      INTO v_festival_id, v_item_id
    FROM public.schedules s
    WHERE s.id = p_schedule_id
      AND s.tenant_id = v_tenant_id;

    IF v_festival_id IS NULL THEN
      RAISE EXCEPTION 'The requested schedule does not belong to this tenant.'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f
      WHERE f.id = v_festival_id
        AND f.tenant_id = v_tenant_id
        AND f.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'The requested festival is not active for this tenant.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id,
         r.status, r.is_verified, r.code_letter,
         p.name, p.chest_number, p.category_code,
         o.name, o.org_type
  FROM public.registrations r
  JOIN public.participants p
    ON p.id = r.participant_id
   AND p.tenant_id = v_tenant_id
   AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = r.organisation_id
  WHERE r.tenant_id = v_tenant_id
    AND r.festival_id = v_festival_id
    AND (v_item_id IS NULL OR r.item_id = v_item_id)
  ORDER BY p.chest_number NULLS LAST, p.name, r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_update_registration(
  p_schedule_id uuid,
  p_registration_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN
    RAISE EXCEPTION 'This event is locked. Unlock it before changing check-in status.'
      USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id
    AND r.tenant_id = v_tenant_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The registration is outside the current schedule scope.'
      USING ERRCODE = '42501';
  END IF;

  v_old := to_jsonb(v_registration);

  IF p_action = 'verify' THEN
    UPDATE public.registrations SET is_verified = true WHERE id = v_registration.id;
  ELSIF p_action = 'unverify' THEN
    UPDATE public.registrations SET is_verified = false WHERE id = v_registration.id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.registrations
       SET status = 'rejected', is_verified = false, code_letter = NULL
     WHERE id = v_registration.id;
  ELSIF p_action = 'restore' THEN
    UPDATE public.registrations
       SET status = 'approved', is_verified = false
     WHERE id = v_registration.id;
  ELSE
    RAISE EXCEPTION 'Unsupported Stage Management registration action.'
      USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    v_tenant_id, auth.uid(), 'stage_management_' || p_action, 'registrations',
    v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id)
  );

  RETURN jsonb_build_object('registration_id', v_registration.id, 'action', p_action);
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_update_code_letter(
  p_schedule_id uuid,
  p_registration_id uuid,
  p_code_letter text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_registration public.registrations%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_code_letter IS NULL OR upper(trim(p_code_letter)) !~ '^[A-Z]$' THEN
    RAISE EXCEPTION 'Code letter must be a single letter from A to Z.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.'
      USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN
    RAISE EXCEPTION 'Code letters are locked for this event.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id
    AND r.tenant_id = v_tenant_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The registration is outside the current schedule scope.'
      USING ERRCODE = '42501';
  END IF;
  IF v_registration.status <> 'approved' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only approved and verified registrations can receive a code letter.'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id <> v_registration.id
      AND r.tenant_id = v_tenant_id
      AND r.festival_id = v_schedule.festival_id
      AND r.item_id = v_schedule.item_id
      AND r.status = 'approved'
      AND r.is_verified IS TRUE
      AND upper(trim(r.code_letter)) = upper(trim(p_code_letter))
  ) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.'
      USING ERRCODE = '23505';
  END IF;

  v_old := to_jsonb(v_registration);
  UPDATE public.registrations
     SET code_letter = upper(trim(p_code_letter))
   WHERE id = v_registration.id;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    v_tenant_id, auth.uid(), 'stage_management_code_letter_update', 'registrations',
    v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id)
  );

  RETURN jsonb_build_object('registration_id', v_registration.id, 'code_letter', upper(trim(p_code_letter)));
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_update_schedule_lock(
  p_schedule_id uuid,
  p_locked boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.'
      USING ERRCODE = '42501';
  END IF;

  v_old := to_jsonb(v_schedule);
  UPDATE public.schedules
     SET is_shuffle_locked = p_locked,
         shuffle_locked_at = CASE WHEN p_locked THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = p_schedule_id AND tenant_id = v_tenant_id;
  SELECT to_jsonb(s) INTO v_new FROM public.schedules s WHERE s.id = p_schedule_id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    v_tenant_id, auth.uid(), CASE WHEN p_locked THEN 'stage_management_schedule_lock' ELSE 'stage_management_schedule_unlock' END,
    'schedules', p_schedule_id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id)
  );

  RETURN jsonb_build_object('schedule_id', p_schedule_id, 'locked', p_locked);
END;
$$;

REVOKE ALL ON FUNCTION public.stage_assert_admin_access() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_stage_management_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_stage_management_schedules(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_update_registration(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stage_update_schedule_lock(uuid, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_stage_management_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stage_management_schedules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_update_registration(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stage_update_schedule_lock(uuid, boolean) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
