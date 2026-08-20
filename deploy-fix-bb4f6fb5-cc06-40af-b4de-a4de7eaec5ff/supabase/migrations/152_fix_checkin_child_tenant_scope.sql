-- 152_fix_checkin_child_tenant_scope.sql
-- Check-in and stage operations are owned by the parent festival tenant, while
-- participant registrations are stored under descendant organisation tenants.
-- Keep the schedule/festival/item boundary strict and expand only the tenant
-- side of the read/write scope to the caller's visible organisation tree.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_schedule_registrations(p_schedule_id uuid)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  participant_id uuid,
  organisation_id uuid,
  festival_id uuid,
  tenant_id uuid,
  status text,
  is_verified boolean,
  code_letter text,
  participants jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
  v_schedule public.schedules%ROWTYPE;
  v_festival_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  SELECT s.* INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND s.tenant_id = v_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The requested schedule is outside the current tenant scope.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(v_schedule.festival_id, i.festival_id)
    INTO v_festival_id
  FROM public.items i
  WHERE i.id = v_schedule.item_id;

  IF v_festival_id IS NULL THEN
    RAISE EXCEPTION 'The schedule festival context is missing.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id,
         r.festival_id, r.tenant_id, r.status, r.is_verified, r.code_letter,
         to_jsonb(p) AS participants
  FROM public.registrations r
  JOIN public.participants p
    ON p.id = r.participant_id
   AND p.festival_id = v_festival_id
   AND (
     p.organisation_id IN (
       SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
     )
     OR p.tenant_id IN (
       SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
     )
   )
  WHERE r.festival_id = v_festival_id
    AND r.item_id = v_schedule.item_id
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    )
  ORDER BY p.chest_number NULLS LAST, p.name, r.id;
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
    WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN
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
   AND p.festival_id = v_festival_id
  LEFT JOIN public.organisations o ON o.id = r.organisation_id
  WHERE r.festival_id = v_festival_id
    AND (v_item_id IS NULL OR r.item_id = v_item_id)
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR p.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    )
  ORDER BY p.chest_number NULLS LAST, p.name, r.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_stage_management_registrations_scoped(
  p_schedule_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  schedule_id uuid,
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
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF p_schedule_id IS NOT NULL THEN
    SELECT s.festival_id INTO v_festival_id
    FROM public.schedules s
    WHERE s.id = p_schedule_id AND s.tenant_id = v_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The requested schedule does not belong to this tenant.' USING ERRCODE = '42501';
    END IF;
  ELSE
    v_festival_id := p_festival_id;
    IF v_festival_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.festival_calendar f
      WHERE f.id = v_festival_id AND f.tenant_id = v_tenant_id AND f.is_active IS TRUE
    ) THEN
      RAISE EXCEPTION 'The requested festival is not active for this tenant.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT r.id, s.id, r.item_id, r.participant_id, r.organisation_id,
         r.status, r.is_verified, r.code_letter,
         p.name, p.chest_number, p.category_code,
         o.name, o.org_type
  FROM public.registrations r
  JOIN public.participants p ON p.id = r.participant_id
    AND p.festival_id = v_festival_id
  JOIN public.schedules s ON s.tenant_id = v_tenant_id
    AND s.festival_id = v_festival_id
    AND s.item_id = r.item_id
    AND (p_schedule_id IS NULL OR s.id = p_schedule_id)
  LEFT JOIN public.organisations o ON o.id = r.organisation_id
  WHERE r.festival_id = v_festival_id
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR p.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    )
  ORDER BY p.chest_number NULLS LAST, p.name, r.id, s.id;
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
    RAISE EXCEPTION 'The schedule is outside the current tenant scope.' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(v_schedule.is_shuffle_locked, false) THEN
    RAISE EXCEPTION 'This event is locked. Unlock it before changing check-in status.' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_registration FROM public.registrations r
  WHERE r.id = p_registration_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id
    AND (
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The registration is outside the current schedule scope.' USING ERRCODE = '42501';
  END IF;

  v_old := to_jsonb(v_registration);
  IF p_action = 'verify' THEN
    UPDATE public.registrations SET is_verified = true WHERE id = v_registration.id;
  ELSIF p_action = 'unverify' THEN
    UPDATE public.registrations SET is_verified = false WHERE id = v_registration.id;
  ELSIF p_action = 'reject' THEN
    UPDATE public.registrations SET status = 'rejected', is_verified = false, code_letter = NULL WHERE id = v_registration.id;
  ELSIF p_action = 'restore' THEN
    UPDATE public.registrations SET status = 'approved', is_verified = false WHERE id = v_registration.id;
  ELSE
    RAISE EXCEPTION 'Unsupported Stage Management registration action.' USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'stage_management_' || p_action, 'registrations', v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id));

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
      r.organisation_id IN (
        SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
      )
      OR r.tenant_id IN (
        SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
      )
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The registration is outside the current schedule scope.' USING ERRCODE = '42501';
  END IF;
  IF v_registration.status <> 'approved' OR v_registration.is_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'Only approved and verified registrations can receive a code letter.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id <> v_registration.id
      AND r.festival_id = v_schedule.festival_id
      AND r.item_id = v_schedule.item_id
      AND r.status = 'approved'
      AND r.is_verified IS TRUE
      AND upper(trim(r.code_letter)) = upper(trim(p_code_letter))
      AND (
        r.organisation_id IN (
          SELECT visible.id FROM public.get_visible_organisations(v_tenant_id) visible
        )
        OR r.tenant_id IN (
          SELECT visible.tenant_id FROM public.get_visible_organisations(v_tenant_id) visible
        )
      )
  ) THEN
    RAISE EXCEPTION 'This code letter is already assigned in the event.' USING ERRCODE = '23505';
  END IF;

  v_old := to_jsonb(v_registration);
  UPDATE public.registrations
     SET code_letter = upper(trim(p_code_letter))
   WHERE id = v_registration.id;
  SELECT to_jsonb(r) INTO v_new FROM public.registrations r WHERE r.id = v_registration.id;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_tenant_id, auth.uid(), 'stage_management_code_letter_update', 'registrations', v_registration.id,
    v_old || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id),
    v_new || jsonb_build_object('festival_id', v_schedule.festival_id, 'schedule_id', p_schedule_id,
      'registration_tenant_id', v_registration.tenant_id));

  RETURN jsonb_build_object('registration_id', v_registration.id, 'code_letter', upper(trim(p_code_letter)));
END;
$$;

REVOKE ALL ON FUNCTION public.get_schedule_registrations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_registrations(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_stage_management_registrations_scoped(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations_scoped(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.stage_update_registration(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_update_registration(uuid, uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_update_code_letter(uuid, uuid, text) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
