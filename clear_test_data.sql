-- ============================================================
-- SQL Script to Clear Test Data & Make Production Ready
-- Wipes all transient test data and setup data for all tenants
-- EXCEPT the production tenant: 'd3ed1102-31a6-4e44-86ca-7a41c4359db1'
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_target_tenant_id uuid;
BEGIN
  -- 1. Resolve target tenant/organisation ID
  SELECT id INTO v_target_tenant_id FROM public.tenants WHERE id = 'd3ed1102-31a6-4e44-86ca-7a41c4359db1';
  
  IF v_target_tenant_id IS NULL THEN
    SELECT tenant_id INTO v_target_tenant_id FROM public.organisations WHERE id = 'd3ed1102-31a6-4e44-86ca-7a41c4359db1';
  END IF;

  IF v_target_tenant_id IS NULL THEN
    v_target_tenant_id := 'd3ed1102-31a6-4e44-86ca-7a41c4359db1';
  END IF;

  RAISE NOTICE 'Keeping all data for tenant ID: %', v_target_tenant_id;

  -- 2. Clear transient data tables for all other tenants
  
  -- Clear transfer logs
  DELETE FROM public.transfer_logs 
  WHERE from_tenant_id IS DISTINCT FROM v_target_tenant_id 
     OR to_tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear audit logs
  DELETE FROM public.audit_logs 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear bulk reassignment system logs & events
  DELETE FROM public.system_events 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  DELETE FROM public.participant_unit_audit_logs 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  DELETE FROM public.participant_unit_batches 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear leaderboard points cache
  DELETE FROM public.point_table 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear generated poster assets
  DELETE FROM public.generated_posters 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  DELETE FROM public.generated_assets 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear certificates
  DELETE FROM public.certificates 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear check-in attendance records
  DELETE FROM public.attendance 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear results
  DELETE FROM public.results 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear judge mark entries
  DELETE FROM public.mark_entries 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear judge login access tokens
  DELETE FROM public.judge_tokens 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear group member mappings (registration-level)
  DELETE FROM public.group_members 
  WHERE registration_id IN (
    SELECT id FROM public.registrations WHERE tenant_id IS DISTINCT FROM v_target_tenant_id
  ) OR participant_id IN (
    SELECT id FROM public.participants WHERE tenant_id IS DISTINCT FROM v_target_tenant_id
  );

  -- Clear event registrations
  DELETE FROM public.registrations 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear participants
  DELETE FROM public.participants 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- 3. Clear setup data for other tenants (venues, schedules, judges, config)
  
  DELETE FROM public.schedules WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.venues WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.judges WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.announcements WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.scoring_criteria WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.items WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.points_config WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.categories WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.festival_calendar WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;
  DELETE FROM public.organisations WHERE tenant_id IS DISTINCT FROM v_target_tenant_id;

  -- Clear other tenants' admin/user profiles (excluding super_admins and system accounts)
  DELETE FROM public.profiles 
  WHERE tenant_id IS DISTINCT FROM v_target_tenant_id 
    AND tenant_id IS NOT NULL 
    AND role IS DISTINCT FROM 'super_admin';

  -- Finally delete other tenants
  DELETE FROM public.tenants WHERE id IS DISTINCT FROM v_target_tenant_id;

  RAISE NOTICE 'SUCCESS: All test data and tenant setup cleared. Production tenant % is clean and ready.', v_target_tenant_id;

END $$;

COMMIT;
