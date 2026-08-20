-- ============================================================================
-- DATABASE RUNTIME VERIFICATION SCRIPT V4 (READ-ONLY)
-- ============================================================================
-- Purpose: Verify the actual runtime state of the Supabase PostgreSQL database
--          against repository migration expectations and static audit findings.
--
-- Execution Model:
--   - Transparent, section-by-section execution.
--   - Part A, Part C (C.1-C.5), Part D, Part E, and Part H are universally safe
--     catalog queries that execute on any PostgreSQL database.
--   - Part B (B.2, B.3), Part F, and Part G are schema-dependent data queries.
--     Use Part E (Prerequisite Matrix) to confirm table/column existence
--     before executing schema-dependent sections.
--
-- How to run:
--   1. Open Supabase Dashboard -> SQL Editor
--   2. Run PART A (Catalog Preflight) and PART E (Prerequisite Matrix) first.
--   3. Run PART D (P0 RLS Verification) and PART C (Function Metadata).
--   4. Check Part E results to determine which queries in PART B, PART F, and
--      PART G can be executed safely.
--   5. Export/save results for the Phase 5 Runtime Verification Report.
--
-- Read-Only Safety Statement:
--   Read-only by design and statically reviewed for non-mutating statements.
--   Contains ONLY SELECT, WITH, CASE, EXISTS, catalog joins, and aggregates.
--   Contains ZERO INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE, GRANT, REVOKE,
--   or mutating RPC calls.
--
-- Privacy & Sensitive Data Warning:
--   - Parts A through G return counts, boolean flags, catalog definitions, and
--     aggregate statistics. They NEVER return PII (names, emails, phone numbers,
--     passwords, raw tokens, or raw API key values).
--   - OPTIONAL Subsection C.6 & C.7 output full function and view definitions.
--     REVIEW AND REDACT output for embedded credentials or secrets BEFORE sharing.
-- ============================================================================


-- ============================================================================
-- PART A: UNIVERSAL CATALOG PREFLIGHT
-- ============================================================================
-- Purpose: Verify PostgreSQL version, catalog access, RLS status, table/column
--          inventory, and system triggers. Always safe on any PostgreSQL database.

SELECT 'A.1 Database Version' AS section;
SELECT version() AS postgres_version;

SELECT 'A.2 Current Database and Role' AS section;
SELECT
  current_database() AS database_name,
  current_user AS current_user_role,
  session_user AS session_user_role;

SELECT 'A.3 Supabase Project Settings' AS section;
SELECT
  current_setting('app.settings.project_ref', true) AS project_ref,
  current_setting('app.settings.region', true) AS region;

SELECT 'A.4 Public Schema Summary Counts' AS section;
SELECT
  (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'public') AS public_table_count,
  (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f') AS public_function_count,
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname = 'public') AS public_policy_count,
  (SELECT COUNT(*)::int FROM pg_views WHERE schemaname = 'public') AS public_view_count;

SELECT 'A.5 Table Inventory & RLS Status (via pg_class)' AS section;
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  (SELECT COUNT(*)::int FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND c.relkind = 'r'
ORDER BY c.relname;

SELECT 'A.6 Tables WITHOUT RLS (Potential Security Risk)' AS section;
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND c.relkind = 'r'
AND c.relrowsecurity = false
ORDER BY c.relname;

SELECT 'A.7 Column Inventory Summary' AS section;
SELECT
  table_name,
  COUNT(*)::int AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

SELECT 'A.8 Index Inventory Summary' AS section;
SELECT
  tablename AS table_name,
  COUNT(*)::int AS index_count
FROM pg_indexes
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

SELECT 'A.9 Trigger Inventory' AS section;
SELECT
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation AS event,
  action_orientation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

SELECT 'A.10 Preflight Complete' AS section;
SELECT 'Universal catalog preflight finished successfully.' AS status;


-- ============================================================================
-- PART B: MIGRATION HISTORY
-- ============================================================================
-- Purpose: Check applied migrations recorded in supabase_migrations table.

SELECT 'B.1 Migration Tracking Table Existence Check' AS section;
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations'
) AS migration_table_exists;

-- ============================================================================
-- SUBSECTION B.2 & B.3: MIGRATION HISTORY DETAIL & COUNT
-- MANUALLY RUN ONLY IF B.1 RETURNS TRUE
-- (If supabase_migrations.schema_migrations does not exist, skip these queries)
-- ============================================================================

-- B.2: Applied Migration Detail List
SELECT
  version,
  name,
  statements,
  executed_at
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- B.3: Total Applied Migration Count
SELECT
  COUNT(*)::bigint AS total_applied_migrations
FROM supabase_migrations.schema_migrations;


-- ============================================================================
-- PART C: FUNCTION AND GRANT INSPECTION
-- ============================================================================
-- Purpose: Enumerate public functions, SECURITY DEFINER status, and grants.
--          ACL inspection uses aclexplode for exact PUBLIC / anon / authenticated checks.

SELECT 'C.1 Public Functions Inventory & Security Attributes' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer,
  CASE p.provolatile
    WHEN 'i' THEN 'IMMUTABLE'
    WHEN 's' THEN 'STABLE'
    WHEN 'v' THEN 'VOLATILE'
  END AS volatility,
  r.rolname AS owner_role,
  p.proconfig AS search_path_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_roles r ON p.proowner = r.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;

SELECT 'C.2 SECURITY DEFINER Functions Audit' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  r.rolname AS owner_role,
  p.proconfig AS search_path_config
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_roles r ON p.proowner = r.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
AND p.prosecdef = true
ORDER BY p.proname;

SELECT 'C.3 Function Privileges Audit (Anon, Authenticated, and PUBLIC ACL Explosion)' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  EXISTS (
    SELECT 1
    FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
    WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE'
  ) AS public_has_explicit_or_default_grant
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;

SELECT 'C.4 Helper Function Source Inspection - get_my_tenant_id' AS section;
SELECT p.proname, p.prosrc AS function_body, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'get_my_tenant_id';

SELECT 'C.5 Helper Function Source Inspection - is_superadmin' AS section;
SELECT p.proname, p.prosrc AS function_body, p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'is_superadmin';

SELECT 'C.6 Function Hard-Coded Year Check - ssf_get_category' AS section;
SELECT p.proname, p.prosrc AS function_body
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'ssf_get_category';

SELECT 'C.7 Function Hard-Coded Year Check - get_public_leaderboard' AS section;
SELECT p.proname, p.prosrc AS function_body
FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'get_public_leaderboard';

SELECT 'C.8 Views Metadata Inventory' AS section;
SELECT viewname, schemaname, viewowner
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- ============================================================================
-- OPTIONAL SUBSECTION C.9 & C.10: FULL FUNCTION & VIEW DEFINITIONS
-- WARNING: Full function definitions and view definitions may expose
-- credentials, tokens, service URLs, or business logic.
-- REVIEW AND REDACT OUTPUT BEFORE SHARING PUBLICLY.
-- ============================================================================

-- C.9: All Public Functions (Full Definition)
SELECT
  p.proname AS function_name,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;

-- C.10: All Views (Full Definition)
SELECT
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;


-- ============================================================================
-- PART D: P0 RLS VERIFICATION
-- ============================================================================
-- Purpose: Inspect pg_policies for known static security vulnerabilities (P0-1 to P0-8).
--          Safe to run regardless of table existence since it queries pg_policies catalog.

SELECT 'D.1 All Active RLS Policies' AS section;
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

SELECT 'D.2 Participants Table - Permissive USING (true) Check (P0-3 Risk)' AS section;
SELECT policyname, permissive, roles, cmd AS operation, qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'participants'
AND (qual = 'true' OR with_check = 'true' OR qual LIKE '%true%' OR with_check LIKE '%true%');

SELECT 'D.3 Organisations Table - Permissive USING (true) Check (P0-4 Risk)' AS section;
SELECT policyname, permissive, roles, cmd AS operation, qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'organisations'
AND (qual = 'true' OR with_check = 'true' OR qual LIKE '%true%' OR with_check LIKE '%true%');

SELECT 'D.4 Mark Entries Table - All Policies & Anon/Public Access Check (P0-1 Risk)' AS section;
SELECT policyname, permissive, roles, cmd AS operation, qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mark_entries'
ORDER BY policyname;

SELECT 'D.5 Judge Tokens Table - Unrestricted SELECT Access Check (P0-2 Risk)' AS section;
SELECT policyname, permissive, roles, cmd AS operation, qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'judge_tokens'
ORDER BY policyname;

SELECT 'D.6 System API Keys Table - Policy Audit (P0-5 Risk)' AS section;
SELECT policyname, permissive, roles, cmd AS operation, qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'system_api_keys'
ORDER BY policyname;

SELECT 'D.7 Policies Referencing Inconsistent / Unrecognized Roles (P0-8 Risk)' AS section;
SELECT tablename, policyname, roles, cmd AS operation, qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND (
  qual LIKE '%super_admin%' OR qual LIKE '%tenant_admin%' OR qual LIKE '%festival_admin%' OR qual LIKE '%admin_leader%' OR qual LIKE '%superadmin%'
  OR with_check LIKE '%super_admin%' OR with_check LIKE '%tenant_admin%' OR with_check LIKE '%festival_admin%' OR with_check LIKE '%admin_leader%' OR with_check LIKE '%superadmin%'
)
ORDER BY tablename, policyname;

SELECT 'D.8 Broad Authenticated USING (true) Policies Audit' AS section;
SELECT tablename, policyname, roles, cmd AS operation, qual AS using_expression, with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND (roles @> ARRAY['authenticated'] OR roles @> ARRAY['public'])
AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;


-- ============================================================================
-- PART E: TABLE AND COLUMN PREREQUISITE MATRIX
-- ============================================================================
-- Purpose: Pure catalog query producing a diagnostic matrix of all expected tables
--          and required columns. Use output to determine which queries in Part F
--          and Part G can be safely run. Always safe to run.

SELECT 'E.1 Prerequisite Matrix for Core and Optional Tables' AS section;

WITH target_requirements (table_name, required_columns) AS (
  VALUES
    ('tenants', ARRAY['id', 'name', 'code', 'is_active']),
    ('profiles', ARRAY['id', 'role', 'is_superadmin', 'tenant_id']),
    ('organisations', ARRAY['id', 'tenant_id', 'parent_id', 'org_type', 'name']),
    ('festival_calendar', ARRAY['id', 'tenant_id', 'festival_year', 'is_active']),
    ('participants', ARRAY['id', 'tenant_id', 'festival_id', 'organisation_id', 'category_id']),
    ('registrations', ARRAY['id', 'tenant_id', 'participant_id', 'item_id']),
    ('items', ARRAY['id', 'festival_id', 'category_id', 'name', 'code']),
    ('results', ARRAY['id', 'festival_id', 'registration_id', 'total_score', 'grade', 'rank']),
    ('points_config', ARRAY['id', 'festival_id', 'rank_1_points', 'grade_a_points']),
    ('scoring_rules', ARRAY['id', 'tenant_id', 'is_default']),
    ('judges', ARRAY['id', 'festival_id', 'name']),
    ('judge_tokens', ARRAY['id', 'judge_id', 'schedule_id', 'token', 'is_used', 'expires_at']),
    ('schedules', ARRAY['id', 'festival_id', 'item_id', 'venue_id']),
    ('mark_entries', ARRAY['id', 'judge_id', 'schedule_id', 'registration_id', 'is_final', 'is_draft']),
    ('system_api_keys', ARRAY['id', 'provider', 'is_active']),
    ('file_metadata', ARRAY['id', 'tenant_id', 'festival_id', 'asset_type']),
    ('notifications', ARRAY['id', 'tenant_id', 'title']),
    ('notification_logs', ARRAY['id', 'status']),
    ('user_notification_tokens', ARRAY['id', 'user_id', 'push_token']),
    ('audit_logs', ARRAY['id', 'user_id', 'action']),
    ('system_events', ARRAY['id', 'event_type']),
    ('participant_unit_batches', ARRAY['id', 'tenant_id']),
    ('participant_unit_audit_logs', ARRAY['id']),
    ('import_sessions', ARRAY['id', 'tenant_id', 'status']),
    ('poster_templates', ARRAY['id', 'tenant_id', 'name']),
    ('poster_drafts', ARRAY['id', 'tenant_id']),
    ('poster_versions', ARRAY['id', 'draft_id']),
    ('generated_posters', ARRAY['id', 'festival_id']),
    ('generated_assets', ARRAY['id', 'asset_type']),
    ('export_jobs', ARRAY['id', 'tenant_id', 'status'])
)
SELECT
  tr.table_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_name = tr.table_name
  ) AS table_exists,
  COALESCE(
    array_agg(c.column_name) FILTER (WHERE c.column_name IS NOT NULL),
    ARRAY[]::text[]
  ) AS existing_columns,
  (
    SELECT array_agg(rc)
    FROM unnest(tr.required_columns) rc
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c2
      WHERE c2.table_schema = 'public' AND c2.table_name = tr.table_name AND c2.column_name = rc
    )
  ) AS missing_required_columns,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables t WHERE t.table_schema = 'public' AND t.table_name = tr.table_name
    ) THEN 'TABLE MISSING'
    WHEN EXISTS (
      SELECT 1 FROM unnest(tr.required_columns) rc
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns c2 WHERE c2.table_schema = 'public' AND c2.table_name = tr.table_name AND c2.column_name = rc
      )
    ) THEN 'TABLE EXISTS (SOME COLUMNS MISSING)'
    ELSE 'READY FOR DATA CHECKS'
  END AS verification_status
FROM target_requirements tr
LEFT JOIN information_schema.columns c ON c.table_schema = 'public' AND c.table_name = tr.table_name
GROUP BY tr.table_name, tr.required_columns
ORDER BY tr.table_name;


-- ============================================================================
-- PART F: CORE DATA CHECKS
-- ============================================================================
-- Purpose: Schema-dependent aggregate checks on core application tables.
--          Returns ONLY counts, distributions, and non-sensitive metrics.
--          NEVER returns PII (names, emails, phone numbers, or passwords).
--
-- PREREQUISITE REQUIREMENT:
-- Check Part E Prerequisite Matrix before running each query.

-- PREREQUISITE: Run only if table 'tenants' exists (see Part E matrix)
SELECT 'F.1 Tenant Count' AS section;
SELECT COUNT(*)::bigint AS tenant_count FROM public.tenants;

-- PREREQUISITE: Run only if table 'organisations' exists (see Part E matrix)
SELECT 'F.2 Organisations - Tenant Distribution' AS section;
SELECT tenant_id, COUNT(*)::bigint AS org_count
FROM public.organisations
GROUP BY tenant_id ORDER BY org_count DESC;

-- PREREQUISITE: Run only if table 'participants' exists (see Part E matrix)
SELECT 'F.3 Participants - Tenant Distribution' AS section;
SELECT tenant_id, COUNT(*)::bigint AS participant_count
FROM public.participants
GROUP BY tenant_id ORDER BY participant_count DESC;

-- PREREQUISITE: Run only if table 'participants' exists (see Part E matrix)
SELECT 'F.4 Participants - NULL tenant_id Count' AS section;
SELECT COUNT(*)::bigint AS null_tenant_count
FROM public.participants WHERE tenant_id IS NULL;

-- PREREQUISITE: Run only if table 'registrations' exists (see Part E matrix)
SELECT 'F.5 Registrations - Tenant Distribution' AS section;
SELECT tenant_id, COUNT(*)::bigint AS registration_count
FROM public.registrations
GROUP BY tenant_id ORDER BY registration_count DESC;

-- PREREQUISITE: Run only if table 'registrations' exists (see Part E matrix)
SELECT 'F.6 Registrations - NULL tenant_id Count' AS section;
SELECT COUNT(*)::bigint AS null_tenant_count
FROM public.registrations WHERE tenant_id IS NULL;

-- PREREQUISITE: Run only if table 'festival_calendar' exists (see Part E matrix)
SELECT 'F.7 Festival Calendar - Year Distribution' AS section;
SELECT
  festival_year,
  COUNT(*)::bigint AS festival_count,
  COUNT(*) FILTER (WHERE is_active = true)::bigint AS active_count
FROM public.festival_calendar
GROUP BY festival_year ORDER BY festival_year;

-- PREREQUISITE: Run only if table 'festival_calendar' exists (see Part E matrix)
SELECT 'F.8 Active Festivals Per Tenant' AS section;
SELECT tenant_id, COUNT(*)::bigint AS active_festival_count
FROM public.festival_calendar
WHERE is_active = true GROUP BY tenant_id;

-- PREREQUISITE: Run only if table 'participants' exists (see Part E matrix)
SELECT 'F.9 Participants - Festival Distribution (Top 20)' AS section;
SELECT festival_id, COUNT(*)::bigint AS participant_count
FROM public.participants
WHERE festival_id IS NOT NULL
GROUP BY festival_id ORDER BY participant_count DESC LIMIT 20;

-- PREREQUISITE: Run only if table 'participants' exists (see Part E matrix)
SELECT 'F.10 Participants - NULL festival_id Count' AS section;
SELECT COUNT(*)::bigint AS null_festival_count
FROM public.participants WHERE festival_id IS NULL;

-- PREREQUISITE: Run only if table 'items' exists (see Part E matrix)
SELECT 'F.11 Items - Festival Distribution (Top 20)' AS section;
SELECT festival_id, COUNT(*)::bigint AS item_count
FROM public.items
GROUP BY festival_id ORDER BY item_count DESC LIMIT 20;

-- PREREQUISITE: Run only if table 'results' exists (see Part E matrix)
SELECT 'F.12 Results - Festival Distribution (Top 20)' AS section;
SELECT festival_id, COUNT(*)::bigint AS result_count
FROM public.results
GROUP BY festival_id ORDER BY result_count DESC LIMIT 20;

-- PREREQUISITE: Run only if table 'organisations' exists (see Part E matrix)
SELECT 'F.13 Organisation Hierarchy Stats' AS section;
SELECT
  org_type,
  COUNT(*)::bigint AS count,
  COUNT(*) FILTER (WHERE parent_id IS NULL)::bigint AS root_count,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL)::bigint AS child_count
FROM public.organisations
GROUP BY org_type ORDER BY count DESC;

-- PREREQUISITE: Run only if table 'organisations' exists (see Part E matrix)
SELECT 'F.14 Orphan Organisations (Missing Parent Record)' AS section;
SELECT COUNT(*)::bigint AS orphan_count
FROM public.organisations o
WHERE o.parent_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM public.organisations p WHERE p.id = o.parent_id);

-- PREREQUISITE: Run only if table 'organisations' exists (see Part E matrix)
SELECT 'F.15 Cross-Tenant Parent-Child Links' AS section;
SELECT COUNT(*)::bigint AS cross_tenant_count
FROM public.organisations child
JOIN public.organisations parent ON child.parent_id = parent.id
WHERE child.tenant_id != parent.tenant_id;

-- PREREQUISITE: Run only if table 'profiles' exists (see Part E matrix)
SELECT 'F.16 Profile Role Check Constraint Definition' AS section;
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.profiles')
AND contype = 'c';

-- PREREQUISITE: Run only if table 'profiles' exists (see Part E matrix)
SELECT 'F.17 Distinct Role Values in Profiles Table' AS section;
SELECT role, COUNT(*)::bigint AS user_count
FROM public.profiles
GROUP BY role ORDER BY user_count DESC;

-- PREREQUISITE: Run only if table 'profiles' exists (see Part E matrix)
SELECT 'F.18 Superadmin Account Count' AS section;
SELECT COUNT(*)::bigint AS superadmin_count
FROM public.profiles WHERE is_superadmin = true;

-- PREREQUISITE: Run only if table 'profiles' exists (see Part E matrix)
SELECT 'F.19 Users with NULL Role in Profiles' AS section;
SELECT COUNT(*)::bigint AS null_role_count
FROM public.profiles WHERE role IS NULL;

-- PREREQUISITE: Run only if table 'points_config' exists (see Part E matrix)
SELECT 'F.20 Points Config Records Summary' AS section;
SELECT
  festival_id,
  rank_1_points, rank_2_points, rank_3_points,
  grade_a_plus_points, grade_a_points, grade_b_points, grade_c_points
FROM public.points_config LIMIT 10;

-- PREREQUISITE: Run only if table 'results' exists (see Part E matrix)
SELECT 'F.21 Results Grade Distribution & Score Range Summary' AS section;
SELECT
  grade,
  COUNT(*)::bigint AS count,
  MIN(total_score) AS min_score,
  MAX(total_score) AS max_score,
  ROUND(AVG(total_score), 2) AS avg_score
FROM public.results
WHERE grade IS NOT NULL
GROUP BY grade ORDER BY count DESC;

-- PREREQUISITE: Run only if table 'results' exists (see Part E matrix)
SELECT 'F.22 Results with Scores 70-74 (Grade Threshold Conflict Audit - P0-7)' AS section;
SELECT
  COUNT(*)::bigint AS total_70_to_74_results,
  COUNT(*) FILTER (WHERE grade = 'A')::bigint AS graded_a_70_to_74,
  COUNT(*) FILTER (WHERE grade IS NULL OR grade != 'A')::bigint AS graded_non_a_70_to_74
FROM public.results
WHERE total_score >= 70 AND total_score < 75;

-- PREREQUISITE: Run only if table 'scoring_rules' exists (see Part E matrix)
SELECT 'F.23 Scoring Rules Summary' AS section;
SELECT
  COUNT(*)::bigint AS total_rules,
  COUNT(*) FILTER (WHERE is_default = true)::bigint AS default_rules,
  COUNT(*) FILTER (WHERE tenant_id IS NULL)::bigint AS global_rules
FROM public.scoring_rules;

-- PREREQUISITE: Run only if table 'judge_tokens' exists (see Part E matrix)
SELECT 'F.24 Judge Token Status Stats (P0-2 Risk)' AS section;
SELECT
  COUNT(*)::bigint AS total_tokens,
  COUNT(*) FILTER (WHERE is_used = false)::bigint AS unused_tokens,
  COUNT(*) FILTER (WHERE is_used = true)::bigint AS used_tokens,
  COUNT(*) FILTER (WHERE expires_at IS NULL)::bigint AS no_expiry_count
FROM public.judge_tokens;

-- PREREQUISITE: Run only if table 'judge_tokens' and 'judges' exist (see Part E matrix)
SELECT 'F.25 Judge Tokens Linked to Missing Judges' AS section;
SELECT COUNT(*)::bigint AS orphan_count
FROM public.judge_tokens jt
WHERE NOT EXISTS (SELECT 1 FROM public.judges j WHERE j.id = jt.judge_id);

-- PREREQUISITE: Run only if table 'judge_tokens' and 'schedules' exist (see Part E matrix)
SELECT 'F.26 Judge Tokens Linked to Missing Schedules' AS section;
SELECT COUNT(*)::bigint AS orphan_count
FROM public.judge_tokens jt
WHERE NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = jt.schedule_id);

-- PREREQUISITE: Run only if table 'mark_entries' exists (see Part E matrix)
SELECT 'F.27 Mark Entries Status Stats (P0-1 Risk)' AS section;
SELECT
  COUNT(*)::bigint AS total_marks,
  COUNT(*) FILTER (WHERE is_final = true)::bigint AS finalized_count,
  COUNT(*) FILTER (WHERE is_draft = true)::bigint AS draft_count
FROM public.mark_entries;

-- PREREQUISITE: Run only if table 'mark_entries' and 'judges' exist (see Part E matrix)
SELECT 'F.28 Mark Entries Linked to Missing Judges' AS section;
SELECT COUNT(*)::bigint AS orphan_count
FROM public.mark_entries me
WHERE NOT EXISTS (SELECT 1 FROM public.judges j WHERE j.id = me.judge_id);

-- PREREQUISITE: Run only if table 'mark_entries' exists (see Part E matrix)
SELECT 'F.29 Duplicate Mark Entries (Same Judge, Schedule, Registration)' AS section;
SELECT judge_id, schedule_id, registration_id, COUNT(*)::bigint AS duplicate_count
FROM public.mark_entries
GROUP BY judge_id, schedule_id, registration_id
HAVING COUNT(*) > 1;


-- ============================================================================
-- PART G: OPTIONAL MODULE CHECKS
-- ============================================================================
-- Purpose: Schema-dependent queries for optional modules.
--          Run each query ONLY IF Part E matrix confirms table existence.

-- PREREQUISITE: Run only if table 'system_api_keys' exists (see Part E matrix)
SELECT 'G.1 System API Keys Provider Distribution (P0-5 Risk - NO Raw Keys Output)' AS section;
SELECT
  provider,
  COUNT(*)::bigint AS key_count,
  COUNT(*) FILTER (WHERE is_active = true)::bigint AS active_count
FROM public.system_api_keys
GROUP BY provider;

-- PREREQUISITE: Run only if table 'file_metadata' exists (see Part E matrix)
SELECT 'G.2 File Metadata Asset Distribution' AS section;
SELECT
  asset_type,
  COUNT(*)::bigint AS count,
  COUNT(DISTINCT tenant_id)::bigint AS tenant_count,
  COUNT(DISTINCT festival_id)::bigint AS festival_count
FROM public.file_metadata
GROUP BY asset_type ORDER BY count DESC;

-- PREREQUISITE: Run only if table 'notifications' exists (see Part E matrix)
SELECT 'G.3 Notifications Summary' AS section;
SELECT
  COUNT(*)::bigint AS total_notifications,
  COUNT(DISTINCT tenant_id)::bigint AS tenant_count
FROM public.notifications;

-- PREREQUISITE: Run only if table 'notification_logs' exists (see Part E matrix)
SELECT 'G.4 Notification Logs Status Distribution' AS section;
SELECT status, COUNT(*)::bigint AS count
FROM public.notification_logs GROUP BY status;

-- PREREQUISITE: Run only if table 'user_notification_tokens' exists (see Part E matrix)
SELECT 'G.5 User Notification Tokens Summary' AS section;
SELECT
  COUNT(*)::bigint AS total_tokens,
  COUNT(DISTINCT user_id)::bigint AS unique_users
FROM public.user_notification_tokens;

-- PREREQUISITE: Run only if table 'audit_logs' exists (see Part E matrix)
SELECT 'G.6 Audit Logs Summary' AS section;
SELECT COUNT(*)::bigint AS total_audit_logs FROM public.audit_logs;

-- PREREQUISITE: Run only if table 'system_events' exists (see Part E matrix)
SELECT 'G.7 System Events Summary' AS section;
SELECT COUNT(*)::bigint AS total_system_events FROM public.system_events;

-- PREREQUISITE: Run only if table 'participant_unit_batches' exists (see Part E matrix)
SELECT 'G.8 Participant Unit Batches Summary' AS section;
SELECT COUNT(*)::bigint AS total_batches FROM public.participant_unit_batches;

-- PREREQUISITE: Run only if table 'participant_unit_audit_logs' exists (see Part E matrix)
SELECT 'G.9 Participant Unit Audit Logs Summary' AS section;
SELECT COUNT(*)::bigint AS total_unit_audit_logs FROM public.participant_unit_audit_logs;

-- PREREQUISITE: Run only if table 'import_sessions' exists (see Part E matrix)
SELECT 'G.10 Import Sessions Summary' AS section;
SELECT COUNT(*)::bigint AS total_import_sessions FROM public.import_sessions;

-- PREREQUISITE: Run only if table 'poster_templates' exists (see Part E matrix)
SELECT 'G.11 Poster Templates Summary' AS section;
SELECT COUNT(*)::bigint AS total_templates FROM public.poster_templates;

-- PREREQUISITE: Run only if table 'poster_drafts' exists (see Part E matrix)
SELECT 'G.12 Poster Drafts Summary' AS section;
SELECT COUNT(*)::bigint AS total_drafts FROM public.poster_drafts;

-- PREREQUISITE: Run only if table 'poster_versions' exists (see Part E matrix)
SELECT 'G.13 Poster Versions Summary' AS section;
SELECT COUNT(*)::bigint AS total_versions FROM public.poster_versions;

-- PREREQUISITE: Run only if table 'generated_posters' exists (see Part E matrix)
SELECT 'G.14 Generated Posters Summary' AS section;
SELECT COUNT(*)::bigint AS total_generated FROM public.generated_posters;

-- PREREQUISITE: Run only if table 'generated_assets' exists (see Part E matrix)
SELECT 'G.15 Generated Assets Summary' AS section;
SELECT COUNT(*)::bigint AS total_assets FROM public.generated_assets;

-- PREREQUISITE: Run only if table 'export_jobs' exists (see Part E matrix)
SELECT 'G.16 Export Jobs Summary' AS section;
SELECT COUNT(*)::bigint AS total_export_jobs FROM public.export_jobs;


-- ============================================================================
-- PART H: VERIFICATION COMPLETE & CATALOG SUMMARY
-- ============================================================================
-- Purpose: Final summary counts for schema elements in public namespace. Always safe.

SELECT 'H.1 Verification Complete' AS section;
SELECT
  (SELECT COUNT(*)::int FROM pg_tables WHERE schemaname = 'public') AS total_tables,
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname = 'public') AS total_policies,
  (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.prokind = 'f') AS total_functions,
  (SELECT COUNT(*)::int FROM pg_views WHERE schemaname = 'public') AS total_views;
