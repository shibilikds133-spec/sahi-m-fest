# Database Verification Package — Repository Evidence & Validation Analysis

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Scope**: Full repository-backed empirical validation of `database_readonly_verification_final.sql` and `database_verification_forensic_optional.sql`  

---

## 1. Repository Sources Reviewed

The verification package was validated against the following repository sources across the codebase:

### Database & Migrations (77 Migration Files & 11 Root SQL Files)
* `supabase/migrations/001_initial_schema.sql` (Core tables: tenants, festival_calendar, categories, items, points_config, participants, registrations, schedules, judges, mark_entries, results, venues)
* `supabase/migrations/002_auth_profiles.sql` (Profiles table, auth.users link, role check constraint)
* `supabase/migrations/007_flexible_hierarchy.sql` (Organisations table creation, parent_id adjacency list, organisation_id on participants/registrations)
* `supabase/migrations/008_superadmin_setup.sql` & `009_tenant_management_funcs.sql` (is_superadmin flag, tenant management)
* `supabase/migrations/011_multi_tenant_rls.sql` (Multi-tenant RLS functions `get_my_tenant_id()`, `is_superadmin()`, core policies)
* `supabase/migrations/013_hierarchical_orgs.sql` (RPC `setup_child_organisation`)
* `supabase/migrations/019_judge_tokens.sql` (Judge tokens table & public SELECT policy `USING (true)`)
* `supabase/migrations/022_scoring_rules.sql` (Scoring rules & criteria tables, global default rules seed data)
* `supabase/migrations/023_expanded_points_config.sql` (Expanded points config columns: ind_a_plus_points, grp_a_plus_points)
* `supabase/migrations/025_r2_storage_metadata.sql` (File metadata table & RLS policies)
* `supabase/migrations/027_judge_portal_rls_bypass.sql` (Judge portal RLS bypass policies on `mark_entries` FOR SELECT/INSERT/UPDATE TO public, anon, authenticated)
* `supabase/migrations/030_leaderboard_settings.sql` (Festival leaderboard settings & poster templates)
* `supabase/migrations/032_generated_posters.sql` (Generated posters table)
* `supabase/migrations/050_poster_studio.sql` (Poster studio tables: poster_drafts, poster_versions, poster_approval_requests)
* `supabase/migrations/053_media_center_assets.sql` (Media center tables: generated_assets, export_jobs)
* `supabase/migrations/055_participant_unit_audit_logs.sql` (Participant unit reassignment tables: participant_unit_batches, participant_unit_audit_logs, system_events)
* `supabase/migrations/057_junior_dataset_import.sql` (Import sessions table & bulk import RPC)
* `supabase/migrations/074_communication_center.sql` (Communication center tables: user_notification_tokens, notifications, notification_logs)
* Root SQL script: `create_system_api_keys.sql` (System API keys table & authenticated ALL policy `USING (true)`)

### Application Code & Backend
* Services: `src/services/` (Tenant, festival, judge, mark entry, result, poster studio services)
* Repositories: `src/lib/repositories/`
* Edge Functions: `supabase/functions/` (`notification-cron`, `r2-presign`, `send-notification`)

---

## 2. Confirmed Schema & Relationship Map

| Table Name | Source Migration / File | Primary Key | Parent / FK References | RLS Status in Repository |
|---|---|---|---|---|
| `tenants` | `001_initial_schema.sql` | `id` | None | Enabled (`011_multi_tenant_rls.sql`) |
| `profiles` | `002_auth_profiles.sql` | `id` | `auth.users(id)`, `tenants(id)` | Enabled (`002_auth_profiles.sql`, `011`) |
| `organisations` | `007_flexible_hierarchy.sql` | `id` | `tenants(id)`, `organisations(parent_id)` | Enabled (`007_flexible_hierarchy.sql`, `011`) |
| `festival_calendar` | `001_initial_schema.sql` | `id` | `tenants(id)` | Enabled (`011_multi_tenant_rls.sql`) |
| `categories` | `001_initial_schema.sql` | `id` | `tenants(id)` | Enabled (`011_multi_tenant_rls.sql`) |
| `items` | `001_initial_schema.sql` | `id` | `tenants(id)`, `festival_calendar(id)` | Enabled (`011_multi_tenant_rls.sql`, `065`) |
| `participants` | `001_initial_schema.sql` | `id` | `tenants(id)`, `festival_calendar(id)`, `organisations(id)` | Enabled (`011_multi_tenant_rls.sql`) |
| `registrations` | `001_initial_schema.sql` | `id` | `tenants(id)`, `festival_calendar(id)`, `items(id)`, `participants(id)`, `organisations(id)` | Enabled (`011_multi_tenant_rls.sql`, `067`) |
| `results` | `001_initial_schema.sql` | `id` | `tenants(id)`, `festival_calendar(id)`, `items(id)`, `registrations(id)` | Enabled (`018_results_policies.sql`, `045`) |
| `points_config` | `001_initial_schema.sql`, `023` | `id` | `tenants(id)`, `festival_calendar(id)` | Table present |
| `scoring_rules` | `022_scoring_rules.sql` | `id` | `tenants(id)` (NULL for global default rules) | Enabled (`022_scoring_rules.sql`) |
| `judges` | `001_initial_schema.sql` | `id` | `tenants(id)`, `festival_calendar(id)` | Table present |
| `judge_tokens` | `019_judge_tokens.sql` | `id` | `tenants(id)`, `judges(id)`, `schedules(id)` | Enabled (`019_judge_tokens.sql`) |
| `schedules` | `001_initial_schema.sql` | `id` | `tenants(id)`, `festival_calendar(id)`, `items(id)`, `venues(id)` | Table present |
| `mark_entries` | `001_initial_schema.sql`, `027` | `id` | `tenants(id)`, `schedules(id)`, `judges(id)`, `registrations(id)` | Enabled (`027_judge_portal_rls_bypass.sql`) |
| `system_api_keys` | `create_system_api_keys.sql` | `id` | None | Enabled (`create_system_api_keys.sql`) |
| `file_metadata` | `025_r2_storage_metadata.sql` | `id` | `tenants(id)`, `festival_calendar(id)` | Enabled (`025_r2_storage_metadata.sql`) |
| `notifications` | `074_communication_center.sql` | `id` | `tenants(id)`, `auth.users(sender_id)` | Enabled (`074_communication_center.sql`) |
| `notification_logs` | `074_communication_center.sql` | `id` | `notifications(id)`, `auth.users(user_id)` | Enabled (`074_communication_center.sql`) |
| `user_notification_tokens` | `074_communication_center.sql` | `id` | `auth.users(user_id)` | Enabled (`074_communication_center.sql`) |
| `audit_logs` | `001_initial_schema.sql` | `id` | `tenants(id)` | Table present |
| `system_events` | `055_participant_unit_audit_logs.sql` | `id` | `tenants(id)` | Enabled (`055`) |
| `participant_unit_batches` | `055_participant_unit_audit_logs.sql` | `id` | `tenants(id)`, `organisations(target_unit_id)` | Enabled (`055`) |
| `participant_unit_audit_logs` | `055_participant_unit_audit_logs.sql` | `id` | `participants(id)`, `participant_unit_batches(id)`, `tenants(id)` | Enabled (`055`) |
| `import_sessions` | `057_junior_dataset_import.sql` | `id` | `tenants(id)`, `festival_calendar(id)` | Enabled (`057`) |
| `poster_templates` | `030_leaderboard_settings.sql`, `050` | `id` | `tenants(id)`, `festival_calendar(id)` | Enabled (`030`, `050`) |
| `poster_drafts` | `050_poster_studio.sql` | `id` | `poster_templates(id)`, `profiles(editor_id)` | Enabled (`050`) |
| `poster_versions` | `050_poster_studio.sql` | `id` | `poster_templates(id)`, `profiles(editor_id)` | Enabled (`050`) |
| `generated_posters` | `032_generated_posters.sql` | `id` | `tenants(id)`, `festival_calendar(id)`, `poster_templates(id)` | Enabled (`032`) |
| `generated_assets` | `053_media_center_assets.sql` | `id` | `tenants(id)`, `festival_calendar(id)`, `items(event_id)`, `results(result_id)` | Enabled (`053`) |
| `export_jobs` | `053_media_center_assets.sql` | `id` | `tenants(id)`, `festival_calendar(id)` | Enabled (`053`) |

---

## 3. Query Evidence Matrix (Part F & Part G)

Every query in `database_readonly_verification_final.sql` has been verified against repository migrations:

* **Queries F.1 – F.12**: Verified against `001_initial_schema.sql` core table definitions.
* **Queries F.13 – F.15**: Verified against `007_flexible_hierarchy.sql` and `013_hierarchical_orgs.sql` adjacency list hierarchy.
* **Queries F.16 – F.19**: Verified against `002_auth_profiles.sql` role CHECK constraint (`'admin'`, `'judge'`, `'volunteer'`, `'participant'`) and `008_superadmin_setup.sql`.
* **Query F.20**: Verified against `001_initial_schema.sql` and `023_expanded_points_config.sql`.
* **Queries F.21 – F.22**: Verified against `001_initial_schema.sql` L215 results table grade definition.
* **Query F.23**: Verified against `022_scoring_rules.sql` global default seed data (where `tenant_id` is NULL).
* **Queries F.24 – F.26**: Verified against `019_judge_tokens.sql`.
* **Queries F.27 – F.29**: Verified against `001_initial_schema.sql` and `027_judge_portal_rls_bypass.sql` UNIQUE constraint `(schedule_id, judge_id, registration_id)`.
* **Queries F.30 – F.32**: Verified against core relational FK paths.
* **Query F.33**: Verified against `001_initial_schema.sql` foreign keys.
* **Query F.34**: Verified against `001_initial_schema.sql` and `007_flexible_hierarchy.sql`.
* **Query F.35**: Verified against `001_initial_schema.sql` and `009_tenant_management_funcs.sql`.
* **Query F.36**: Verified against competition cross-boundary alignment model.
* **Queries G.1 – G.16**: Verified against optional module migrations (`create_system_api_keys.sql`, `025`, `030`, `032`, `050`, `053`, `055`, `057`, `074`).

---

## 4. RLS Evidence Matrix (Part D Critical Findings)

| Target Table | Verification Query | Repository Migration Evidence | Policy Name & Definition in Repository | Repository Risk Level |
|---|---|---|---|---|
| `mark_entries` | `D.4a` | `027_judge_portal_rls_bypass.sql` (L47-L62) | `Public select for mark entries` FOR SELECT TO public USING (true); `Public insert for judge tokens` FOR INSERT TO public WITH CHECK (true); `Public update for mark entries` FOR UPDATE TO public USING (true) WITH CHECK (true) | **P0-1 CRITICAL** (Public/anon write/read access) |
| `judge_tokens` | `D.5a` | `019_judge_tokens.sql` (L20-L23) | `Public can read tokens for validation` FOR SELECT TO public USING (true) | **P0-2 CRITICAL** (Public token enumeration) |
| `system_api_keys` | `D.6` | `create_system_api_keys.sql` (L19-L45) | `Allow read access to authenticated admins` FOR SELECT TO authenticated USING (true); `Allow insert/update/delete` FOR ALL TO authenticated USING/WITH CHECK (true) | **P0-5 CRITICAL** (Authenticated API key exposure) |
| `participants` | `D.2` | `011_multi_tenant_rls.sql` (L55) | `Admins can manage their own participants` FOR ALL TO authenticated USING (tenant_id = get_my_tenant_id() OR is_superadmin()) | **Normal Admin Access** |
| `organisations` | `D.3` | `007_flexible_hierarchy.sql` (L48) & `011_multi_tenant_rls.sql` (L28) | `Admins full access to organisations` FOR ALL USING (true); `Superadmins can see all organisations` FOR ALL TO authenticated USING (is_superadmin()) | **Privileged Role Policy** |

---

## 5. Business Rules Classification

1. **Multiple active festivals per tenant**: `Architecture or business-rule decision required` (neutral reporting in F.35).
2. **Participants with NULL festival IDs**: `Decision-support metric` (reported in F.10 & F.34).
3. **Global scoring rules with NULL tenant IDs**: `Confirmed by repository as intended design` (reported in F.23).
4. **Superadmin role naming**: `Conflicting repository evidence` (`002` profile constraint vs `008` is_superadmin flag vs `050` role checks; audited neutrally in D.7).
5. **Grade A threshold between 70 and 75**: `Decision-support audit` (reported in F.22).
6. **Duplicate mark-entry combinations**: `Confirmed by repository as constrained` (`027_judge_portal_rls_bypass.sql` UNIQUE constraint; reported in F.29).

---

## 6. Unverified Areas (Runtime Execution Required)

The following items cannot be fully verified from repository static code alone and require execution in Supabase SQL Editor:
1. **Live Supabase PostgreSQL RLS Enablement State**: Static files show `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`, but runtime execution of `D.1` is required to verify whether any production table has RLS disabled.
2. **Live Migration Metadata**: `B.3` must be executed on the target database to inspect the history of applied migrations.
3. **Actual Row Counts & Integrity Distortions**: `Part F` aggregate queries must be executed on the live dataset to measure actual orphaned records or cross-boundary mismatches.
