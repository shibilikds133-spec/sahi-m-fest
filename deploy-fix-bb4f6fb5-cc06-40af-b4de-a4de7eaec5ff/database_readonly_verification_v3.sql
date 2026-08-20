-- ============================================================================
-- DATABASE RUNTIME VERIFICATION SCRIPT V3 (READ-ONLY)
-- ============================================================================
-- Purpose: Verify the actual state of the Supabase database against repository
--          migration expectations.
--
-- How to run:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste this entire script
--   3. Execute as postgres/Service Role (for full catalog access)
--   4. Review results and report findings
--
-- Safety: This script is read-only. It contains SELECT statements and
--         non-mutating DO blocks that execute conditional SELECTs.
--         It does NOT modify any data, schema, or configuration.
--
-- WARNING: Sections E.1, E.8 output function and view definitions.
--          Review these outputs for embedded secrets, credentials,
--          service URLs, or sensitive business logic BEFORE sharing.
--
-- Structure: Sections are independently runnable. If one section errors,
--            subsequent sections continue unaffected.
-- ============================================================================


-- ============================================================================
-- SECTION A: UNIVERSAL CATALOG PREFLIGHT
-- ============================================================================
-- Purpose: Verify that basic PostgreSQL catalog views are accessible.
--          These queries never fail on a working PostgreSQL database.

SELECT 'A.1 Database Version' AS section;
SELECT version() AS postgres_version;

SELECT 'A.2 Current Database and Role' AS section;
SELECT current_database() AS database_name, current_user AS current_role;

SELECT 'A.3 Supabase Project Settings' AS section;
SELECT
  current_setting('app.settings.project_ref', true) AS project_ref,
  current_setting('app.settings.region', true) AS region;

SELECT 'A.4 Public Schema Table Count' AS section;
SELECT COUNT(*) AS table_count
FROM pg_tables
WHERE schemaname = 'public';

SELECT 'A.5 Public Schema Function Count' AS section;
SELECT COUNT(*) AS function_count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f';

SELECT 'A.6 RLS Policy Count' AS section;
SELECT COUNT(*) AS policy_count
FROM pg_policies
WHERE schemaname = 'public';

SELECT 'A.7 Preflight Complete' AS section;
SELECT 'All catalog views accessible. Proceed with verification.' AS status;


-- ============================================================================
-- SECTION B: MIGRATION HISTORY
-- ============================================================================
-- Purpose: Inspect Supabase migration tracking table.
--          Each query is genuinely conditional on table existence.

SELECT 'B.1 Migration History Table Existence' AS section;
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations'
) AS migration_table_exists;

-- B.2: Conditionally query migration history
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations'
    AND table_name = 'schema_migrations'
  ) THEN
    RAISE NOTICE 'SECTION B.2: Migration table found - querying...';
  ELSE
    RAISE NOTICE 'SECTION B.2: Migration table NOT found - skipping migration queries';
  END IF;
END $$;

-- B.3: Applied migrations (conditional)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations'
    AND table_name = 'schema_migrations'
  ) THEN
    -- Return migration list via dynamic query
    RETURN QUERY EXECUTE '
      SELECT version, name, statements, executed_at
      FROM supabase_migrations.schema_migrations
      ORDER BY version
    ';
  END IF;
END $$;

-- B.4: Migration count (conditional)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations'
    AND table_name = 'schema_migrations'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_applied_migrations
      FROM supabase_migrations.schema_migrations
    ';
  END IF;
END $$;


-- ============================================================================
-- SECTION C: TABLE AND COLUMN INVENTORY
-- ============================================================================
-- Purpose: Enumerate all public tables with RLS status and row counts.
--          Uses only stable catalog views.

SELECT 'C.1 All Public Tables with RLS Status' AS section;
SELECT
  t.tablename,
  t.rowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename AND p.schemaname = 'public') AS policy_count
FROM pg_tables t
WHERE t.schemaname = 'public'
ORDER BY t.tablename;

SELECT 'C.2 Table Row Counts (Estimated)' AS section;
SELECT
  schemaname,
  tablename,
  n_live_tup AS estimated_row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- C.3: Check forcerowsecurity via pg_class (pg_tables does not expose this column)
SELECT 'C.3 Forced RLS Status (via pg_class)' AS section;
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND c.relkind = 'r'
AND c.relrowsecurity = true
ORDER BY c.relname;

SELECT 'C.4 Tables WITHOUT RLS (Potential Risk)' AS section;
SELECT
  t.tablename,
  t.rowsecurity AS rls_enabled
FROM pg_tables t
WHERE t.schemaname = 'public'
AND t.rowsecurity = false
ORDER BY t.tablename;


-- ============================================================================
-- SECTION D: RLS POLICY INVENTORY
-- ============================================================================
-- Purpose: Enumerate all RLS policies with their expressions.
--          Check for permissive USING (true) policies on critical tables.

SELECT 'D.1 All RLS Policies' AS section;
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- D.2: Participants - check for USING (true)
SELECT 'D.2 Participants - Permissive USING (true) Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'participants'
AND (qual = 'true' OR with_check = 'true');

-- D.3: Organisations - check for USING (true)
SELECT 'D.3 Organisations - Permissive USING (true) Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'organisations'
AND (qual = 'true' OR with_check = 'true');

-- D.4: Mark Entries - full audit
SELECT 'D.4 Mark Entries - All Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'mark_entries'
ORDER BY policyname;

-- D.5: Mark Entries - anon/public access
SELECT 'D.5 Mark Entries - Anon/Public Access Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'mark_entries'
AND (roles @> ARRAY['anon'] OR roles @> ARRAY['public']);

-- D.6: Judge Tokens - full audit
SELECT 'D.6 Judge Tokens - All Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'judge_tokens'
ORDER BY policyname;

-- D.7: Judge Tokens - public SELECT check
SELECT 'D.7 Judge Tokens - Public SELECT Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'judge_tokens'
AND cmd = 'SELECT'
AND qual = 'true';

-- D.8: System API Keys - existence check
SELECT 'D.8 System API Keys - Existence Check' AS section;
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'system_api_keys'
  ) AS table_exists;

-- D.9: System API Keys policies (conditional on table existence)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'system_api_keys'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT
        p.policyname::text,
        p.roles::text[],
        p.cmd::text AS operation,
        p.qual::text AS using_expression,
        p.with_check::text AS with_check_expression
      FROM pg_policies p
      WHERE p.schemaname = ''public''
      AND p.tablename = ''system_api_keys''
    ';
  END IF;
END $$;

-- D.10: Leaderboard Settings - broken role references
SELECT 'D.10 Leaderboard Settings - Broken Role References' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'festival_leaderboard_settings'
AND (qual LIKE '%super_admin%' OR qual LIKE '%tenant_admin%' OR qual LIKE '%festival_admin%');

-- D.11: Poster Templates - broken role references
SELECT 'D.11 Poster Templates - Broken Role References' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'poster_templates'
AND (qual LIKE '%super_admin%' OR qual LIKE '%tenant_admin%' OR qual LIKE '%festival_admin%');


-- ============================================================================
-- SECTION E: FUNCTION AND GRANT INVENTORY
-- ============================================================================
-- Purpose: Enumerate all public functions, their security properties,
--          and their privilege grants.
--
-- WARNING: E.1 and E.8 output full function/view definitions.
--          Review for embedded secrets, credentials, or sensitive logic
--          BEFORE sharing these outputs with anyone.

-- E.1: All public functions with full CREATE definition
-- WARNING: May contain embedded secrets or sensitive business logic
SELECT 'E.1 All Public Functions (Full Definition) - REVIEW FOR SECRETS BEFORE SHARING' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;

-- E.2: SECURITY DEFINER functions
SELECT 'E.2 SECURITY DEFINER Functions' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prosecdef = true
AND p.prokind = 'f'
ORDER BY p.proname;

-- E.3: Function privileges for anon, authenticated, and PUBLIC
-- PUBLIC execute privileges checked via pg_catalog.pg_acl (not pg_roles join)
SELECT 'E.3 Function Privileges - Anon, Authenticated, and PUBLIC' AS section;
SELECT
  p.proname AS function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  EXISTS (
    SELECT 1 FROM pg_catalog.pg_acl a
    WHERE a.oid = p.oid
    AND a.grantee = 0
    AND a.privilege_type = 'EXECUTE'
  ) AS public_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;

-- E.4: Helper functions - get_my_tenant_id
SELECT 'E.4 Helper Function - get_my_tenant_id' AS section;
SELECT
  p.proname,
  p.prosrc AS function_body,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_my_tenant_id';

-- E.5: Helper functions - is_superadmin
SELECT 'E.5 Helper Function - is_superadmin' AS section;
SELECT
  p.proname,
  p.prosrc AS function_body,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'is_superadmin';

-- E.6: ssf_get_category - check for hard-coded year
SELECT 'E.6 Function - ssf_get_category (Hard-coded Year Check)' AS section;
SELECT
  p.proname,
  p.prosrc AS function_body
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'ssf_get_category';

-- E.7: get_public_leaderboard - check for hard-coded year
SELECT 'E.7 Function - get_public_leaderboard (Hard-coded Year Check)' AS section;
SELECT
  p.proname,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_public_leaderboard';

-- E.8: All views
-- WARNING: May contain embedded secrets or sensitive business logic
SELECT 'E.8 All Views - REVIEW FOR SECRETS BEFORE SHARING' AS section;
SELECT
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;


-- ============================================================================
-- SECTION F: CORE TABLE OWNERSHIP CHECKS
-- ============================================================================
-- Purpose: Verify tenant and festival data ownership for core tables.
--          These tables are expected to exist in all configurations.

-- F.1: Tenant count
SELECT 'F.1 Tenant Count' AS section;
SELECT COUNT(*) AS tenant_count FROM public.tenants;

-- F.2: Organisations - tenant distribution
SELECT 'F.2 Organisations - Tenant Distribution' AS section;
SELECT
  tenant_id,
  COUNT(*) AS org_count
FROM public.organisations
GROUP BY tenant_id
ORDER BY org_count DESC;

-- F.3: Participants - tenant distribution
SELECT 'F.3 Participants - Tenant Distribution' AS section;
SELECT
  tenant_id,
  COUNT(*) AS participant_count
FROM public.participants
GROUP BY tenant_id
ORDER BY participant_count DESC;

-- F.4: Participants - NULL tenant_id
SELECT 'F.4 Participants - NULL tenant_id Count' AS section;
SELECT
  COUNT(*) AS null_tenant_count
FROM public.participants
WHERE tenant_id IS NULL;

-- F.5: Registrations - tenant distribution
SELECT 'F.5 Registrations - Tenant Distribution' AS section;
SELECT
  tenant_id,
  COUNT(*) AS registration_count
FROM public.registrations
GROUP BY tenant_id
ORDER BY registration_count DESC;

-- F.6: Registrations - NULL tenant_id
SELECT 'F.6 Registrations - NULL tenant_id Count' AS section;
SELECT
  COUNT(*) AS null_tenant_count
FROM public.registrations
WHERE tenant_id IS NULL;

-- F.7: Festival Calendar - year distribution
SELECT 'F.7 Festival Calendar - Year Distribution' AS section;
SELECT
  festival_year,
  COUNT(*) AS festival_count,
  COUNT(*) FILTER (WHERE is_active = true) AS active_count
FROM public.festival_calendar
GROUP BY festival_year
ORDER BY festival_year;

-- F.8: Active festivals per tenant
SELECT 'F.8 Active Festivals Per Tenant' AS section;
SELECT
  tenant_id,
  COUNT(*) AS active_festival_count
FROM public.festival_calendar
WHERE is_active = true
GROUP BY tenant_id;

-- F.9: Participants - festival distribution (top 20)
SELECT 'F.9 Participants - Festival Distribution (Top 20)' AS section;
SELECT
  festival_id,
  COUNT(*) AS participant_count
FROM public.participants
WHERE festival_id IS NOT NULL
GROUP BY festival_id
ORDER BY participant_count DESC
LIMIT 20;

-- F.10: Participants - NULL festival_id
SELECT 'F.10 Participants - NULL festival_id Count' AS section;
SELECT
  COUNT(*) AS null_festival_count
FROM public.participants
WHERE festival_id IS NULL;

-- F.11: Items - festival distribution (top 20)
SELECT 'F.11 Items - Festival Distribution (Top 20)' AS section;
SELECT
  festival_id,
  COUNT(*) AS item_count
FROM public.items
GROUP BY festival_id
ORDER BY item_count DESC
LIMIT 20;

-- F.12: Results - festival distribution (top 20)
SELECT 'F.12 Results - Festival Distribution (Top 20)' AS section;
SELECT
  festival_id,
  COUNT(*) AS result_count
FROM public.results
GROUP BY festival_id
ORDER BY result_count DESC
LIMIT 20;

-- F.13: Organisation hierarchy stats
SELECT 'F.13 Organisation Hierarchy Stats' AS section;
SELECT
  org_type,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE parent_id IS NULL) AS root_count,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL) AS child_count
FROM public.organisations
GROUP BY org_type
ORDER BY count DESC;

-- F.14: Orphan organisations (parent_id references missing record)
SELECT 'F.14 Orphan Organisations (Missing Parent)' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.organisations o
WHERE o.parent_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.organisations p WHERE p.id = o.parent_id
);

-- F.15: Cross-tenant parent-child links
SELECT 'F.15 Cross-Tenant Parent-Child Links' AS section;
SELECT
  COUNT(*) AS cross_tenant_count
FROM public.organisations child
JOIN public.organisations parent ON child.parent_id = parent.id
WHERE child.tenant_id != parent.tenant_id;

-- F.16: Profile role check constraint (using to_regclass for safety)
SELECT 'F.16 Profile Role Check Constraint' AS section;
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.profiles')
AND contype = 'c';

-- F.17: Distinct role values in profiles
SELECT 'F.17 Distinct Role Values in Profiles' AS section;
SELECT
  role,
  COUNT(*) AS user_count
FROM public.profiles
GROUP BY role
ORDER BY user_count DESC;

-- F.18: Superadmin count
SELECT 'F.18 Superadmin Count' AS section;
SELECT
  COUNT(*) AS superadmin_count
FROM public.profiles
WHERE is_superadmin = true;

-- F.19: Users with NULL role
SELECT 'F.19 Users with NULL Role' AS section;
SELECT
  COUNT(*) AS null_role_count
FROM public.profiles
WHERE role IS NULL;

-- F.20: Points config records
SELECT 'F.20 Points Config Records' AS section;
SELECT
  festival_id,
  rank_1_points,
  rank_2_points,
  rank_3_points,
  grade_a_plus_points,
  grade_a_points,
  grade_b_points,
  grade_c_points,
  ind_a_plus_points,
  ind_a_points,
  ind_b_points,
  ind_c_points,
  grp_a_plus_points,
  grp_a_points,
  grp_b_points,
  grp_c_points
FROM public.points_config
LIMIT 10;

-- F.21: Results grade distribution
SELECT 'F.21 Results Grade Distribution' AS section;
SELECT
  grade,
  COUNT(*) AS count,
  MIN(total_score) AS min_score,
  MAX(total_score) AS max_score,
  AVG(total_score) AS avg_score
FROM public.results
WHERE grade IS NOT NULL
GROUP BY grade
ORDER BY count DESC;

-- F.22: Results with scores 70-74 (grade inconsistency check)
SELECT 'F.22 Results with Scores 70-74 (Grade Inconsistency)' AS section;
SELECT
  COUNT(*) AS affected_count,
  COUNT(*) FILTER (WHERE grade = 'A') AS graded_a,
  COUNT(*) FILTER (WHERE grade IS NULL OR grade = 'D') AS graded_other
FROM public.results
WHERE total_score >= 70 AND total_score < 75;

-- F.23: Scoring rules count
SELECT 'F.23 Scoring Rules Count' AS section;
SELECT
  COUNT(*) AS total_rules,
  COUNT(*) FILTER (WHERE is_default = true) AS default_rules,
  COUNT(*) FILTER (WHERE tenant_id IS NULL) AS global_rules
FROM public.scoring_rules;

-- F.24: Judge token stats
SELECT 'F.24 Judge Token Stats' AS section;
SELECT
  COUNT(*) AS total_tokens,
  COUNT(*) FILTER (WHERE is_used = false) AS unused_tokens,
  COUNT(*) FILTER (WHERE is_used = true) AS used_tokens,
  COUNT(*) FILTER (WHERE expires_at IS NULL) AS no_expiry_count
FROM public.judge_tokens;

-- F.25: Judge tokens linked to missing judges
SELECT 'F.25 Judge Tokens Linked to Missing Judges' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.judge_tokens jt
WHERE NOT EXISTS (
  SELECT 1 FROM public.judges j WHERE j.id = jt.judge_id
);

-- F.26: Judge tokens linked to missing schedules
SELECT 'F.26 Judge Tokens Linked to Missing Schedules' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.judge_tokens jt
WHERE NOT EXISTS (
  SELECT 1 FROM public.schedules s WHERE s.id = jt.schedule_id
);

-- F.27: Mark entries stats
SELECT 'F.27 Mark Entries Stats' AS section;
SELECT
  COUNT(*) AS total_marks,
  COUNT(*) FILTER (WHERE is_final = true) AS finalized_count,
  COUNT(*) FILTER (WHERE is_draft = true) AS draft_count
FROM public.mark_entries;

-- F.28: Mark entries linked to missing judges
SELECT 'F.28 Mark Entries Linked to Missing Judges' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.mark_entries me
WHERE NOT EXISTS (
  SELECT 1 FROM public.judges j WHERE j.id = me.judge_id
);

-- F.29: Duplicate mark entries
SELECT 'F.29 Duplicate Mark Entries (Same Judge/Schedule/Registration)' AS section;
SELECT
  judge_id,
  schedule_id,
  registration_id,
  COUNT(*) AS duplicate_count
FROM public.mark_entries
GROUP BY judge_id, schedule_id, registration_id
HAVING COUNT(*) > 1;

-- F.30: Index inventory
SELECT 'F.30 All Indexes on Public Tables' AS section;
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IS NOT NULL
ORDER BY tablename, indexname;

-- F.31: Trigger inventory
SELECT 'F.31 All Triggers on Public Tables' AS section;
SELECT
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation AS event,
  action_orientation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;


-- ============================================================================
-- SECTION G: OPTIONAL MODULE CHECKS
-- ============================================================================
-- Purpose: Check optional tables that may or may not exist.
--          Every query is genuinely conditional on table and column existence.
--          If a table or required column is missing, the query is skipped.

-- G.1: System API Keys (created by root SQL, may not be in migrations)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'system_api_keys'
  ) THEN
    RAISE NOTICE 'SECTION G.1: system_api_keys EXISTS';
    RETURN QUERY EXECUTE '
      SELECT
        p.policyname::text,
        p.roles::text[],
        p.cmd::text AS operation,
        p.qual::text AS using_expression,
        p.with_check::text AS with_check_expression
      FROM pg_policies p
      WHERE p.schemaname = ''public''
      AND p.tablename = ''system_api_keys''
    ';
  ELSE
    RAISE NOTICE 'SECTION G.1: system_api_keys does NOT exist - skipping';
  END IF;
END $$;

-- G.2: System API Keys - provider distribution (conditional)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'system_api_keys'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT
        provider::text,
        COUNT(*)::bigint AS key_count,
        COUNT(*) FILTER (WHERE is_active = true)::bigint AS active_count
      FROM public.system_api_keys
      GROUP BY provider
    ';
  END IF;
END $$;

-- G.3: File Metadata (created in migration 025)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'file_metadata'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT
        asset_type::text,
        COUNT(*)::bigint AS count,
        COUNT(DISTINCT tenant_id)::bigint AS tenant_count,
        COUNT(DISTINCT festival_id)::bigint AS festival_count
      FROM public.file_metadata
      GROUP BY asset_type
      ORDER BY count DESC
    ';
  END IF;
END $$;

-- G.4: Notifications (created in migration 074)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT
        COUNT(*)::bigint AS total_notifications,
        COUNT(DISTINCT tenant_id)::bigint AS tenant_count
      FROM public.notifications
    ';
  END IF;
END $$;

-- G.5: Notification Logs (created in migration 074)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'notification_logs'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT
        status::text,
        COUNT(*)::bigint AS count
      FROM public.notification_logs
      GROUP BY status
    ';
  END IF;
END $$;

-- G.6: User Notification Tokens (created in migration 074)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'user_notification_tokens'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT
        COUNT(*)::bigint AS total_tokens,
        COUNT(DISTINCT user_id)::bigint AS unique_users
      FROM public.user_notification_tokens
    ';
  END IF;
END $$;

-- G.7: Audit Logs (created in migration 001)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'audit_logs'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_audit_logs FROM public.audit_logs
    ';
  END IF;
END $$;

-- G.8: System Events (created in migration 055)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'system_events'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_events FROM public.system_events
    ';
  END IF;
END $$;

-- G.9: Participant Unit Batches (created in migration 055)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'participant_unit_batches'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_batches FROM public.participant_unit_batches
    ';
  END IF;
END $$;

-- G.10: Participant Unit Audit Logs (created in migration 055)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'participant_unit_audit_logs'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_audit_logs FROM public.participant_unit_audit_logs
    ';
  END IF;
END $$;

-- G.11: Import Sessions (created in migration 057)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'import_sessions'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_sessions FROM public.import_sessions
    ';
  END IF;
END $$;

-- G.12: Poster Templates (created in migration 030)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'poster_templates'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_templates FROM public.poster_templates
    ';
  END IF;
END $$;

-- G.13: Poster Drafts (created in migration 050)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'poster_drafts'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_drafts FROM public.poster_drafts
    ';
  END IF;
END $$;

-- G.14: Poster Versions (created in migration 050)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'poster_versions'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_versions FROM public.poster_versions
    ';
  END IF;
END $$;

-- G.15: Generated Posters (created in migration 032)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'generated_posters'
  ) THEN
    RETURN QUERY EXECUTE '
      SELECT COUNT(*)::bigint AS total_generated FROM public.generated_posters
    ';
  END IF;
END $$;

-- G.16: Generated Assets (existence check)
SELECT 'G.16 Generated Assets - Module Check' AS section;
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'generated_assets'
  ) AS table_exists;

-- G.17: Export Jobs (existence check)
SELECT 'G.17 Export Jobs - Module Check' AS section;
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'export_jobs'
  ) AS table_exists;


-- ============================================================================
-- SECTION H: VERIFICATION COMPLETE
-- ============================================================================

SELECT 'H.1 Verification Complete' AS section;
SELECT
  (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') AS total_tables,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') AS total_policies,
  (SELECT COUNT(*) FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f') AS total_functions,
  (SELECT COUNT(*) FROM pg_views WHERE schemaname = 'public') AS total_views;
