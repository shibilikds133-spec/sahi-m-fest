-- ============================================================================
-- DATABASE RUNTIME VERIFICATION SCRIPT (READ-ONLY)
-- ============================================================================
-- Purpose: Verify the actual state of the Supabase database against repository
--          migration expectations. All queries are SELECT-only.
--
-- How to run:
--   1. Open Supabase Dashboard → SQL Editor
--   2. Paste this entire script
--   3. Execute as postgres/Service Role (for full catalog access)
--   4. Review results and report findings
--
-- Safety: This script contains ONLY SELECT, SHOW, and catalog queries.
--         It does NOT modify any data, schema, or configuration.
-- ============================================================================

-- ============================================================================
-- SECTION 1: ENVIRONMENT IDENTIFICATION
-- ============================================================================

SELECT '1.1 Database Version' AS section;
SELECT version() AS postgres_version;

SELECT '1.2 Current Database' AS section;
SELECT current_database() AS database_name, current_user AS current_role;

SELECT '1.3 Supabase Project Info' AS section;
SELECT
  current_setting('app.settings.project_ref', true) AS project_ref,
  current_setting('app.settings.region', true) AS region;

-- ============================================================================
-- SECTION 2: MIGRATION HISTORY
-- ============================================================================

SELECT '2.1 Migration History Table' AS section;
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'supabase_migrations'
  AND table_name = 'schema_migrations'
) AS migration_table_exists;

SELECT '2.2 Applied Migrations' AS section;
-- This queries Supabase's migration tracking table
SELECT version, name, statements, executed_at
FROM supabase_migrations.schema_migrations
ORDER BY version;

SELECT '2.3 Migration Count' AS section;
SELECT COUNT(*) AS total_applied_migrations
FROM supabase_migrations.schema_migrations;

-- ============================================================================
-- SECTION 3: TABLE INVENTORY
-- ============================================================================

SELECT '3.1 All Public Tables' AS section;
SELECT
  tablename,
  rowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = t.tablename AND schemaname = 'public') AS policy_count
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

SELECT '3.2 Table Row Counts' AS section;
SELECT
  schemaname,
  tablename,
  n_live_tup AS estimated_row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- ============================================================================
-- SECTION 4: RLS POLICY INVENTORY
-- ============================================================================

SELECT '4.1 All RLS Policies' AS section;
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

SELECT '4.2 Tables with RLS Enabled' AS section;
SELECT
  t.tablename,
  t.rowsecurity AS rls_enabled,
  t.forcerowsecurity AS rls_forced,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename AND p.schemaname = 'public') AS policy_count
FROM pg_tables t
WHERE t.schemaname = 'public'
AND t.rowsecurity = true
ORDER BY t.tablename;

SELECT '4.3 Tables WITHOUT RLS (Potential Risk)' AS section;
SELECT
  t.tablename,
  t.rowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.tablename = t.tablename AND p.schemaname = 'public') AS policy_count
FROM pg_tables t
WHERE t.schemaname = 'public'
AND t.rowsecurity = false
ORDER BY t.tablename;

-- ============================================================================
-- SECTION 5: CRITICAL RLS VERIFICATION
-- ============================================================================

SELECT '5.1 Participants RLS - Any USING (true) Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'participants'
AND (qual = 'true'::text OR with_check = 'true'::text);

SELECT '5.2 Organisations RLS - Any USING (true) Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'organisations'
AND (qual = 'true'::text OR with_check = 'true'::text);

SELECT '5.3 Mark Entries RLS - Full Audit' AS section;
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

SELECT '5.4 Mark Entries - Anon/Public Access Check' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'mark_entries'
AND (roles @> ARRAY['anon']::text[] OR roles @> ARRAY['public']::text[]);

SELECT '5.5 Judge Tokens RLS - Full Audit' AS section;
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

SELECT '5.6 Judge Tokens - Public SELECT Check' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'judge_tokens'
AND cmd = 'SELECT'
AND qual = 'true'::text;

SELECT '5.7 System API Keys RLS' AS section;
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'system_api_keys'
  ) AS table_exists;

SELECT '5.8 System API Keys - Policies' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'system_api_keys';

SELECT '5.9 Leaderboard Settings RLS - Broken Role References' AS section;
SELECT
  policyname,
  roles,
  cmd AS operation,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
AND tablename = 'festival_leaderboard_settings'
AND (qual LIKE '%super_admin%' OR qual LIKE '%tenant_admin%' OR qual LIKE '%festival_admin%');

SELECT '5.10 Poster Templates RLS - Broken Role References' AS section;
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
-- SECTION 6: ROLE MODEL
-- ============================================================================

SELECT '6.1 Profile Role Check Constraint' AS section;
SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
AND contype = 'c';

SELECT '6.2 Distinct Role Values in Profiles' AS section;
SELECT
  role,
  COUNT(*) AS user_count
FROM public.profiles
GROUP BY role
ORDER BY user_count DESC;

SELECT '6.3 Superadmin Count' AS section;
SELECT
  COUNT(*) AS superadmin_count
FROM public.profiles
WHERE is_superadmin = true;

SELECT '6.4 Users with NULL Role' AS section;
SELECT
  COUNT(*) AS null_role_count
FROM public.profiles
WHERE role IS NULL;

-- ============================================================================
-- SECTION 7: FUNCTIONS AND RPCS
-- ============================================================================

SELECT '7.1 All Public Functions' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  pg_get_function_expr(p.oid) AS function_source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;

SELECT '7.2 SECURITY DEFINER Functions' AS section;
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prosecdef = true
ORDER BY p.proname;

SELECT '7.3 Function Grants to anon/authenticated/public' AS section;
SELECT
  p.proname AS function_name,
  r.rolname AS grantee,
  has_function_privilege(r.oid, p.oid, 'EXECUTE') AS can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'public')
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname, r.rolname;

SELECT '7.4 Helper Functions - get_my_tenant_id' AS section;
SELECT
  p.proname,
  pg_get_function_expr(p.oid) AS source,
  p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_my_tenant_id';

SELECT '7.5 Helper Functions - is_superadmin' AS section;
SELECT
  p.proname,
  pg_get_function_expr(p.oid) AS source,
  p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'is_superadmin';

SELECT '7.6 Hard-coded Year in ssf_get_category' AS section;
SELECT
  p.proname,
  pg_get_function_expr(p.oid) AS source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'ssf_get_category';

SELECT '7.7 Hard-coded Year in get_public_leaderboard' AS section;
SELECT
  p.proname,
  pg_get_function_expr(p.oid) AS source
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_public_leaderboard';

-- ============================================================================
-- SECTION 8: VIEWS
-- ============================================================================

SELECT '8.1 All Views' AS section;
SELECT
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;

-- ============================================================================
-- SECTION 9: TENANT DATA OWNERSHIP
-- ============================================================================

SELECT '9.1 Tenant Count' AS section;
SELECT COUNT(*) AS tenant_count FROM public.tenants;

SELECT '9.2 Organisations - Tenant Distribution' AS section;
SELECT
  tenant_id,
  COUNT(*) AS org_count
FROM public.organisations
GROUP BY tenant_id
ORDER BY org_count DESC;

SELECT '9.3 Participants - Tenant Distribution' AS section;
SELECT
  tenant_id,
  COUNT(*) AS participant_count
FROM public.participants
GROUP BY tenant_id
ORDER BY participant_count DESC;

SELECT '9.4 Participants - NULL tenant_id Count' AS section;
SELECT
  COUNT(*) AS null_tenant_count
FROM public.participants
WHERE tenant_id IS NULL;

SELECT '9.5 Registrations - Tenant Distribution' AS section;
SELECT
  tenant_id,
  COUNT(*) AS registration_count
FROM public.registrations
GROUP BY tenant_id
ORDER BY registration_count DESC;

SELECT '9.6 Registrations - NULL tenant_id Count' AS section;
SELECT
  COUNT(*) AS null_tenant_count
FROM public.registrations
WHERE tenant_id IS NULL;

-- ============================================================================
-- SECTION 10: FESTIVAL DATA OWNERSHIP
-- ============================================================================

SELECT '10.1 Festival Calendar - Year Distribution' AS section;
SELECT
  festival_year,
  COUNT(*) AS festival_count,
  COUNT(*) FILTER (WHERE is_active = true) AS active_count
FROM public.festival_calendar
GROUP BY festival_year
ORDER BY festival_year;

SELECT '10.2 Festival Calendar - Active Festivals Per Tenant' AS section;
SELECT
  tenant_id,
  COUNT(*) AS active_festival_count
FROM public.festival_calendar
WHERE is_active = true
GROUP BY tenant_id;

SELECT '10.3 Participants - Festival Distribution' AS section;
SELECT
  festival_id,
  COUNT(*) AS participant_count
FROM public.participants
WHERE festival_id IS NOT NULL
GROUP BY festival_id
ORDER BY participant_count DESC
LIMIT 20;

SELECT '10.4 Participants - NULL festival_id Count' AS section;
SELECT
  COUNT(*) AS null_festival_count
FROM public.participants
WHERE festival_id IS NULL;

SELECT '10.5 Items - Festival Distribution' AS section;
SELECT
  festival_id,
  COUNT(*) AS item_count
FROM public.items
GROUP BY festival_id
ORDER BY item_count DESC
LIMIT 20;

SELECT '10.6 Results - Festival Distribution' AS section;
SELECT
  festival_id,
  COUNT(*) AS result_count
FROM public.results
GROUP BY festival_id
ORDER BY result_count DESC
LIMIT 20;

-- ============================================================================
-- SECTION 11: ORGANISATION HIERARCHY
-- ============================================================================

SELECT '11.1 Organisation Hierarchy Stats' AS section;
SELECT
  org_type,
  COUNT(*) AS count,
  COUNT(*) FILTER (WHERE parent_id IS NULL) AS root_count,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL) AS child_count
FROM public.organisations
GROUP BY org_type
ORDER BY count DESC;

SELECT '11.2 Organisations with Missing Parent Reference' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.organisations o
WHERE o.parent_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.organisations p WHERE p.id = o.parent_id
);

SELECT '11.3 Cross-Tenant Parent-Child Links' AS section;
SELECT
  COUNT(*) AS cross_tenant_count
FROM public.organisations child
JOIN public.organisations parent ON child.parent_id = parent.id
WHERE child.tenant_id != parent.tenant_id;

-- ============================================================================
-- SECTION 12: GRADE AND POINT DATA
-- ============================================================================

SELECT '12.1 Points Config Records' AS section;
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

SELECT '12.2 Results Grade Distribution' AS section;
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

SELECT '12.3 Results with Scores 70-74 (Affected by Grade Inconsistency)' AS section;
SELECT
  COUNT(*) AS affected_count,
  COUNT(*) FILTER (WHERE grade = 'A') AS graded_a,
  COUNT(*) FILTER (WHERE grade IS NULL OR grade = 'D') AS graded_other
FROM public.results
WHERE total_score >= 70 AND total_score < 75;

SELECT '12.4 Scoring Rules Count' AS section;
SELECT
  COUNT(*) AS total_rules,
  COUNT(*) FILTER (WHERE is_default = true) AS default_rules,
  COUNT(*) FILTER (WHERE tenant_id IS NULL) AS global_rules
FROM public.scoring_rules;

-- ============================================================================
-- SECTION 13: JUDGE TOKEN AND MARK INTEGRITY
-- ============================================================================

SELECT '13.1 Judge Token Stats' AS section;
SELECT
  COUNT(*) AS total_tokens,
  COUNT(*) FILTER (WHERE is_used = false) AS unused_tokens,
  COUNT(*) FILTER (WHERE is_used = true) AS used_tokens,
  COUNT(*) FILTER (WHERE expires_at IS NULL) AS no_expiry_count
FROM public.judge_tokens;

SELECT '13.2 Judge Tokens Linked to Missing Judges' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.judge_tokens jt
WHERE NOT EXISTS (
  SELECT 1 FROM public.judges j WHERE j.id = jt.judge_id
);

SELECT '13.3 Judge Tokens Linked to Missing Schedules' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.judge_tokens jt
WHERE NOT EXISTS (
  SELECT 1 FROM public.schedules s WHERE s.id = jt.schedule_id
);

SELECT '13.4 Mark Entries Stats' AS section;
SELECT
  COUNT(*) AS total_marks,
  COUNT(*) FILTER (WHERE is_final = true) AS finalized_count,
  COUNT(*) FILTER (WHERE is_draft = true) AS draft_count
FROM public.mark_entries;

SELECT '13.5 Mark Entries Linked to Missing Judges' AS section;
SELECT
  COUNT(*) AS orphan_count
FROM public.mark_entries me
WHERE NOT EXISTS (
  SELECT 1 FROM public.judges j WHERE j.id = me.judge_id
);

SELECT '13.6 Duplicate Mark Entries (Same Judge/Schedule/Registration)' AS section;
SELECT
  judge_id,
  schedule_id,
  registration_id,
  COUNT(*) AS duplicate_count
FROM public.mark_entries
GROUP BY judge_id, schedule_id, registration_id
HAVING COUNT(*) > 1;

-- ============================================================================
-- SECTION 14: SYSTEM API KEYS
-- ============================================================================

SELECT '14.1 System API Keys Existence' AS section;
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'system_api_keys'
  ) AS table_exists;

SELECT '14.2 System API Keys Row Count' AS section;
-- Only count, never expose key values
SELECT COUNT(*) AS total_keys FROM public.system_api_keys;

SELECT '14.3 System API Keys Provider Distribution' AS section;
SELECT
  provider,
  COUNT(*) AS key_count,
  COUNT(*) FILTER (WHERE is_active = true) AS active_count
FROM public.system_api_keys
GROUP BY provider;

-- ============================================================================
-- SECTION 15: STORAGE METADATA
-- ============================================================================

SELECT '15.1 File Metadata Stats' AS section;
SELECT
  asset_type,
  COUNT(*) AS count,
  COUNT(DISTINCT tenant_id) AS tenant_count,
  COUNT(DISTINCT festival_id) AS festival_count
FROM public.file_metadata
GROUP BY asset_type
ORDER BY count DESC;

SELECT '15.2 File Metadata - NULL tenant_id' AS section;
SELECT
  COUNT(*) AS null_tenant_count
FROM public.file_metadata
WHERE tenant_id IS NULL;

SELECT '15.3 File Metadata - NULL festival_id' AS section;
SELECT
  COUNT(*) AS null_festival_count
FROM public.file_metadata
WHERE festival_id IS NULL;

-- ============================================================================
-- SECTION 16: COMMUNICATION AND NOTIFICATIONS
-- ============================================================================

SELECT '16.1 Notifications Stats' AS section;
SELECT
  COUNT(*) AS total_notifications,
  COUNT(DISTINCT tenant_id) AS tenant_count
FROM public.notifications;

SELECT '16.2 Notification Logs Stats' AS section;
SELECT
  status,
  COUNT(*) AS count
FROM public.notification_logs
GROUP BY status;

SELECT '16.3 User Notification Tokens Count' AS section;
SELECT
  COUNT(*) AS total_tokens,
  COUNT(DISTINCT user_id) AS unique_users
FROM public.user_notification_tokens;

-- ============================================================================
-- SECTION 17: AUDIT AND SYSTEM TABLES
-- ============================================================================

SELECT '17.1 Audit Logs Count' AS section;
SELECT COUNT(*) AS total_audit_logs FROM public.audit_logs;

SELECT '17.2 System Events Count' AS section;
SELECT COUNT(*) AS total_events FROM public.system_events;

SELECT '17.3 Participant Unit Batches Count' AS section;
SELECT COUNT(*) AS total_batches FROM public.participant_unit_batches;

SELECT '17.4 Participant Unit Audit Logs Count' AS section;
SELECT COUNT(*) AS total_audit_logs FROM public.participant_unit_audit_logs;

SELECT '17.5 Import Sessions Count' AS section;
SELECT COUNT(*) AS total_sessions FROM public.import_sessions;

-- ============================================================================
-- SECTION 18: POSTER STUDIO
-- ============================================================================

SELECT '18.1 Poster Templates Count' AS section;
SELECT COUNT(*) AS total_templates FROM public.poster_templates;

SELECT '18.2 Poster Drafts Count' AS section;
SELECT COUNT(*) AS total_drafts FROM public.poster_drafts;

SELECT '18.3 Poster Versions Count' AS section;
SELECT COUNT(*) AS total_versions FROM public.poster_versions;

SELECT '18.4 Generated Posters Count' AS section;
SELECT COUNT(*) AS total_generated FROM public.generated_posters;

SELECT '18.5 Generated Assets Count' AS section;
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'generated_assets'
  ) AS table_exists;

SELECT '18.6 Export Jobs Count' AS section;
SELECT
  EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'export_jobs'
  ) AS table_exists;

-- ============================================================================
-- SECTION 19: INDEX INVENTORY
-- ============================================================================

SELECT '19.1 All Indexes on Public Tables' AS section;
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IS NOT NULL
ORDER BY tablename, indexname;

-- ============================================================================
-- SECTION 20: TRIGGER INVENTORY
-- ============================================================================

SELECT '20.1 All Triggers on Public Tables' AS section;
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
-- END OF VERIFICATION SCRIPT
-- ============================================================================
SELECT 'Verification complete. Review all sections above.' AS status;
