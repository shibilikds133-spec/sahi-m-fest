-- ============================================================================
-- DATABASE RUNTIME VERIFICATION SCRIPT V4.3 (READ-ONLY MAIN SCRIPT)
-- ============================================================================
-- Purpose: Verify the actual runtime state of the Supabase PostgreSQL database
--          against repository migration expectations and static audit findings.
--
-- Execution Model:
--   - Transparent, section-by-section execution.
--   - Part A, Part C (C.1-C.5), Part D, Part E, and Part H are universally safe
--     catalog queries that execute on any PostgreSQL database.
--   - Part B, Part F, and Part G are schema-dependent data queries.
--     Use Part E (Query-Level Prerequisite Matrix) to confirm table/column readiness
--     before executing schema-dependent sections.
--
-- Read-Only & Non-Sensitive Guarantee:
--   - Read-only by design and statically reviewed for non-mutating statements.
--   - Contains ZERO INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE, GRANT, REVOKE,
--     or mutating RPC calls.
--   - NEVER returns PII (names, emails, phone numbers, passwords), raw tokens,
--     raw API key values, raw migration statements, full function definitions,
--     full view definitions, or persistent record key triples.
--   - All optional forensic / code-definition queries have been moved exclusively
--     to database_verification_forensic_optional.sql.
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

-- PREREQUISITE: Run B.2, B.3, B.4 ONLY IF B.1 confirms migration table exists
SELECT 'B.2 Migration Table Column Inventory' AS section;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'supabase_migrations'
AND table_name = 'schema_migrations'
ORDER BY ordinal_position;

-- PREREQUISITE: Run B.3 ONLY IF B.1 confirms migration table exists.
-- Uses composite-row to_jsonb(sm) to dynamically access columns without SQL compile errors
-- if physical columns (statements, executed_at, inserted_at) vary across Supabase CLI versions.
SELECT 'B.3 Applied Migration Metadata Summary (JSONB Dynamic Column Safe Form - NO Raw Statements Text)' AS section;
SELECT
  migration_row ->> 'version' AS version,
  COALESCE(migration_row ->> 'name', 'N/A') AS migration_name,
  COALESCE(
    migration_row ->> 'executed_at',
    migration_row ->> 'inserted_at',
    'N/A'
  ) AS executed_timestamp,
  CASE
    WHEN jsonb_typeof(migration_row -> 'statements') = 'array'
      THEN jsonb_array_length(migration_row -> 'statements')
    ELSE 0
  END AS statement_count
FROM (
  SELECT to_jsonb(sm) AS migration_row
  FROM supabase_migrations.schema_migrations sm
) migrations
ORDER BY migration_row ->> 'version';

SELECT 'B.4 Total Applied Migration Count' AS section;
SELECT COUNT(*)::bigint AS total_applied_migrations
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

SELECT 'C.3 Function Privileges Audit (Supabase Role Safe Inspection via to_regrole)' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  CASE
    WHEN to_regrole('anon') IS NOT NULL THEN has_function_privilege('anon', p.oid, 'EXECUTE')
    ELSE NULL
  END AS anon_can_execute,
  CASE
    WHEN to_regrole('authenticated') IS NOT NULL THEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ELSE NULL
  END AS authenticated_can_execute,
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

SELECT 'C.4 Helper & Core RPC Structured Security Flags' AS section;
SELECT
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  (p.prosrc ILIKE '%2025%') AS references_2025,
  (p.prosrc ILIKE '%2026%') AS references_2026,
  (p.prosrc ILIKE '%tenant_id%') AS references_tenant_id,
  (p.prosrc ILIKE '%festival_id%') AS references_festival_id,
  (p.prosrc ILIKE '%is_superadmin%') AS references_is_superadmin
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname IN ('get_my_tenant_id', 'is_superadmin', 'ssf_get_category', 'get_public_leaderboard')
ORDER BY p.proname;

SELECT 'C.5 Views Metadata Inventory' AS section;
SELECT viewname, schemaname, viewowner
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;


-- ============================================================================
-- PART D: P0 RLS VERIFICATION & ACTIVE SECURITY AUDIT
-- ============================================================================
-- Purpose: Inspect active RLS policy enforcement by joining pg_policies with pg_class.
--          Distinguishes ACTIVE POLICY vs DEFINED BUT RLS DISABLED vs TABLE HAS RLS BUT NO POLICY.

SELECT 'D.1 All Defined RLS Policies with Active Table RLS Enforcement Status' AS section;
SELECT
  p.schemaname,
  p.tablename,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd AS operation,
  p.qual AS using_expression,
  p.with_check AS with_check_expression,
  CASE
    WHEN c.relrowsecurity = true THEN 'ACTIVE POLICY (ENFORCED)'
    ELSE 'POLICY DEFINED BUT RLS DISABLED (NOT ENFORCED - HIGH RISK)'
  END AS rls_enforcement_status
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public'
ORDER BY p.tablename, p.policyname;

SELECT 'D.2 Participants Table - Permissive Boolean TRUE Active Policy Check (P0-3 Risk)' AS section;
SELECT
  p.policyname, p.permissive, p.roles, p.cmd AS operation, p.qual AS using_expression, p.with_check AS with_check_expression,
  c.relrowsecurity AS rls_enabled,
  CASE
    WHEN c.relrowsecurity = true THEN 'ACTIVE BYPASS POLICY'
    ELSE 'POLICY DEFINED BUT RLS DISABLED'
  END AS rls_status
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public' AND p.tablename = 'participants'
AND (p.permissive = 'PERMISSIVE' OR p.permissive IS NULL)
AND (
  qual = 'true' OR with_check = 'true'
  OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true'
  OR TRIM(BOTH '()' FROM TRIM(with_check)) = 'true'
);

SELECT 'D.3 Organisations Table - Permissive Boolean TRUE Active Policy Check (P0-4 Risk)' AS section;
SELECT
  p.policyname, p.permissive, p.roles, p.cmd AS operation, p.qual AS using_expression, p.with_check AS with_check_expression,
  c.relrowsecurity AS rls_enabled,
  CASE
    WHEN c.relrowsecurity = true THEN 'ACTIVE BYPASS POLICY'
    ELSE 'POLICY DEFINED BUT RLS DISABLED'
  END AS rls_status
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public' AND p.tablename = 'organisations'
AND (p.permissive = 'PERMISSIVE' OR p.permissive IS NULL)
AND (
  qual = 'true' OR with_check = 'true'
  OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true'
  OR TRIM(BOTH '()' FROM TRIM(with_check)) = 'true'
);

SELECT 'D.4 Mark Entries Table - All Policies & Anon/Public Access Check (P0-1 Risk)' AS section;
SELECT
  p.policyname, p.permissive, p.roles, p.cmd AS operation, p.qual AS using_expression, p.with_check AS with_check_expression,
  c.relrowsecurity AS rls_enabled
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public' AND p.tablename = 'mark_entries'
ORDER BY p.policyname;

SELECT 'D.4a Mark Entries High-Risk Permissive Access Risk Summary' AS section;
SELECT
  p.policyname, p.roles, p.cmd AS operation, p.qual AS using_expression,
  c.relrowsecurity AS rls_enabled,
  'HIGH RISK: Permissive public/anon/authenticated mark entry manipulation' AS risk_description
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public' AND p.tablename = 'mark_entries'
AND (p.permissive = 'PERMISSIVE' OR p.permissive IS NULL)
AND ('public'::name = ANY(p.roles) OR 'anon'::name = ANY(p.roles) OR 'authenticated'::name = ANY(p.roles))
AND p.cmd IN ('SELECT', 'INSERT', 'UPDATE', 'ALL')
AND (qual = 'true' OR with_check = 'true' OR qual IS NULL OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true');

SELECT 'D.5 Judge Tokens Table - Unrestricted Access Check (P0-2 Risk)' AS section;
SELECT
  p.policyname, p.permissive, p.roles, p.cmd AS operation, p.qual AS using_expression,
  c.relrowsecurity AS rls_enabled
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public' AND p.tablename = 'judge_tokens'
ORDER BY p.policyname;

SELECT 'D.5a Judge Tokens Public Token-Table Enumeration Risk Summary' AS section;
SELECT
  p.policyname, p.roles, p.cmd AS operation, p.qual AS using_expression,
  c.relrowsecurity AS rls_enabled,
  'CRITICAL RISK: Public/anon token table enumeration allowed' AS risk_description
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public' AND p.tablename = 'judge_tokens'
AND p.cmd IN ('SELECT', 'ALL')
AND ('public'::name = ANY(p.roles) OR 'anon'::name = ANY(p.roles))
AND (qual = 'true' OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true');

SELECT 'D.6 System API Keys Table - Policy Audit (P0-5 Risk)' AS section;
SELECT
  p.policyname, p.permissive, p.roles, p.cmd AS operation, p.qual AS using_expression,
  c.relrowsecurity AS rls_enabled
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public' AND p.tablename = 'system_api_keys'
ORDER BY p.policyname;

SELECT 'D.7 Policies Referencing Inconsistent / Unrecognized Roles (P0-8 Risk)' AS section;
SELECT p.tablename, p.policyname, p.roles, p.cmd AS operation, p.qual AS using_expression
FROM pg_policies p
WHERE p.schemaname = 'public'
AND (
  qual LIKE '%super_admin%' OR qual LIKE '%tenant_admin%' OR qual LIKE '%festival_admin%' OR qual LIKE '%admin_leader%' OR qual LIKE '%superadmin%'
  OR with_check LIKE '%super_admin%' OR with_check LIKE '%tenant_admin%' OR with_check LIKE '%festival_admin%' OR with_check LIKE '%admin_leader%' OR with_check LIKE '%superadmin%'
)
ORDER BY p.tablename, p.policyname;

SELECT 'D.8 Broad Authenticated Permissive Boolean TRUE Policies Audit (Type-Safe Role Inspection)' AS section;
SELECT
  p.tablename, p.policyname, p.roles, p.cmd AS operation, p.qual AS using_expression,
  c.relrowsecurity AS rls_enabled
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON c.relnamespace = n.oid AND n.nspname = p.schemaname
WHERE p.schemaname = 'public'
AND (p.permissive = 'PERMISSIVE' OR p.permissive IS NULL)
AND ('authenticated'::name = ANY(p.roles) OR 'public'::name = ANY(p.roles))
AND (
  qual = 'true' OR with_check = 'true'
  OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true'
  OR TRIM(BOTH '()' FROM TRIM(with_check)) = 'true'
)
ORDER BY p.tablename, p.policyname;


-- ============================================================================
-- PART E: QUERY-LEVEL PREREQUISITE MATRIX
-- ============================================================================
-- Purpose: Evaluate table and column existence specifically for each Part F and
--          Part G query. A query is marked ready_for_query = true if and only if
--          every required table and required column for THAT SPECIFIC QUERY exists.

SELECT 'E.1 Query-Level Prerequisite Matrix' AS section;

WITH query_prerequisites (query_id, target_section, required_tables, required_columns) AS (
  VALUES
    ('F.1', 'F.1 Tenant Count', ARRAY['tenants'], ARRAY['tenants.id']),
    ('F.2', 'F.2 Organisations Tenant Distribution', ARRAY['organisations'], ARRAY['organisations.tenant_id']),
    ('F.3', 'F.3 Participants Tenant Distribution', ARRAY['participants'], ARRAY['participants.tenant_id']),
    ('F.4', 'F.4 Participants NULL Tenant Count', ARRAY['participants'], ARRAY['participants.tenant_id']),
    ('F.5', 'F.5 Registrations Tenant Distribution', ARRAY['registrations'], ARRAY['registrations.tenant_id']),
    ('F.6', 'F.6 Registrations NULL Tenant Count', ARRAY['registrations'], ARRAY['registrations.tenant_id']),
    ('F.7', 'F.7 Festival Calendar Year Distribution', ARRAY['festival_calendar'], ARRAY['festival_calendar.festival_year', 'festival_calendar.is_active']),
    ('F.8', 'F.8 Active Festivals Per Tenant', ARRAY['festival_calendar'], ARRAY['festival_calendar.tenant_id', 'festival_calendar.is_active']),
    ('F.9', 'F.9 Participants Festival Distribution', ARRAY['participants'], ARRAY['participants.festival_id']),
    ('F.10', 'F.10 Participants NULL Festival Count', ARRAY['participants'], ARRAY['participants.festival_id']),
    ('F.11', 'F.11 Items Festival Distribution', ARRAY['items'], ARRAY['items.festival_id']),
    ('F.12', 'F.12 Results Festival Distribution', ARRAY['results'], ARRAY['results.festival_id']),
    ('F.13', 'F.13 Organisation Hierarchy Stats', ARRAY['organisations'], ARRAY['organisations.org_type', 'organisations.parent_id']),
    ('F.14', 'F.14 Orphan Organisations', ARRAY['organisations'], ARRAY['organisations.id', 'organisations.parent_id']),
    ('F.15', 'F.15 Cross-Tenant Parent-Child Links', ARRAY['organisations'], ARRAY['organisations.id', 'organisations.tenant_id', 'organisations.parent_id']),
    ('F.16', 'F.16 Profile Role Check Constraint', ARRAY['profiles'], ARRAY['profiles.role']),
    ('F.17', 'F.17 Distinct Role Values in Profiles', ARRAY['profiles'], ARRAY['profiles.role']),
    ('F.18', 'F.18 Superadmin Account Count', ARRAY['profiles'], ARRAY['profiles.is_superadmin']),
    ('F.19', 'F.19 Users with NULL Role in Profiles', ARRAY['profiles'], ARRAY['profiles.role']),
    ('F.20', 'F.20 Points Config Records Summary', ARRAY['points_config'], ARRAY['points_config.festival_id', 'points_config.rank_1_points', 'points_config.rank_2_points', 'points_config.rank_3_points', 'points_config.grade_a_plus_points', 'points_config.grade_a_points', 'points_config.grade_b_points', 'points_config.grade_c_points']),
    ('F.21', 'F.21 Results Grade Distribution', ARRAY['results'], ARRAY['results.grade', 'results.total_score']),
    ('F.22', 'F.22 Results Scores 70-74 Conflict Audit', ARRAY['results'], ARRAY['results.grade', 'results.total_score']),
    ('F.23', 'F.23 Scoring Rules Summary', ARRAY['scoring_rules'], ARRAY['scoring_rules.is_default', 'scoring_rules.tenant_id']),
    ('F.24', 'F.24 Judge Token Status Stats', ARRAY['judge_tokens'], ARRAY['judge_tokens.is_used', 'judge_tokens.expires_at']),
    ('F.25', 'F.25 Judge Tokens Linked to Missing Judges', ARRAY['judge_tokens', 'judges'], ARRAY['judge_tokens.judge_id', 'judges.id']),
    ('F.26', 'F.26 Judge Tokens Linked to Missing Schedules', ARRAY['judge_tokens', 'schedules'], ARRAY['judge_tokens.schedule_id', 'schedules.id']),
    ('F.27', 'F.27 Mark Entries Status Stats', ARRAY['mark_entries'], ARRAY['mark_entries.is_final', 'mark_entries.is_draft']),
    ('F.28', 'F.28 Mark Entries Linked to Missing Judges', ARRAY['mark_entries', 'judges'], ARRAY['mark_entries.judge_id', 'judges.id']),
    ('F.29', 'F.29 Duplicate Mark Entries Summary', ARRAY['mark_entries'], ARRAY['mark_entries.judge_id', 'mark_entries.schedule_id', 'mark_entries.registration_id']),
    ('F.30', 'F.30 Registrations Tenant Mismatch', ARRAY['registrations', 'participants'], ARRAY['registrations.participant_id', 'registrations.tenant_id', 'participants.id', 'participants.tenant_id']),
    ('F.31', 'F.31 Results Festival Mismatch', ARRAY['results', 'registrations', 'participants'], ARRAY['results.registration_id', 'results.festival_id', 'registrations.id', 'registrations.participant_id', 'participants.id', 'participants.festival_id']),
    ('F.32', 'F.32 Schedules Festival Mismatch', ARRAY['schedules', 'items'], ARRAY['schedules.item_id', 'schedules.festival_id', 'items.id', 'items.festival_id']),
    ('F.33', 'F.33 Relational Dangling References', ARRAY['registrations', 'participants', 'results', 'mark_entries'], ARRAY['registrations.participant_id', 'participants.id', 'results.registration_id', 'mark_entries.registration_id']),
    ('F.34', 'F.34 Participants Null vs Dangling Ownership', ARRAY['participants', 'tenants', 'festival_calendar'], ARRAY['participants.tenant_id', 'participants.festival_id', 'tenants.id', 'festival_calendar.id']),
    ('F.35', 'F.35 Multi-Festival Active Readiness Report', ARRAY['tenants', 'festival_calendar'], ARRAY['tenants.id', 'festival_calendar.tenant_id', 'festival_calendar.is_active']),
    ('F.36', 'F.36 Cross-Boundary Competition Integrity', ARRAY['registrations', 'participants', 'items', 'schedules', 'judges', 'mark_entries'], ARRAY['registrations.participant_id', 'registrations.item_id', 'participants.id', 'participants.festival_id', 'items.id', 'items.festival_id', 'schedules.id', 'schedules.festival_id', 'judges.id', 'judges.festival_id', 'mark_entries.judge_id', 'mark_entries.schedule_id']),
    ('G.1', 'G.1 System API Keys Provider Dist', ARRAY['system_api_keys'], ARRAY['system_api_keys.provider', 'system_api_keys.is_active']),
    ('G.2', 'G.2 File Metadata Asset Dist', ARRAY['file_metadata'], ARRAY['file_metadata.asset_type', 'file_metadata.tenant_id', 'file_metadata.festival_id']),
    ('G.3', 'G.3 Notifications Summary', ARRAY['notifications'], ARRAY['notifications.tenant_id']),
    ('G.4', 'G.4 Notification Logs Status Dist', ARRAY['notification_logs'], ARRAY['notification_logs.status']),
    ('G.5', 'G.5 User Notification Tokens Summary', ARRAY['user_notification_tokens'], ARRAY['user_notification_tokens.user_id']),
    ('G.6', 'G.6 Audit Logs Summary', ARRAY['audit_logs'], ARRAY['audit_logs.id']),
    ('G.7', 'G.7 System Events Summary', ARRAY['system_events'], ARRAY['system_events.id']),
    ('G.8', 'G.8 Participant Unit Batches Summary', ARRAY['participant_unit_batches'], ARRAY['participant_unit_batches.id']),
    ('G.9', 'G.9 Participant Unit Audit Logs Summary', ARRAY['participant_unit_audit_logs'], ARRAY['participant_unit_audit_logs.id']),
    ('G.10', 'G.10 Import Sessions Summary', ARRAY['import_sessions'], ARRAY['import_sessions.id']),
    ('G.11', 'G.11 Poster Templates Summary', ARRAY['poster_templates'], ARRAY['poster_templates.id']),
    ('G.12', 'G.12 Poster Drafts Summary', ARRAY['poster_drafts'], ARRAY['poster_drafts.id']),
    ('G.13', 'G.13 Poster Versions Summary', ARRAY['poster_versions'], ARRAY['poster_versions.id']),
    ('G.14', 'G.14 Generated Posters Summary', ARRAY['generated_posters'], ARRAY['generated_posters.id']),
    ('G.15', 'G.15 Generated Assets Summary', ARRAY['generated_assets'], ARRAY['generated_assets.id']),
    ('G.16', 'G.16 Export Jobs Summary', ARRAY['export_jobs'], ARRAY['export_jobs.id'])
)
SELECT
  qp.query_id,
  qp.target_section,
  qp.required_tables,
  (
    SELECT array_agg(t)
    FROM unnest(qp.required_tables) t
    WHERE EXISTS (
      SELECT 1 FROM information_schema.tables st WHERE st.table_schema = 'public' AND st.table_name = t
    )
  ) AS existing_tables,
  (
    SELECT array_agg(t)
    FROM unnest(qp.required_tables) t
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.tables st WHERE st.table_schema = 'public' AND st.table_name = t
    )
  ) AS missing_tables,
  (
    SELECT array_agg(col)
    FROM unnest(qp.required_columns) col
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      AND c.table_name = split_part(col, '.', 1)
      AND c.column_name = split_part(col, '.', 2)
    )
  ) AS missing_columns,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM unnest(qp.required_tables) t
      WHERE NOT EXISTS (SELECT 1 FROM information_schema.tables st WHERE st.table_schema = 'public' AND st.table_name = t)
    ) THEN false
    WHEN EXISTS (
      SELECT 1 FROM unnest(qp.required_columns) col
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = 'public'
        AND c.table_name = split_part(col, '.', 1)
        AND c.column_name = split_part(col, '.', 2)
      )
    ) THEN false
    ELSE true
  END AS ready_for_query
FROM query_prerequisites qp
ORDER BY qp.query_id;


-- ============================================================================
-- PART F: CORE DATA CHECKS
-- ============================================================================
-- Purpose: Schema-dependent aggregate checks on core application tables.
--          Returns ONLY counts, distributions, and non-sensitive metrics.
--          NEVER returns PII (names, emails, phone numbers, or passwords).
--
-- PREREQUISITE REQUIREMENT:
-- Check Part E Query-Level Prerequisite Matrix before running each query.

-- PREREQUISITE: Run only if F.1 is marked ready_for_query = true in Part E
SELECT 'F.1 Tenant Count' AS section;
SELECT COUNT(*)::bigint AS tenant_count FROM public.tenants;

-- PREREQUISITE: Run only if F.2 is marked ready_for_query = true in Part E
SELECT 'F.2 Organisations - Tenant Distribution' AS section;
SELECT tenant_id, COUNT(*)::bigint AS org_count
FROM public.organisations
GROUP BY tenant_id ORDER BY org_count DESC;

-- PREREQUISITE: Run only if F.3 is marked ready_for_query = true in Part E
SELECT 'F.3 Participants - Tenant Distribution' AS section;
SELECT tenant_id, COUNT(*)::bigint AS participant_count
FROM public.participants
GROUP BY tenant_id ORDER BY participant_count DESC;

-- PREREQUISITE: Run only if F.4 is marked ready_for_query = true in Part E
SELECT 'F.4 Participants - NULL tenant_id Count' AS section;
SELECT COUNT(*)::bigint AS null_tenant_count
FROM public.participants WHERE tenant_id IS NULL;

-- PREREQUISITE: Run only if F.5 is marked ready_for_query = true in Part E
SELECT 'F.5 Registrations - Tenant Distribution' AS section;
SELECT tenant_id, COUNT(*)::bigint AS registration_count
FROM public.registrations
GROUP BY tenant_id ORDER BY registration_count DESC;

-- PREREQUISITE: Run only if F.6 is marked ready_for_query = true in Part E
SELECT 'F.6 Registrations - NULL tenant_id Count' AS section;
SELECT COUNT(*)::bigint AS null_tenant_count
FROM public.registrations WHERE tenant_id IS NULL;

-- PREREQUISITE: Run only if F.7 is marked ready_for_query = true in Part E
SELECT 'F.7 Festival Calendar - Year Distribution' AS section;
SELECT
  festival_year,
  COUNT(*)::bigint AS festival_count,
  COUNT(*) FILTER (WHERE is_active = true)::bigint AS active_count
FROM public.festival_calendar
GROUP BY festival_year ORDER BY festival_year;

-- PREREQUISITE: Run only if F.8 is marked ready_for_query = true in Part E
SELECT 'F.8 Active Festivals Per Tenant' AS section;
SELECT tenant_id, COUNT(*)::bigint AS active_festival_count
FROM public.festival_calendar
WHERE is_active = true GROUP BY tenant_id;

-- PREREQUISITE: Run only if F.9 is marked ready_for_query = true in Part E
SELECT 'F.9 Participants - Festival Distribution (Top 20)' AS section;
SELECT festival_id, COUNT(*)::bigint AS participant_count
FROM public.participants
WHERE festival_id IS NOT NULL
GROUP BY festival_id ORDER BY participant_count DESC LIMIT 20;

-- PREREQUISITE: Run only if F.10 is marked ready_for_query = true in Part E
SELECT 'F.10 Participants - NULL festival_id Count' AS section;
SELECT COUNT(*)::bigint AS null_festival_count
FROM public.participants WHERE festival_id IS NULL;

-- PREREQUISITE: Run only if F.11 is marked ready_for_query = true in Part E
SELECT 'F.11 Items - Festival Distribution (Top 20)' AS section;
SELECT festival_id, COUNT(*)::bigint AS item_count
FROM public.items
GROUP BY festival_id ORDER BY item_count DESC LIMIT 20;

-- PREREQUISITE: Run only if F.12 is marked ready_for_query = true in Part E
SELECT 'F.12 Results - Festival Distribution (Top 20)' AS section;
SELECT festival_id, COUNT(*)::bigint AS result_count
FROM public.results
GROUP BY festival_id ORDER BY result_count DESC LIMIT 20;

-- PREREQUISITE: Run only if F.13 is marked ready_for_query = true in Part E
SELECT 'F.13 Organisation Hierarchy Stats' AS section;
SELECT
  org_type,
  COUNT(*)::bigint AS count,
  COUNT(*) FILTER (WHERE parent_id IS NULL)::bigint AS root_count,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL)::bigint AS child_count
FROM public.organisations
GROUP BY org_type ORDER BY count DESC;

-- PREREQUISITE: Run only if F.14 is marked ready_for_query = true in Part E
SELECT 'F.14 Orphan Organisations (Missing Parent Record)' AS section;
SELECT COUNT(*)::bigint AS orphan_count
FROM public.organisations o
WHERE o.parent_id IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM public.organisations p WHERE p.id = o.parent_id);

-- PREREQUISITE: Run only if F.15 is marked ready_for_query = true in Part E
SELECT 'F.15 Cross-Tenant Parent-Child Links (IS DISTINCT FROM)' AS section;
SELECT COUNT(*)::bigint AS cross_tenant_count
FROM public.organisations child
JOIN public.organisations parent ON child.parent_id = parent.id
WHERE child.tenant_id IS DISTINCT FROM parent.tenant_id;

-- PREREQUISITE: Run only if F.16 is marked ready_for_query = true in Part E
SELECT 'F.16 Profile Role Check Constraint Definition' AS section;
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.profiles')
AND contype = 'c';

-- PREREQUISITE: Run only if F.17 is marked ready_for_query = true in Part E
SELECT 'F.17 Distinct Role Values in Profiles Table' AS section;
SELECT role, COUNT(*)::bigint AS user_count
FROM public.profiles
GROUP BY role ORDER BY user_count DESC;

-- PREREQUISITE: Run only if F.18 is marked ready_for_query = true in Part E
SELECT 'F.18 Superadmin Account Count' AS section;
SELECT COUNT(*)::bigint AS superadmin_count
FROM public.profiles WHERE is_superadmin = true;

-- PREREQUISITE: Run only if F.19 is marked ready_for_query = true in Part E
SELECT 'F.19 Users with NULL Role in Profiles' AS section;
SELECT COUNT(*)::bigint AS null_role_count
FROM public.profiles WHERE role IS NULL;

-- PREREQUISITE: Run only if F.20 is marked ready_for_query = true in Part E
SELECT 'F.20 Points Config Records Summary' AS section;
SELECT
  festival_id,
  rank_1_points, rank_2_points, rank_3_points,
  grade_a_plus_points, grade_a_points, grade_b_points, grade_c_points
FROM public.points_config LIMIT 10;

-- PREREQUISITE: Run only if F.21 is marked ready_for_query = true in Part E
SELECT 'F.21 Results Grade Distribution & Score Range Summary (Type-Safe Numeric Rounding)' AS section;
SELECT
  grade,
  COUNT(*)::bigint AS count,
  MIN(total_score) AS min_score,
  MAX(total_score) AS max_score,
  ROUND(AVG(total_score)::numeric, 2) AS avg_score
FROM public.results
WHERE grade IS NOT NULL
GROUP BY grade ORDER BY count DESC;

-- PREREQUISITE: Run only if F.22 is marked ready_for_query = true in Part E
SELECT 'F.22 Results with Scores 70-74 (Grade Threshold Conflict Audit - P0-7)' AS section;
SELECT
  COUNT(*)::bigint AS total_70_to_74_results,
  COUNT(*) FILTER (WHERE grade = 'A')::bigint AS graded_a_70_to_74,
  COUNT(*) FILTER (WHERE grade IS NULL OR grade != 'A')::bigint AS graded_non_a_70_to_74
FROM public.results
WHERE total_score >= 70 AND total_score < 75;

-- PREREQUISITE: Run only if F.23 is marked ready_for_query = true in Part E
SELECT 'F.23 Scoring Rules Summary' AS section;
SELECT
  COUNT(*)::bigint AS total_rules,
  COUNT(*) FILTER (WHERE is_default = true)::bigint AS default_rules,
  COUNT(*) FILTER (WHERE tenant_id IS NULL)::bigint AS global_rules
FROM public.scoring_rules;

-- PREREQUISITE: Run only if F.24 is marked ready_for_query = true in Part E
SELECT 'F.24 Judge Token Status Stats (P0-2 Risk)' AS section;
SELECT
  COUNT(*)::bigint AS total_tokens,
  COUNT(*) FILTER (WHERE is_used = false)::bigint AS unused_tokens,
  COUNT(*) FILTER (WHERE is_used = true)::bigint AS used_tokens,
  COUNT(*) FILTER (WHERE expires_at IS NULL)::bigint AS no_expiry_count
FROM public.judge_tokens;

-- PREREQUISITE: Run only if F.25 is marked ready_for_query = true in Part E
SELECT 'F.25 Judge Tokens Linked to Missing Judges (Split Null vs Dangling)' AS section;
SELECT
  COUNT(*) FILTER (WHERE jt.judge_id IS NULL)::bigint AS tokens_with_null_judge_id,
  COUNT(*) FILTER (WHERE jt.judge_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.judges j WHERE j.id = jt.judge_id))::bigint AS tokens_with_missing_judge_record
FROM public.judge_tokens jt;

-- PREREQUISITE: Run only if F.26 is marked ready_for_query = true in Part E
SELECT 'F.26 Judge Tokens Linked to Missing Schedules (Split Null vs Dangling)' AS section;
SELECT
  COUNT(*) FILTER (WHERE jt.schedule_id IS NULL)::bigint AS tokens_with_null_schedule_id,
  COUNT(*) FILTER (WHERE jt.schedule_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.id = jt.schedule_id))::bigint AS tokens_with_missing_schedule_record
FROM public.judge_tokens jt;

-- PREREQUISITE: Run only if F.27 is marked ready_for_query = true in Part E
SELECT 'F.27 Mark Entries Status Stats (P0-1 Risk)' AS section;
SELECT
  COUNT(*)::bigint AS total_marks,
  COUNT(*) FILTER (WHERE is_final = true)::bigint AS finalized_count,
  COUNT(*) FILTER (WHERE is_draft = true)::bigint AS draft_count
FROM public.mark_entries;

-- PREREQUISITE: Run only if F.28 is marked ready_for_query = true in Part E
SELECT 'F.28 Mark Entries Linked to Missing Judges (Split Null vs Dangling)' AS section;
SELECT
  COUNT(*) FILTER (WHERE me.judge_id IS NULL)::bigint AS marks_with_null_judge_id,
  COUNT(*) FILTER (WHERE me.judge_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.judges j WHERE j.id = me.judge_id))::bigint AS marks_with_missing_judge_record
FROM public.mark_entries me;

-- PREREQUISITE: Run only if F.29 is marked ready_for_query = true in Part E
SELECT 'F.29 Duplicate Mark Entries Aggregate Summary' AS section;
SELECT
  COUNT(*)::bigint AS total_duplicate_groups,
  COALESCE(MAX(dup_count), 0)::bigint AS max_duplicates_in_single_group,
  COALESCE(SUM(dup_count - 1), 0)::bigint AS total_excess_duplicate_rows
FROM (
  SELECT COUNT(*) AS dup_count
  FROM public.mark_entries
  GROUP BY judge_id, schedule_id, registration_id
  HAVING COUNT(*) > 1
) sub;

-- PREREQUISITE: Run only if F.30 is marked ready_for_query = true in Part E
SELECT 'F.30 Boundary Integrity - Registrations Tenant Mismatch with Participant Tenant (IS DISTINCT FROM)' AS section;
SELECT COUNT(*)::bigint AS tenant_mismatch_count
FROM public.registrations r
JOIN public.participants p ON r.participant_id = p.id
WHERE r.tenant_id IS DISTINCT FROM p.tenant_id;

-- PREREQUISITE: Run only if F.31 is marked ready_for_query = true in Part E
SELECT 'F.31 Boundary Integrity - Results Festival Mismatch with Participant Festival (IS DISTINCT FROM)' AS section;
SELECT COUNT(*)::bigint AS festival_mismatch_count
FROM public.results res
JOIN public.registrations r ON res.registration_id = r.id
JOIN public.participants p ON r.participant_id = p.id
WHERE res.festival_id IS DISTINCT FROM p.festival_id;

-- PREREQUISITE: Run only if F.32 is marked ready_for_query = true in Part E
SELECT 'F.32 Boundary Integrity - Schedules Festival Mismatch with Item Festival (IS DISTINCT FROM)' AS section;
SELECT COUNT(*)::bigint AS schedule_item_festival_mismatch_count
FROM public.schedules s
JOIN public.items i ON s.item_id = i.id
WHERE s.festival_id IS DISTINCT FROM i.festival_id;

-- PREREQUISITE: Run only if F.33 is marked ready_for_query = true in Part E
SELECT 'F.33 Boundary Integrity - Relational Dangling References Analysis' AS section;
SELECT
  (SELECT COUNT(*)::bigint FROM public.registrations r WHERE r.participant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.participants p WHERE p.id = r.participant_id)) AS registrations_missing_participant_record,
  (SELECT COUNT(*)::bigint FROM public.results res WHERE res.registration_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = res.registration_id)) AS results_missing_registration_record,
  (SELECT COUNT(*)::bigint FROM public.mark_entries me WHERE me.registration_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.registrations r WHERE r.id = me.registration_id)) AS marks_missing_registration_record;

-- PREREQUISITE: Run only if F.34 is marked ready_for_query = true in Part E
SELECT 'F.34 Boundary Integrity - Participants Ownership Analysis (Split Null vs Dangling)' AS section;
SELECT
  COUNT(*) FILTER (WHERE p.tenant_id IS NULL)::bigint AS participants_with_null_tenant,
  COUNT(*) FILTER (WHERE p.tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id = p.tenant_id))::bigint AS participants_with_missing_tenant_record,
  COUNT(*) FILTER (WHERE p.festival_id IS NULL)::bigint AS participants_with_null_festival,
  COUNT(*) FILTER (WHERE p.festival_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id = p.festival_id))::bigint AS participants_with_missing_festival_record
FROM public.participants p;

-- PREREQUISITE: Run only if F.35 is marked ready_for_query = true in Part E
SELECT 'F.35 Tenant Active Festival Multi-Festival Decision Report' AS section;
SELECT
  COUNT(*) FILTER (WHERE is_tenant_active = true AND active_festival_count = 0)::bigint AS active_tenants_with_zero_active_festivals,
  COUNT(*) FILTER (WHERE is_tenant_active = true AND active_festival_count = 1)::bigint AS active_tenants_with_single_active_festival,
  COUNT(*) FILTER (WHERE is_tenant_active = true AND active_festival_count > 1)::bigint AS active_tenants_with_multiple_active_festivals,
  COUNT(*) FILTER (WHERE is_tenant_active = false AND active_festival_count = 0)::bigint AS inactive_tenants_with_zero_active_festivals,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.tenants t JOIN public.festival_calendar f ON t.id = f.tenant_id WHERE t.is_active = true AND f.is_active = true GROUP BY t.id HAVING COUNT(f.id) > 1)
      THEN 'Architecture decision required: Multi-active festival mode detected'
    ELSE 'Single active festival mode compliant'
  END AS multi_festival_architecture_status
FROM (
  SELECT t.id AS tenant_id, t.is_active AS is_tenant_active, COUNT(f.id) FILTER (WHERE f.is_active = true) AS active_festival_count
  FROM public.tenants t
  LEFT JOIN public.festival_calendar f ON t.id = f.tenant_id
  GROUP BY t.id, t.is_active
) sub;

-- PREREQUISITE: Run only if F.36 is marked ready_for_query = true in Part E
SELECT 'F.36 Boundary Integrity - Cross-Boundary Competition Alignment' AS section;
SELECT
  (
    SELECT COUNT(*)::bigint
    FROM public.registrations r
    JOIN public.participants p ON r.participant_id = p.id
    JOIN public.items i ON r.item_id = i.id
    WHERE p.festival_id IS DISTINCT FROM i.festival_id
  ) AS registration_participant_item_festival_mismatch_count,
  (
    SELECT COUNT(*)::bigint
    FROM public.results res
    JOIN public.registrations r ON res.registration_id = r.id
    JOIN public.items i ON r.item_id = i.id
    WHERE res.festival_id IS DISTINCT FROM i.festival_id
  ) AS result_item_festival_mismatch_count,
  (
    SELECT COUNT(*)::bigint
    FROM public.schedules s
    JOIN public.judge_tokens jt ON jt.schedule_id = s.id
    JOIN public.judges j ON jt.judge_id = j.id
    WHERE j.festival_id IS DISTINCT FROM s.festival_id
  ) AS judge_schedule_festival_mismatch_count,
  (
    SELECT COUNT(*)::bigint
    FROM public.mark_entries me
    JOIN public.judges j ON me.judge_id = j.id
    JOIN public.schedules s ON me.schedule_id = s.id
    WHERE j.festival_id IS DISTINCT FROM s.festival_id
  ) AS mark_judge_schedule_festival_mismatch_count,
  (
    SELECT COUNT(*)::bigint
    FROM public.mark_entries me
    JOIN public.registrations r ON me.registration_id = r.id
    JOIN public.items i ON r.item_id = i.id
    JOIN public.schedules s ON me.schedule_id = s.id
    WHERE i.festival_id IS DISTINCT FROM s.festival_id
  ) AS mark_item_schedule_festival_mismatch_count;


-- ============================================================================
-- PART G: OPTIONAL MODULE CHECKS
-- ============================================================================
-- Purpose: Schema-dependent queries for optional modules.
--          Run each query ONLY IF Part E matrix confirms ready_for_query = true.

-- PREREQUISITE: Run only if G.1 is marked ready_for_query = true in Part E
SELECT 'G.1 System API Keys Provider Distribution (P0-5 Risk - NO Raw Keys Output)' AS section;
SELECT
  provider,
  COUNT(*)::bigint AS key_count,
  COUNT(*) FILTER (WHERE is_active = true)::bigint AS active_count
FROM public.system_api_keys
GROUP BY provider;

-- PREREQUISITE: Run only if G.2 is marked ready_for_query = true in Part E
SELECT 'G.2 File Metadata Asset Distribution' AS section;
SELECT
  asset_type,
  COUNT(*)::bigint AS count,
  COUNT(DISTINCT tenant_id)::bigint AS tenant_count,
  COUNT(DISTINCT festival_id)::bigint AS festival_count
FROM public.file_metadata
GROUP BY asset_type ORDER BY count DESC;

-- PREREQUISITE: Run only if G.3 is marked ready_for_query = true in Part E
SELECT 'G.3 Notifications Summary' AS section;
SELECT
  COUNT(*)::bigint AS total_notifications,
  COUNT(DISTINCT tenant_id)::bigint AS tenant_count
FROM public.notifications;

-- PREREQUISITE: Run only if G.4 is marked ready_for_query = true in Part E
SELECT 'G.4 Notification Logs Status Distribution' AS section;
SELECT status, COUNT(*)::bigint AS count
FROM public.notification_logs GROUP BY status;

-- PREREQUISITE: Run only if G.5 is marked ready_for_query = true in Part E
SELECT 'G.5 User Notification Tokens Summary' AS section;
SELECT
  COUNT(*)::bigint AS total_tokens,
  COUNT(DISTINCT user_id)::bigint AS unique_users
FROM public.user_notification_tokens;

-- PREREQUISITE: Run only if G.6 is marked ready_for_query = true in Part E
SELECT 'G.6 Audit Logs Summary' AS section;
SELECT COUNT(*)::bigint AS total_audit_logs FROM public.audit_logs;

-- PREREQUISITE: Run only if G.7 is marked ready_for_query = true in Part E
SELECT 'G.7 System Events Summary' AS section;
SELECT COUNT(*)::bigint AS total_system_events FROM public.system_events;

-- PREREQUISITE: Run only if G.8 is marked ready_for_query = true in Part E
SELECT 'G.8 Participant Unit Batches Summary' AS section;
SELECT COUNT(*)::bigint AS total_batches FROM public.participant_unit_batches;

-- PREREQUISITE: Run only if G.9 is marked ready_for_query = true in Part E
SELECT 'G.9 Participant Unit Audit Logs Summary' AS section;
SELECT COUNT(*)::bigint AS total_unit_audit_logs FROM public.participant_unit_audit_logs;

-- PREREQUISITE: Run only if G.10 is marked ready_for_query = true in Part E
SELECT 'G.10 Import Sessions Summary' AS section;
SELECT COUNT(*)::bigint AS total_import_sessions FROM public.import_sessions;

-- PREREQUISITE: Run only if G.11 is marked ready_for_query = true in Part E
SELECT 'G.11 Poster Templates Summary' AS section;
SELECT COUNT(*)::bigint AS total_templates FROM public.poster_templates;

-- PREREQUISITE: Run only if G.12 is marked ready_for_query = true in Part E
SELECT 'G.12 Poster Drafts Summary' AS section;
SELECT COUNT(*)::bigint AS total_drafts FROM public.poster_drafts;

-- PREREQUISITE: Run only if G.13 is marked ready_for_query = true in Part E
SELECT 'G.13 Poster Versions Summary' AS section;
SELECT COUNT(*)::bigint AS total_versions FROM public.poster_versions;

-- PREREQUISITE: Run only if G.14 is marked ready_for_query = true in Part E
SELECT 'G.14 Generated Posters Summary' AS section;
SELECT COUNT(*)::bigint AS total_generated FROM public.generated_posters;

-- PREREQUISITE: Run only if G.15 is marked ready_for_query = true in Part E
SELECT 'G.15 Generated Assets Summary' AS section;
SELECT COUNT(*)::bigint AS total_assets FROM public.generated_assets;

-- PREREQUISITE: Run only if G.16 is marked ready_for_query = true in Part E
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
