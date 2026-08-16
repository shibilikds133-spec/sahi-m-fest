BEGIN;

-- Verification is the operational gate for code letters. Registration approval
-- is not a separate prerequisite, but rejected registrations remain blocked.
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
    RAISE EXCEPTION 'Code letter must be a single letter from A to Z.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_schedule FROM public.schedules s
  WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN
    RAISE EXCEPTION 'Code letters are locked for this event.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id
    AND (
      r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
      OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The registration is outside the current schedule scope.' USING ERRCODE = '42501';
  END IF;
  IF v_registration.status = 'rejected' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only verified and active registrations can receive a code letter.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id <> v_registration.id
      AND r.festival_id = v_schedule.festival_id
      AND r.item_id = v_schedule.item_id
      AND r.status <> 'rejected'
      AND r.is_verified IS TRUE
      AND upper(trim(r.code_letter)) = upper(trim(p_code_letter))
      AND (
        r.organisation_id IN (SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible)
        OR r.tenant_id IN (SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible)
      )
  ) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.' USING ERRCODE = '23505';
  END IF;

  v_old := to_jsonb(v_registration);
  UPDATE public.registrations SET code_letter = upper(trim(p_code_letter)) WHERE id = v_registration.id;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (
    v_tenant_id, auth.uid(), 'stage_management_code_letter_update', 'registrations', v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id)
  );

  RETURN jsonb_build_object('registration_id', v_registration.id, 'code_letter', upper(trim(p_code_letter)));
END;
$$;

REVOKE ALL ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
