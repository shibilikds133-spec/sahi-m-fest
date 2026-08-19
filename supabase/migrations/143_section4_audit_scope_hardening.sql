-- Section 4-14 audit hardening.
-- This migration is intentionally additive/reversible at the source level:
-- it narrows unsafe policies, adds schedule-scoped read contracts, and keeps
-- legacy result rows readable while new writes carry schedule_id.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Remove legacy broad authenticated policies.  The existing tenant/org
-- policies remain and the replacements below are explicit.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage their own registrations" ON public.registrations;
-- This legacy policy exposed every registration to anonymous and authenticated
-- callers. Public schedule/status views must use their public-safe views/RPCs;
-- operational registration rows are never a public read contract.
DROP POLICY IF EXISTS "Public select registrations basic" ON public.registrations;

DROP POLICY IF EXISTS results_select_policy ON public.results;
DROP POLICY IF EXISTS results_insert_policy ON public.results;
DROP POLICY IF EXISTS results_update_policy ON public.results;
DROP POLICY IF EXISTS results_delete_policy ON public.results;
DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.results;
DROP POLICY IF EXISTS "Enable all access for admins based on tenant_id" ON public.results;

DROP POLICY IF EXISTS items_select ON public.items;
DROP POLICY IF EXISTS items_insert ON public.items;
DROP POLICY IF EXISTS items_update ON public.items;
DROP POLICY IF EXISTS items_delete ON public.items;
DROP POLICY IF EXISTS items_select_policy ON public.items;
DROP POLICY IF EXISTS items_insert_policy ON public.items;
DROP POLICY IF EXISTS items_update_policy ON public.items;
DROP POLICY IF EXISTS items_delete_policy ON public.items;
DROP POLICY IF EXISTS "Admins can manage their own items" ON public.items;
DROP POLICY IF EXISTS "View local or global items" ON public.items;

DROP POLICY IF EXISTS attendance_select_policy ON public.attendance;
DROP POLICY IF EXISTS attendance_insert_policy ON public.attendance;
DROP POLICY IF EXISTS attendance_update_policy ON public.attendance;
DROP POLICY IF EXISTS attendance_delete_policy ON public.attendance;

DROP POLICY IF EXISTS festival_calendar_select_policy ON public.festival_calendar;
DROP POLICY IF EXISTS festival_calendar_insert_policy ON public.festival_calendar;
DROP POLICY IF EXISTS festival_calendar_update_policy ON public.festival_calendar;
DROP POLICY IF EXISTS festival_calendar_delete_policy ON public.festival_calendar;

DROP POLICY IF EXISTS judges_select_policy ON public.judges;
DROP POLICY IF EXISTS judges_insert_policy ON public.judges;
DROP POLICY IF EXISTS judges_update_policy ON public.judges;
DROP POLICY IF EXISTS judges_delete_policy ON public.judges;

DROP POLICY IF EXISTS point_table_select_policy ON public.point_table;
DROP POLICY IF EXISTS point_table_insert_policy ON public.point_table;
DROP POLICY IF EXISTS point_table_update_policy ON public.point_table;
DROP POLICY IF EXISTS point_table_delete_policy ON public.point_table;

CREATE POLICY results_tenant_access ON public.results
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY items_tenant_read ON public.items
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY items_tenant_manage ON public.items
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY attendance_tenant_access ON public.attendance
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY festival_calendar_tenant_read ON public.festival_calendar
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY festival_calendar_tenant_manage ON public.festival_calendar
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY judges_tenant_access ON public.judges
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

CREATE POLICY point_table_tenant_access ON public.point_table
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR tenant_id = public.get_my_tenant_id())
  WITH CHECK (public.is_superadmin() OR tenant_id = public.get_my_tenant_id());

-- ---------------------------------------------------------------------------
-- 2. Result rows become schedule-aware without invalidating legacy history.
-- Only unambiguous legacy rows are backfilled. Ambiguous rows stay attached
-- to their original item/festival and remain available to legacy reports.
-- ---------------------------------------------------------------------------
ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_results_schedule_scope
  ON public.results (tenant_id, festival_id, schedule_id, registration_id);

UPDATE public.results r
SET schedule_id = q.schedule_id
FROM (
  -- UUID has no min() aggregate. The count guard below guarantees that the
  -- first ordered array element is the only unambiguous schedule match.
  SELECT r2.id, (array_agg(s.id ORDER BY s.id))[1] AS schedule_id
  FROM public.results r2
  JOIN public.schedules s
    ON s.tenant_id = r2.tenant_id
   AND s.festival_id = r2.festival_id
   AND s.item_id = r2.item_id
  WHERE r2.schedule_id IS NULL
  GROUP BY r2.id
  HAVING count(*) = 1
) q
WHERE r.id = q.id
  AND r.schedule_id IS NULL;

-- Database-level venue overlap protection applies to direct inserts, imports,
-- and UI bulk creation alike. Buffer is already included by the client in the
-- generated end time; this trigger only rejects true occupied-slot overlap.
CREATE OR REPLACE FUNCTION public.prevent_schedule_venue_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.venue_id IS NOT NULL AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.schedules s
       WHERE s.id IS DISTINCT FROM NEW.id
         AND s.tenant_id = NEW.tenant_id
         AND s.festival_id = NEW.festival_id
         AND s.venue_id = NEW.venue_id
         AND s.start_time < NEW.end_time
         AND s.end_time > NEW.start_time
     ) THEN
    RAISE EXCEPTION 'The selected venue already has an overlapping schedule in this festival.'
      USING ERRCODE = '23P01';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schedules_prevent_venue_overlap ON public.schedules;
CREATE TRIGGER schedules_prevent_venue_overlap
  BEFORE INSERT OR UPDATE OF tenant_id, festival_id, venue_id, start_time, end_time
  ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.prevent_schedule_venue_overlap();

-- ---------------------------------------------------------------------------
-- 3. Schedule-scoped registration read contract for check-in, code letters,
-- marks and results. The client supplies only schedule_id; tenant/festival/
-- item are resolved from the server-side schedule row.
-- ---------------------------------------------------------------------------
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

  RETURN QUERY
  SELECT r.id, r.item_id, r.participant_id, r.organisation_id,
         r.festival_id, r.tenant_id, r.status, r.is_verified, r.code_letter,
         to_jsonb(p) AS participants
  FROM public.registrations r
  JOIN public.participants p
    ON p.id = r.participant_id
   AND p.tenant_id = v_tenant_id
   AND p.festival_id = v_schedule.festival_id
  WHERE r.tenant_id = v_tenant_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id
  ORDER BY p.chest_number NULLS LAST, p.name, r.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_schedule_registrations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_registrations(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_judge_submission_summary(p_schedule_id uuid)
RETURNS TABLE (
  judge_id uuid,
  judge_name text,
  submitted_count bigint,
  draft_count bigint,
  total_assigned bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH selected_schedule AS (
    SELECT s.id, s.item_id, s.festival_id, s.tenant_id
    FROM public.schedules s
    WHERE s.id = p_schedule_id
      AND (public.is_superadmin() OR s.tenant_id = public.get_my_tenant_id())
  ), eligible_regs AS (
    SELECT r.id
    FROM public.registrations r
    JOIN selected_schedule s
      ON r.item_id = s.item_id
     AND r.festival_id = s.festival_id
     AND r.tenant_id = s.tenant_id
    WHERE r.status IS DISTINCT FROM 'rejected'
      AND r.code_letter IS NOT NULL
  )
  SELECT j.id, j.name,
         COUNT(DISTINCT me.registration_id) FILTER (WHERE me.is_final = true),
         COUNT(DISTINCT me.registration_id) FILTER (WHERE me.is_draft = true),
         (SELECT COUNT(*) FROM eligible_regs)::bigint
  FROM public.schedule_judge_assignments a
  JOIN public.judges j ON j.id = a.judge_id
  LEFT JOIN public.mark_entries me
    ON me.judge_id = a.judge_id
   AND me.schedule_id = a.schedule_id
   AND me.registration_id IN (SELECT id FROM eligible_regs)
  JOIN selected_schedule s ON s.id = a.schedule_id
  WHERE a.schedule_id = p_schedule_id
    AND a.status = 'active'
    AND (public.is_superadmin() OR a.tenant_id = public.get_my_tenant_id())
  GROUP BY j.id, j.name;
$$;

CREATE OR REPLACE FUNCTION public.get_schedule_readiness(p_schedule_id uuid)
RETURNS TABLE (
  registration_id uuid,
  code_letter text,
  submitted_count bigint,
  pending_count bigint,
  expected_count int,
  all_submitted boolean,
  readiness_status text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT reg.id, reg.code_letter,
         COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true),
         GREATEST(s.expected_judge_count - COUNT(DISTINCT me.judge_id)
           FILTER (WHERE me.is_final = true), 0)::bigint,
         s.expected_judge_count,
         COUNT(DISTINCT a.judge_id) = s.expected_judge_count
           AND COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count,
         CASE
           WHEN COUNT(DISTINCT a.judge_id) = s.expected_judge_count
            AND COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true) >= s.expected_judge_count
             THEN 'Ready for Calculation'
           WHEN COUNT(DISTINCT me.judge_id) FILTER (WHERE me.is_final = true) > 0
             THEN 'Partially Submitted'
           ELSE 'Waiting for Judges'
         END
  FROM public.registrations reg
  JOIN public.schedules s
    ON s.id = p_schedule_id
   AND reg.item_id = s.item_id
   AND reg.festival_id = s.festival_id
   AND reg.tenant_id = s.tenant_id
  LEFT JOIN public.schedule_judge_assignments a
    ON a.schedule_id = s.id AND a.status = 'active'
  LEFT JOIN public.mark_entries me
    ON me.registration_id = reg.id
   AND me.schedule_id = s.id
   AND me.judge_id = a.judge_id
  WHERE reg.status IS DISTINCT FROM 'rejected'
    AND reg.code_letter IS NOT NULL
    AND (public.is_superadmin() OR s.tenant_id = public.get_my_tenant_id())
  GROUP BY reg.id, reg.code_letter, s.expected_judge_count;
$$;

REVOKE ALL ON FUNCTION public.get_judge_submission_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_judge_submission_summary(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_schedule_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_schedule_readiness(uuid) TO authenticated;
-- Replace the older visibility-only guard with an explicit admin + tenant
-- boundary. The dependency checks and audit behaviour from migration 135 are
-- intentionally retained here.
CREATE OR REPLACE FUNCTION public.safe_unassign_registration(
  p_registration_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_registration public.registrations%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
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
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (COALESCE(v_profile.is_superadmin, false) IS FALSE
      AND v_profile.role NOT IN ('admin', 'admin_leader')) THEN
    RAISE EXCEPTION 'Only festival administrators can unassign competition items.'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_registration
  FROM public.registrations r
  WHERE r.id = p_registration_id
    AND (COALESCE(v_profile.is_superadmin, false) OR r.tenant_id = v_profile.tenant_id)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'registration_id', p_registration_id);
  END IF;

  IF NOT COALESCE(v_profile.is_superadmin, false)
     AND NOT public.is_org_visible(v_registration.organisation_id) THEN
    RAISE EXCEPTION 'Permission denied for this registration' USING ERRCODE = '42501';
  END IF;

  SELECT i.item_name_en, i.item_code, i.participation_type
    INTO v_item_name, v_item_code, v_participation_type
  FROM public.items i
  WHERE i.id = v_registration.item_id
    AND (i.tenant_id IS NULL OR i.tenant_id = v_registration.tenant_id);
  v_is_group := COALESCE(v_participation_type = 'group', false);

  SELECT count(*)::integer INTO v_mark_count
  FROM public.mark_entries me WHERE me.registration_id = v_registration.id;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE COALESCE(res.published, false))::integer
    INTO v_result_count, v_published_result_count
  FROM public.results res WHERE res.registration_id = v_registration.id;

  SELECT count(*)::integer INTO v_attendance_count
  FROM public.attendance a
  JOIN public.schedules s ON s.id = a.schedule_id
  WHERE a.participant_id = v_registration.participant_id
    AND s.item_id = v_registration.item_id
    AND s.festival_id = v_registration.festival_id
    AND s.tenant_id = v_registration.tenant_id
    AND a.tenant_id = v_registration.tenant_id;

  SELECT count(*)::integer INTO v_group_member_count
  FROM public.group_members gm WHERE gm.registration_id = v_registration.id;

  IF v_mark_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('judge_marks'); END IF;
  IF v_result_count > 0 THEN
    v_dependencies := v_dependencies || jsonb_build_array(
      CASE WHEN v_published_result_count > 0 THEN 'published_results_and_points' ELSE 'results_and_points' END);
  END IF;
  IF v_attendance_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('attendance_or_checkin'); END IF;
  IF COALESCE(v_registration.is_verified, false)
     OR NULLIF(trim(COALESCE(v_registration.code_letter, '')), '') IS NOT NULL
    THEN v_dependencies := v_dependencies || jsonb_build_array('stage_status_or_code_letter'); END IF;
  IF v_group_member_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('group_members'); END IF;
  IF v_is_group AND v_registration.raw_group_members IS NOT NULL
     AND jsonb_typeof(v_registration.raw_group_members) = 'array'
     AND jsonb_array_length(v_registration.raw_group_members) > 0
    THEN v_dependencies := v_dependencies || jsonb_build_array('group_registration_snapshot'); END IF;

  IF jsonb_array_length(v_dependencies) > 0 THEN
    v_block_message := format(
      'This %s assignment cannot be removed because competition data already exists: %s. Historical records were preserved.',
      COALESCE(v_item_code, v_item_name, 'item'),
      array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_dependencies)), ', '));
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_registration.tenant_id, auth.uid(), 'UNASSIGN_ITEM_BLOCKED', 'registrations',
      v_registration.id, to_jsonb(v_registration),
      jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''),
        'dependencies', v_dependencies, 'participant_id', v_registration.participant_id,
        'item_id', v_registration.item_id, 'festival_id', v_registration.festival_id,
        'organisation_id', v_registration.organisation_id));
    RETURN jsonb_build_object('status', 'blocked', 'message', v_block_message,
      'registration_id', v_registration.id, 'participant_id', v_registration.participant_id,
      'item_id', v_registration.item_id, 'festival_id', v_registration.festival_id,
      'organisation_id', v_registration.organisation_id, 'dependencies', v_dependencies);
  END IF;

  BEGIN
    DELETE FROM public.registrations WHERE id = v_registration.id;
  EXCEPTION WHEN foreign_key_violation THEN
    v_block_message := 'This assignment was not removed because dependent competition history exists. Historical records were preserved.';
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_registration.tenant_id, auth.uid(), 'UNASSIGN_ITEM_BLOCKED', 'registrations',
      v_registration.id, to_jsonb(v_registration),
      jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''), 'database_error', SQLERRM));
    RETURN jsonb_build_object('status', 'blocked', 'message', v_block_message,
      'registration_id', v_registration.id);
  END;

  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_registration.tenant_id, auth.uid(), 'UNASSIGN_ITEM', 'registrations', v_registration.id,
    to_jsonb(v_registration), jsonb_build_object('status', 'removed',
      'reason', NULLIF(trim(p_reason), ''), 'participant_id', v_registration.participant_id,
      'item_id', v_registration.item_id, 'festival_id', v_registration.festival_id,
      'organisation_id', v_registration.organisation_id, 'removed_by', auth.uid(), 'removed_at', now()));

  RETURN jsonb_build_object('status', 'removed', 'registration_id', v_registration.id,
    'participant_id', v_registration.participant_id, 'item_id', v_registration.item_id,
    'festival_id', v_registration.festival_id, 'organisation_id', v_registration.organisation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.safe_unassign_registration(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_unassign_registration(uuid, text) TO authenticated;

-- Stage dashboard rows carry schedule_id so the UI never reconstructs a
-- schedule state from item_id alone. The old RPC remains available for older
-- clients; new clients use this explicitly versioned contract.
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
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
    IF v_festival_id IS NULL THEN
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
    AND p.tenant_id = v_tenant_id AND p.festival_id = v_festival_id
  JOIN public.schedules s ON s.tenant_id = v_tenant_id
    AND s.festival_id = v_festival_id AND s.item_id = r.item_id
    AND (p_schedule_id IS NULL OR s.id = p_schedule_id)
  LEFT JOIN public.organisations o ON o.id = r.organisation_id
  WHERE r.tenant_id = v_tenant_id AND r.festival_id = v_festival_id
  ORDER BY p.chest_number NULLS LAST, p.name, r.id, s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stage_management_registrations_scoped(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_registrations_scoped(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Destructive schedule/venue actions get the same dependent-data guard as
-- participant unassignment. Existing screens can keep their delete buttons;
-- the server now decides whether deletion is safe and explains a block.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.safe_delete_schedule(
  p_schedule_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_schedule public.schedules%ROWTYPE;
  v_dependencies jsonb := '[]'::jsonb;
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (COALESCE(v_profile.is_superadmin, false) IS FALSE
      AND v_profile.role NOT IN ('admin', 'admin_leader')) THEN
    RAISE EXCEPTION 'Only festival administrators can delete schedules.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_schedule
  FROM public.schedules s
  WHERE s.id = p_schedule_id
    AND (COALESCE(v_profile.is_superadmin, false) OR s.tenant_id = v_profile.tenant_id)
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found', 'schedule_id', p_schedule_id);
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.mark_entries me WHERE me.schedule_id = v_schedule.id;
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('judge_marks'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.results r
  WHERE r.tenant_id = v_schedule.tenant_id
    AND r.festival_id = v_schedule.festival_id
    AND (r.schedule_id = v_schedule.id OR (r.schedule_id IS NULL AND r.item_id = v_schedule.item_id));
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('results_or_points'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.attendance a WHERE a.schedule_id = v_schedule.id;
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('attendance_or_checkin'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.schedule_judge_assignments a WHERE a.schedule_id = v_schedule.id;
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('judge_assignments'); END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.registrations r
  WHERE r.tenant_id = v_schedule.tenant_id
    AND r.festival_id = v_schedule.festival_id
    AND r.item_id = v_schedule.item_id
    AND r.status IS DISTINCT FROM 'rejected'
    AND (COALESCE(r.is_verified, false) OR NULLIF(trim(COALESCE(r.code_letter, '')), '') IS NOT NULL);
  IF v_count > 0 THEN v_dependencies := v_dependencies || jsonb_build_array('stage_status_or_code_letters'); END IF;

  IF jsonb_array_length(v_dependencies) > 0 THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_schedule.tenant_id, auth.uid(), 'DELETE_SCHEDULE_BLOCKED', 'schedules', v_schedule.id,
      to_jsonb(v_schedule), jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''), 'dependencies', v_dependencies));
    RETURN jsonb_build_object('status', 'blocked', 'schedule_id', v_schedule.id,
      'message', format('Schedule cannot be deleted because dependent data exists: %s.', array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_dependencies)), ', ')),
      'dependencies', v_dependencies);
  END IF;

  DELETE FROM public.schedules WHERE id = v_schedule.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_schedule.tenant_id, auth.uid(), 'DELETE_SCHEDULE', 'schedules', v_schedule.id,
    to_jsonb(v_schedule), jsonb_build_object('status', 'removed', 'reason', NULLIF(trim(p_reason), ''), 'removed_at', now()));
  RETURN jsonb_build_object('status', 'removed', 'schedule_id', v_schedule.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.safe_delete_venue(
  p_venue_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_venue public.venues%ROWTYPE;
  v_schedule_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR (COALESCE(v_profile.is_superadmin, false) IS FALSE
      AND v_profile.role NOT IN ('admin', 'admin_leader')) THEN
    RAISE EXCEPTION 'Only festival administrators can delete venues.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_venue FROM public.venues v
  WHERE v.id = p_venue_id
    AND (COALESCE(v_profile.is_superadmin, false) OR v.tenant_id = v_profile.tenant_id)
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found', 'venue_id', p_venue_id); END IF;

  SELECT count(*)::integer INTO v_schedule_count FROM public.schedules s WHERE s.venue_id = v_venue.id;
  IF v_schedule_count > 0 THEN
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
    VALUES (v_venue.tenant_id, auth.uid(), 'DELETE_VENUE_BLOCKED', 'venues', v_venue.id,
      to_jsonb(v_venue), jsonb_build_object('status', 'blocked', 'reason', NULLIF(trim(p_reason), ''), 'schedule_count', v_schedule_count));
    RETURN jsonb_build_object('status', 'blocked', 'venue_id', v_venue.id,
      'message', format('Venue cannot be deleted while %s schedule(s) use it.', v_schedule_count), 'schedule_count', v_schedule_count);
  END IF;

  DELETE FROM public.venues WHERE id = v_venue.id;
  INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_venue.tenant_id, auth.uid(), 'DELETE_VENUE', 'venues', v_venue.id,
    to_jsonb(v_venue), jsonb_build_object('status', 'removed', 'reason', NULLIF(trim(p_reason), ''), 'removed_at', now()));
  RETURN jsonb_build_object('status', 'removed', 'venue_id', v_venue.id);
END;
$$;

REVOKE ALL ON FUNCTION public.safe_delete_schedule(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_schedule(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.safe_delete_venue(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.safe_delete_venue(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Team Leader SECURITY DEFINER reads keep the existing zero-argument API,
-- but every parent relation is explicitly bound to the assignment tenant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_team_leader_context()
RETURNS TABLE (assignment_id uuid, parent_tenant_id uuid, festival_id uuid, festival_team_id uuid, organisation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT a.id, ft.parent_tenant_id, ft.festival_id, ft.id, ft.organisation_id
  FROM public.team_leader_assignments a
  JOIN public.festival_teams ft ON ft.id = a.festival_team_id
  JOIN public.festival_calendar f ON f.id = ft.festival_id AND f.tenant_id = ft.parent_tenant_id
  JOIN public.profiles p ON p.id = a.user_id AND p.id = auth.uid()
  LEFT JOIN public.team_portal_settings s
    ON s.parent_tenant_id = ft.parent_tenant_id AND s.festival_id = ft.festival_id
  WHERE a.user_id = auth.uid() AND p.role = 'team_leader'
    AND a.status = 'active' AND a.revoked_at IS NULL
    AND a.valid_from <= now() AND (a.valid_until IS NULL OR a.valid_until > now())
    AND ft.is_active AND f.is_active AND COALESCE(s.is_enabled, false)
    AND (s.opens_at IS NULL OR s.opens_at <= now()) AND (s.closes_at IS NULL OR s.closes_at > now())
  ORDER BY a.assigned_at DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_participants()
RETURNS TABLE (id uuid, name text, gender text, category_code text, chest_number text, status text, festival_id uuid, organisation_id uuid, profile_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p.id, p.name, p.gender, p.category_code, p.chest_number, p.status, p.festival_id, p.organisation_id, p.profile_slug
  FROM public.participants p JOIN public.get_team_leader_context() c
    ON c.festival_id = p.festival_id AND c.organisation_id = p.organisation_id AND p.tenant_id = c.parent_tenant_id;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_schedule()
RETURNS TABLE (schedule_id uuid, item_id uuid, item_code text, item_name text, category_codes text[], venue_name text, start_time timestamptz, end_time timestamptz, event_status text, participant_count bigint, checked_in_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT s.id, s.item_id, i.item_code, COALESCE(i.item_name_en, i.item_name_ml), i.category_codes,
         v.name, s.start_time, s.end_time, s.status, COUNT(DISTINCT p.id),
         COUNT(DISTINCT r.id) FILTER (WHERE r.is_verified IS TRUE)
  FROM public.schedules s JOIN public.get_team_leader_context() c
    ON c.festival_id = s.festival_id AND c.parent_tenant_id = s.tenant_id
  JOIN public.items i ON i.id = s.item_id AND (i.tenant_id IS NULL OR i.tenant_id = c.parent_tenant_id)
  LEFT JOIN public.venues v ON v.id = s.venue_id AND v.tenant_id = c.parent_tenant_id
  LEFT JOIN public.registrations r ON r.festival_id = s.festival_id AND r.tenant_id = s.tenant_id
    AND r.item_id = s.item_id AND r.organisation_id = c.organisation_id AND r.status NOT IN ('rejected', 'cancelled')
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.tenant_id = c.parent_tenant_id
  GROUP BY s.id, s.item_id, i.item_code, i.item_name_en, i.item_name_ml, i.category_codes, v.name, s.start_time, s.end_time, s.status
  ORDER BY s.start_time NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_published_results()
RETURNS TABLE (result_id uuid, item_code text, item_name text, participant_name text, rank int, grade text, points_awarded int, published_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT DISTINCT res.id, i.item_code, COALESCE(i.item_name_en, i.item_name_ml), p.name,
         res.rank, res.grade, res.points_awarded, res.published_at
  FROM public.results res JOIN public.get_team_leader_context() c
    ON c.festival_id = res.festival_id AND c.parent_tenant_id = res.tenant_id
  JOIN public.items i ON i.id = res.item_id AND (i.tenant_id IS NULL OR i.tenant_id = c.parent_tenant_id)
  JOIN public.registrations r ON r.id = res.registration_id AND r.tenant_id = c.parent_tenant_id
  LEFT JOIN public.participants p ON p.id = r.participant_id AND p.tenant_id = c.parent_tenant_id
  WHERE res.published IS TRUE AND res.result_status = 'published' AND res.public_visible IS TRUE
    AND r.organisation_id = c.organisation_id
  ORDER BY res.published_at DESC NULLS LAST, res.rank NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_announcements()
RETURNS TABLE (id uuid, title text, message text, type text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT a.id, a.title, a.message, a.type, a.created_at
  FROM public.announcements a JOIN public.get_team_leader_context() c
    ON c.festival_id = a.festival_id AND c.parent_tenant_id = a.tenant_id
  WHERE a.target_role IN ('all', 'team_leader', 'participant') ORDER BY a.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_team_leader_standings()
RETURNS TABLE (rank bigint, organisation_id uuid, team_name text, total_points bigint, is_own_team boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH ctx AS (SELECT * FROM public.get_team_leader_context()),
  official AS (
    SELECT * FROM public.get_public_leaderboard((SELECT parent_tenant_id FROM ctx), (SELECT festival_id FROM ctx))
  ),
  teams AS (
    SELECT ft.organisation_id, o.name
    FROM public.festival_teams ft JOIN public.organisations o ON o.id = ft.organisation_id
    JOIN ctx ON ctx.festival_id = ft.festival_id AND ctx.parent_tenant_id = ft.parent_tenant_id
    WHERE ft.is_active
  )
  SELECT DENSE_RANK() OVER (ORDER BY COALESCE(official.total_points, 0) DESC,
    COALESCE(official.first_place_count, 0) DESC, COALESCE(official.second_place_count, 0) DESC, teams.name ASC),
    teams.organisation_id, teams.name, COALESCE(official.total_points, 0)::bigint,
    (teams.organisation_id = (SELECT organisation_id FROM ctx))
  FROM teams LEFT JOIN official ON official.organisation_id = teams.organisation_id
  ORDER BY 1, teams.name;
$$;

REVOKE ALL ON FUNCTION public.get_team_leader_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_context() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_participants() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_participants() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_schedule() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_schedule() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_published_results() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_published_results() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_announcements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_announcements() TO authenticated;
REVOKE ALL ON FUNCTION public.get_team_leader_standings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_leader_standings() TO authenticated;

COMMIT;
