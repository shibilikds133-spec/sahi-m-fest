-- Safe participant-item unassignment.
-- This intentionally does not cascade into marks, results, attendance, or
-- group data. A registration can only be physically removed before any
-- operational competition data is attached to it.

CREATE OR REPLACE FUNCTION public.safe_unassign_registration(
  p_registration_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration public.registrations%ROWTYPE;
  v_item_name text;
  v_item_code text;
  v_participation_type text;
  v_is_group boolean := false;
  v_mark_count integer := 0;
  v_result_count integer := 0;
  v_published_result_count integer := 0;
  v_attendance_count integer := 0;
  v_group_member_count integer := 0;
  v_dependencies jsonb := '[]'::jsonb;
  v_block_message text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT r.*
    INTO v_registration
  FROM public.registrations r
  WHERE r.id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'registration_id', p_registration_id
    );
  END IF;

  -- Keep the same organisation visibility boundary used by registrations RLS.
  IF NOT (public.is_superadmin() OR public.is_org_visible(v_registration.organisation_id)) THEN
    RAISE EXCEPTION 'Permission denied for this registration';
  END IF;

  SELECT i.item_name_en, i.item_code, i.participation_type
    INTO v_item_name, v_item_code, v_participation_type
  FROM public.items i
  WHERE i.id = v_registration.item_id;
  v_is_group := coalesce(v_participation_type = 'group', false);

  SELECT count(*)::integer INTO v_mark_count
  FROM public.mark_entries me
  WHERE me.registration_id = v_registration.id;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE coalesce(res.published, false))::integer
    INTO v_result_count, v_published_result_count
  FROM public.results res
  WHERE res.registration_id = v_registration.id;

  -- Attendance is keyed by participant + schedule, while a registration is
  -- keyed by participant + item. Resolve the item through the schedule.
  SELECT count(*)::integer INTO v_attendance_count
  FROM public.attendance a
  JOIN public.schedules s ON s.id = a.schedule_id
  WHERE a.participant_id = v_registration.participant_id
    AND s.item_id = v_registration.item_id
    AND s.festival_id = v_registration.festival_id
    AND a.tenant_id = v_registration.tenant_id;

  SELECT count(*)::integer INTO v_group_member_count
  FROM public.group_members gm
  WHERE gm.registration_id = v_registration.id;

  IF v_mark_count > 0 THEN
    v_dependencies := v_dependencies || jsonb_build_array('judge_marks');
  END IF;
  IF v_result_count > 0 THEN
    v_dependencies := v_dependencies || jsonb_build_array(
      CASE WHEN v_published_result_count > 0 THEN 'published_results_and_points' ELSE 'results_and_points' END
    );
  END IF;
  IF v_attendance_count > 0 THEN
    v_dependencies := v_dependencies || jsonb_build_array('attendance_or_checkin');
  END IF;
  IF coalesce(v_registration.is_verified, false)
     OR nullif(trim(coalesce(v_registration.code_letter, '')), '') IS NOT NULL THEN
    v_dependencies := v_dependencies || jsonb_build_array('stage_status_or_code_letter');
  END IF;
  IF v_group_member_count > 0 THEN
    v_dependencies := v_dependencies || jsonb_build_array('group_members');
  END IF;
  IF v_is_group
     AND v_registration.raw_group_members IS NOT NULL
     AND jsonb_typeof(v_registration.raw_group_members) = 'array'
     AND jsonb_array_length(v_registration.raw_group_members) > 0 THEN
    v_dependencies := v_dependencies || jsonb_build_array('group_registration_snapshot');
  END IF;

  IF jsonb_array_length(v_dependencies) > 0 THEN
    v_block_message := format(
      'This %s assignment cannot be removed because competition data already exists: %s. Historical records were preserved.',
      coalesce(v_item_code, v_item_name, 'item'),
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_dependencies)), ', ')
    );

    INSERT INTO public.audit_logs (
      tenant_id, user_id, action, table_name, record_id, old_value, new_value
    ) VALUES (
      v_registration.tenant_id,
      auth.uid(),
      'UNASSIGN_ITEM_BLOCKED',
      'registrations',
      v_registration.id,
      to_jsonb(v_registration),
      jsonb_build_object(
        'status', 'blocked',
        'reason', nullif(trim(p_reason), ''),
        'dependencies', v_dependencies,
        'participant_id', v_registration.participant_id,
        'item_id', v_registration.item_id,
        'festival_id', v_registration.festival_id,
        'organisation_id', v_registration.organisation_id
      )
    );

    RETURN jsonb_build_object(
      'status', 'blocked',
      'message', v_block_message,
      'registration_id', v_registration.id,
      'participant_id', v_registration.participant_id,
      'item_id', v_registration.item_id,
      'festival_id', v_registration.festival_id,
      'organisation_id', v_registration.organisation_id,
      'dependencies', v_dependencies
    );
  END IF;

  BEGIN
    DELETE FROM public.registrations WHERE id = v_registration.id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- Protect against a dependency added by a future migration that this
    -- function does not yet know about.
    v_block_message := 'This assignment was not removed because dependent competition history exists. Historical records were preserved.';
    INSERT INTO public.audit_logs (
      tenant_id, user_id, action, table_name, record_id, old_value, new_value
    ) VALUES (
      v_registration.tenant_id, auth.uid(), 'UNASSIGN_ITEM_BLOCKED',
      'registrations', v_registration.id, to_jsonb(v_registration),
      jsonb_build_object('status', 'blocked', 'reason', nullif(trim(p_reason), ''), 'database_error', SQLERRM)
    );
    RETURN jsonb_build_object(
      'status', 'blocked',
      'message', v_block_message,
      'registration_id', v_registration.id
    );
  END;

  INSERT INTO public.audit_logs (
    tenant_id, user_id, action, table_name, record_id, old_value, new_value
  ) VALUES (
    v_registration.tenant_id,
    auth.uid(),
    'UNASSIGN_ITEM',
    'registrations',
    v_registration.id,
    to_jsonb(v_registration),
    jsonb_build_object(
      'status', 'removed',
      'reason', nullif(trim(p_reason), ''),
      'participant_id', v_registration.participant_id,
      'item_id', v_registration.item_id,
      'festival_id', v_registration.festival_id,
      'organisation_id', v_registration.organisation_id,
      'removed_by', auth.uid(),
      'removed_at', now()
    )
  );

  RETURN jsonb_build_object(
    'status', 'removed',
    'registration_id', v_registration.id,
    'participant_id', v_registration.participant_id,
    'item_id', v_registration.item_id,
    'festival_id', v_registration.festival_id,
    'organisation_id', v_registration.organisation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.safe_unassign_registration(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_unassign_registration(uuid, text) TO authenticated;
