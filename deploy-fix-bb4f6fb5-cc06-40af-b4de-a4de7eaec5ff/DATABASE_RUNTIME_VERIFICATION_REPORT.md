# Database Runtime Verification Report — Phase 4

**Date**: 2026-07-22
**Scope**: Runtime database state verification against repository migrations
**Mode**: READ-ONLY. No database modifications.

---

## 1. Executive Runtime Verdict

**Runtime verification could not be performed.** No database access tools are available in this environment. The Supabase CLI is not installed, no PostgreSQL client (`psql`) is available, no `.env` files with database credentials exist, and no `supabase/config.toml` is present.

A comprehensive read-only SQL verification script has been generated at `database_readonly_verification.sql`. A human must run this script in the Supabase SQL Editor to obtain runtime findings.

**All P0 findings from Phases 1-3 remain `Unverified` against the live database.** Repository evidence is strong, but runtime confirmation requires database access.

---

## 2. Environment Identification

| Aspect | Finding |
|---|---|
| Supabase project reference | **Unknown** — no `supabase/config.toml` found |
| Database host | **Unknown** — no connection string available |
| Environment type | **Unknown** — could be local, development, staging, or production |
| Connection method | **Unavailable** — no Supabase CLI, no `psql`, no `.env` files |
| Database role | **Unknown** — no credentials available |
| Access tools found | None |
| `.env` files found | None |
| `supabase/config.toml` found | No |
| Supabase CLI installed | No |

**Environment identity unverified.**

---

## 3. Access Method and Safety Confirmation

### Available Tools
- Supabase CLI: **Not installed**
- `psql` (PostgreSQL client): **Not available**
- `pg_isready`: **Not available**
- `.env` files: **None found**
- `supabase/config.toml`: **Not found**
- `supabase/.temp/`: Contains only `cli-latest` file (no database connection info)

### What Was Verified
- Repository migration files: **All 77 files inspected**
- Source code: **All provider, service, hook, and route files inspected**
- SQL scripts: **All root-level SQL files inspected**

### What Could Not Be Verified
- Actual database migration history
- Actual RLS policy state
- Actual table existence and row counts
- Actual function definitions and grants
- Actual role values in profiles table
- Actual tenant/festival data ownership
- Actual grade configuration and affected records
- Actual API key existence and exposure
- Actual judge token and mark integrity

---

## 4. Migration History Reconciliation

### Repository Migrations (77 files in `supabase/migrations/`)

| # | Filename | Expected Objects | Runtime Status |
|---|---|---|---|
| 001 | `001_initial_schema.sql` | 20 tables created | **Unverified** |
| 002 | `002_auth_profiles.sql` | profiles table, 3 RLS policies, trigger | **Unverified** |
| 003 | `003_add_participant_fields.sql` | participants +phone, +org_name | **Unverified** |
| 004 | `004_phase5_participant_management.sql` | participants +columns, 2 RLS policies (**USING (true)**) | **Unverified** |
| 005 | `005_category_age_logic.sql` | functions ssf_calculate_age, ssf_get_category (2025), trigger | **Unverified** |
| 006 | `006_fix_category_trigger.sql` | Updated functions (2026 hard-coded) | **Unverified** |
| 007 | `007_flexible_hierarchy.sql` | organisations table, 2 RLS policies (**USING (true)**) | **Unverified** |
| 008 | `008_superadmin_setup.sql` | profiles +is_superadmin, superadmin account created | **Unverified** |
| 009 | `009_tenant_management_funcs.sql` | setup_tenant_records() RPC | **Unverified** |
| 010 | `010_tenant_revocation_func.sql` | revoke_tenant_access() RPC | **Unverified** |
| 011 | `011_multi_tenant_rls.sql` | get_my_tenant_id(), is_superadmin(), 8 RLS policies | **Unverified** |
| 012 | `012_cleanup_old_policies.sql` | Drops old policies dynamically | **Unverified** |
| 013 | `013_hierarchical_orgs.sql` | setup_child_organisation() RPC | **Unverified** |
| 014 | `014_fix_org_rls.sql` | get_my_org_id(), updated org policies | **Unverified** |
| 015 | `015_add_rejection_reason.sql` | participants +rejection_reason | **Unverified** |
| 016 | `016_add_audit_fields.sql` | 15 tables +audit columns, update_modified_column() trigger | **Unverified** |
| 017 | `017_fix_items_upsert.sql` | items unique constraint, updated policies | **Unverified** |
| 018a | `018_phase5_judges_marks_results.sql` | judges/mark_entries/results RLS | **Unverified** |
| 018b | `018_results_policies.sql` | **Invalid** — Malayalam text, not SQL | **Unverified** |
| 019 | `019_judge_tokens.sql` | judge_tokens table, public SELECT policy | **Unverified** |
| 020 | `020_complete_judge_system.sql` | judge_tokens (IF NOT EXISTS), mark_entries public INSERT | **Unverified** |
| 021 | `021_generate_judge_token_rpc.sql` | generate_judge_token() RPC | **Unverified** |
| 022a | `022_scoring_rules.sql` | scoring_rules, scoring_criteria (DROP CASCADE) | **Unverified** |
| 022b | `022_validate_judge_token_rpc.sql` | validate_judge_token() RPC | **Unverified** |
| 023 | `023_expanded_points_config.sql` | points_config +8 columns | **Unverified** |
| 024 | `024_public_leaderboard_rpc.sql` | get_public_leaderboard() RPC (hard-coded 2026) | **Unverified** |
| 025 | `025_r2_storage_metadata.sql` | file_metadata table | **Unverified** |
| 026 | `026_judge_count_extension.sql` | Judge count extension | **Unverified** |
| 027 | `027_judge_portal_rls_bypass.sql` | get_judge_registrations() RPC, mark_entries public policies | **Unverified** |
| 028 | `028_hybrid_participant_management.sql` | tenants +organisation_id, RPCs, updated participant/registration policies | **Unverified** |
| 029 | `029_fix_judge_portal_hybrid.sql` | Judge portal hybrid fix | **Unverified** |
| 030 | `030_leaderboard_settings.sql` | festival_leaderboard_settings, poster_templates (broken role refs) | **Unverified** |
| 031 | `031_enforce_leaderboard_visibility.sql` | Leaderboard visibility enforcement | **Unverified** |
| 032 | `032_generated_posters.sql` | generated_posters table | **Unverified** |
| 033 | `033_result_visibility.sql` | results +result_status, get_festival_results() RPC | **Unverified** |
| 034 | `034_combined_run.sql` | Combined migration run | **Unverified** |
| 035 | `035_leaderboard_dedup.sql` | Leaderboard deduplication | **Unverified** |
| 036 | `036_fix_published_status_backfill.sql` | Published status backfill | **Unverified** |
| 037 | `037_get_festival_results_hierarchy.sql` | get_festival_results() RPC (replaced) | **Unverified** |
| 038 | `038_complete_leaderboard_fix.sql` | Complete leaderboard fix | **Unverified** |
| 039 | `039_public_leaderboard_edge_cases.sql` | Public leaderboard edge cases | **Unverified** |
| 040 | `040_backfill_published_at.sql` | Backfill published_at | **Unverified** |
| 041 | `041_emergency_republish.sql` | Emergency republish | **Unverified** |
| 042 | `042_public_published_results.sql` | get_public_published_results() RPC | **Unverified** |
| 043 | `043_public_individual_rankings_visibility.sql` | Individual rankings visibility | **Unverified** |
| 044 | `044_leaderboard_settings_admin_policy.sql` | Updated leaderboard policies (broken role refs) | **Unverified** |
| 045 | `045_result_workflow_public_visibility_split.sql` | Result workflow split | **Unverified** |
| 046 | `046_backfill_public_visible_for_public_festivals.sql` | Backfill public_visible | **Unverified** |
| 047 | `047_admin_leaderboard_internal_results.sql` | Admin leaderboard internal results | **Unverified** |
| 048 | `048_admin_festival_results_internal_published.sql` | Admin festival results internal | **Unverified** |
| 049 | `049_candidate_profiles.sql` | Candidate profile columns, slugify functions, RPC | **Unverified** |
| 050 | `050_poster_studio.sql` | poster_drafts, poster_versions, poster_approval_requests | **Unverified** |
| 051 | `051_sahityotsav_2026_event_names.sql` | Sahityotsav 2026 event names seed | **Unverified** |
| 052 | `052_public_result_no.sql` | Public result numbering | **Unverified** |
| 053 | `053_media_center_assets.sql` | Media center assets | **Unverified** |
| 054 | `054_generated_assets_event_name.sql` | Generated assets event name | **Unverified** |
| 055 | `055_participant_unit_audit_logs.sql` | participant_unit_batches, audit_logs, system_events, RPCs | **Unverified** |
| 056 | `056_filter_rejected_registrations.sql` | Filter rejected registrations | **Unverified** |
| 057 | `057_junior_dataset_import.sql` | import_sessions table, RPC | **Unverified** |
| 058 | `058_senior_dataset_import.sql` | Senior import RPC | **Unverified** |
| 059 | `059_schedule_import_unique_slot.sql` | Schedule import unique slot | **Unverified** |
| 060 | `060_execute_schedule_import.sql` | Execute schedule import RPC | **Unverified** |
| 061 | `061_production_safety_patch.sql` | Performance indexes (uses COMMIT outside transaction) | **Unverified** |
| 062 | `062_production_audit_views.sql` | Production audit views | **Unverified** |
| 064 | `064_fix_public_leaderboard_visibility.sql` | Fix public leaderboard visibility | **Unverified** |
| 065 | `065_public_items_policy.sql` | Public items policy | **Unverified** |
| 066 | `066_public_ai_views.sql` | 5 public views for AI chatbot | **Unverified** |
| 067 | `067_public_registrations_policy.sql` | Public registrations policy | **Unverified** |
| 068 | `068_add_team_point_status.sql` | Team point status | **Unverified** |
| 069 | `069_upper_primary_dataset_import.sql` | Upper primary import RPC | **Unverified** |
| 070 | `070_multi_category_dataset_import.sql` | Multi-category import RPC | **Unverified** |
| 071 | `071_general_category_import.sql` | General category import RPC | **Unverified** |
| 072 | `072_remove_participants_name_org_constraint.sql` | Remove name-org constraint | **Unverified** |
| 073 | `073_public_unit_profile.sql` | get_public_unit_profile() RPC | **Unverified** |
| 074 | `074_communication_center.sql` | notifications, notification_logs, user_notification_tokens tables | **Unverified** |
| 075 | `075_add_scoring_rules_guidelines.sql` | scoring_rules +guidelines | **Unverified** |
| 076 | `076_seed_scoring_rules.sql` | DELETE + re-insert scoring rules | **Unverified** |

### Root-Level SQL Files (Not in Migration Folder)

| File | Status | Runtime |
|---|---|---|
| `063_official_participant_bracket.sql` | Should be in migrations | **Unverified** |
| `add_code_letter_lock.sql` | Should be in migrations | **Unverified** |
| `fix_notifs.sql` | Should be in migrations | **Unverified** |
| `create_system_api_keys.sql` | Schema + insecure RLS | **Unverified** |
| `clear_test_data.sql` | Destructive — test only | **Unverified** |
| `clear_all_test_data.sql` | Destructive — test only | **Unverified** |
| `insert_test_data.sql` | Test fixture | **Unverified** |
| `insert_shibili.sql` | Seed data | **Unverified** |
| `restore_schedules.sql` | Production repair | **Unverified** |
| `fix_rls.sql` | Abandoned attempt | **Unverified** |

---

## 5. Repository-to-Database Schema Drift

**Cannot be verified without database access.**

Potential drift risks based on repository analysis:

1. `063_official_participant_bracket.sql` adds `official_participant_bracket` column to `schedules` — may not be in migration history
2. `add_code_letter_lock.sql` adds shuffle lock columns to `schedules` — may not be in migration history
3. `fix_notifs.sql` modifies notification RLS — may not be in migration history
4. `create_system_api_keys.sql` creates `system_api_keys` table — may not be in migration history
5. `022_scoring_rules.sql` uses `DROP TABLE IF EXISTS scoring_criteria CASCADE` — may have destroyed existing data if applied after initial seed

**The SQL verification script (Section 3, 19, 20) will detect these drifts when run.**

---

## 6. Current Table and Constraint State

**Cannot be verified without database access.**

Repository expects these tables (from migrations):

| Table | Expected | Risk |
|---|---|---|
| `tenants` | Created in 001 | Low |
| `festival_calendar` | Created in 001 | Low |
| `categories` | Created in 001 | Low |
| `items` | Created in 001 | Low |
| `points_config` | Created in 001 | Low |
| `scoring_rules` | Created in 022 (after DROP) | Medium — data may be lost |
| `scoring_criteria` | Created in 022 (after DROP) | Medium — data may be lost |
| `participants` | Created in 001 | Low |
| `registrations` | Created in 001 | Low |
| `group_members` | Created in 001 | Low |
| `venues` | Created in 001 | Low |
| `schedules` | Created in 001 | Low |
| `judges` | Created in 001 | Low |
| `mark_entries` | Created in 001 | Low |
| `results` | Created in 001 | Low |
| `point_table` | Created in 001 | Low |
| `announcements` | Created in 001 | Low |
| `attendance` | Created in 001 | Low |
| `certificates` | Created in 001 | Low |
| `transfer_logs` | Created in 001 | Low |
| `audit_logs` | Created in 001 | Low |
| `profiles` | Created in 002 | Low |
| `judge_tokens` | Created in 019/020/021 | Medium — duplicate creation |
| `file_metadata` | Created in 025 | Low |
| `festival_leaderboard_settings` | Created in 030 | Low |
| `poster_templates` | Created in 030 | Low |
| `poster_drafts` | Created in 050 | Low |
| `poster_versions` | Created in 050 | Low |
| `poster_approval_requests` | Created in 050 | Low |
| `generated_posters` | Created in 032 | Low |
| `participant_unit_batches` | Created in 055 | Low |
| `participant_unit_audit_logs` | Created in 055 | Low |
| `system_events` | Created in 055 | Low |
| `import_sessions` | Created in 057 | Low |
| `user_notification_tokens` | Created in 074 | Low |
| `notifications` | Created in 074 | Low |
| `notification_logs` | Created in 074 | Low |
| `system_api_keys` | Created in root SQL | **High — may not be in migration history** |
| `generated_assets` | Referenced in code | **Unclear creation** |
| `export_jobs` | Referenced in code | **Unclear creation** |

---

## 7. Current RLS State

**Cannot be verified without database access.**

Repository-derived RLS concerns that runtime verification must confirm:

### Participants Table
- `004` creates `FOR ALL USING (true)` — **may bypass tenant isolation**
- `011` creates tenant-scoped policy — **OR'd with 004's policy**
- `028` creates `is_org_visible` policies — **OR'd with both**
- **Runtime must confirm**: Which policies are actually active?

### Organisations Table
- `007` creates `FOR ALL USING (true)` — **may allow any user to modify**
- `011` creates tenant-scoped policy
- `014` creates `Admins can see own and child organisations` policy
- `014` does NOT drop the `007` `FOR ALL USING (true)` policy
- **Runtime must confirm**: Is the `007` policy still active?

### Mark Entries Table
- `018` creates tenant-scoped policies
- `020` creates public INSERT policy
- `027` creates `USING (true) WITH CHECK (true)` for SELECT/INSERT/UPDATE to public/anon/authenticated
- **Runtime must confirm**: Are the `027` bypass policies active?

### Judge Tokens Table
- `019` creates `FOR SELECT USING (true)` — **public read access**
- **Runtime must confirm**: Is this policy active?

### System API Keys Table
- Root SQL creates `USING (true)` for all operations to authenticated
- **Runtime must confirm**: Does the table exist? Are these policies active?

### Festival Leaderboard Settings
- `030` creates policies referencing `role IN ('super_admin', 'tenant_admin')` — **non-existent roles**
- `044` updates policies referencing `role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')` — **mixed valid/invalid**
- **Runtime must confirm**: Which policies are active?

### Tables Potentially Missing RLS
- `venues` — no RLS found in any migration
- `schedules` — no RLS found in any migration
- `point_table` — no RLS found in any migration
- `announcements` — no RLS found in any migration
- `attendance` — no RLS found in any migration
- `certificates` — no RLS found in any migration
- `audit_logs` — no RLS found in any migration

**The SQL verification script (Sections 4-5) will detect all of these when run.**

---

## 8. Current Role Model

**Cannot be verified without database access.**

Repository-derived role concerns:

### CHECK Constraint (from `002`)
```sql
role text CHECK (role IN ('admin', 'judge', 'volunteer', 'participant'))
```

### Roles Used in RLS (from various migrations)
- `super_admin` — used in `030`, `044` — **NOT in CHECK constraint**
- `tenant_admin` — used in `030`, `044` — **NOT in CHECK constraint**
- `festival_admin` — used in `033`, `037`, `042` — **NOT in CHECK constraint**
- `admin_leader` — used in `send-notification` Edge Function — **NOT in CHECK constraint**
- `superadmin` — used in `send-notification` Edge Function — **NOT in CHECK constraint**

### Runtime Must Confirm
- What values actually exist in `profiles.role`?
- Which policies reference non-existent roles?
- Are there users with roles not in the CHECK constraint?

**The SQL verification script (Section 6) will detect all of these when run.**

---

## 9. Hard-Coded Account Verification

**Cannot be verified without database access.**

Repository evidence:
- `008_superadmin_setup.sql` creates account with email `shibilikds938@gmail.com` and password `m1o2n3u4`
- The migration uses `DELETE FROM auth.users WHERE email = super_email` then re-inserts
- The profile is set with `is_superadmin = true`

### Runtime Must Confirm
- Does this auth user exist?
- Does the profile exist with `is_superadmin = true`?
- Has the password been changed since migration application?

**The SQL verification script does NOT include auth user queries** (those require service-role access and are sensitive). A human must check via Supabase Dashboard → Authentication → Users.

---

## 10. Tenant and Festival Data Ownership

**Cannot be verified without database access.**

Repository-derived concerns:
- `festival_calendar.festival_year DEFAULT 2025` — may affect new festivals
- `ssf_get_category()` hard-codes `2026` — affects category calculation
- `get_public_leaderboard()` hard-codes `2026` — affects public leaderboard

### Runtime Must Confirm
- What festival years exist in the data?
- Are there festivals with `festival_year = 2025`?
- Are there festivals with `festival_year = 2026`?
- How many active festivals per tenant?
- Are there tenants with zero active festivals?

**The SQL verification script (Section 10) will detect all of these when run.**

---

## 11. Grade and Point Data Verification

**Cannot be verified without database access.**

Repository-derived concerns:
- `pointCalculator.ts` uses 70% for A grade
- `resultCalculator.ts` uses 75% for A grade
- Scores between 70-74% may have inconsistent grades

### Runtime Must Confirm
- How many results have `total_score` between 70-75?
- What grades are assigned to those results?
- Are point values consistent across `points_config` records?

**The SQL verification script (Section 12) will detect all of these when run.**

---

## 12. Items Requiring Runtime Verification

The following items CANNOT be determined from repository inspection alone:

1. **Which migrations were actually applied** — requires `supabase_migrations.schema_migrations` inspection
2. **Whether permissive RLS policies are currently active** — requires `pg_policies` inspection
3. **Whether tables are missing RLS** — requires `pg_tables.rowsecurity` inspection
4. **Whether API keys exist in `system_api_keys`** — requires table inspection
5. **Whether hard-coded super-admin credentials resulted in an active account** — requires auth user inspection
6. **Whether broken role names are present in current policies** — requires `pg_policies` inspection
7. **Whether hard-coded festival years affect existing records** — requires data inspection
8. **Whether the database schema has drifted from repository migrations** — requires catalog inspection
9. **Whether manual root-level SQL files were applied** — requires migration history inspection
10. **Whether current production data has correct tenant and festival ownership** — requires aggregate queries

---

## 13. How to Run the Verification Script

### Prerequisites
- Access to the Supabase Dashboard
- SQL Editor access (postgres or Service Role)

### Steps
1. Open the Supabase Dashboard for the target project
2. Navigate to SQL Editor
3. Copy the contents of `database_readonly_verification.sql`
4. Paste into the SQL Editor
5. Execute the script
6. Review all output sections
7. Compare findings against the repository expectations documented in this report

### Expected Output Sections
The script produces 20 sections covering:
1. Environment identification
2. Migration history
3. Table inventory
4. RLS policy inventory
5. Critical RLS verification (participants, organisations, mark_entries, judge_tokens, system_api_keys, leaderboard)
6. Role model
7. Functions and RPCs
8. Views
9. Tenant data ownership
10. Festival data ownership
11. Organisation hierarchy
12. Grade and point data
13. Judge token and mark integrity
14. System API keys
15. Storage metadata
16. Communication and notifications
17. Audit and system tables
18. Poster Studio
19. Index inventory
20. Trigger inventory

---

## 14. Safe Read-Only SQL Verification Script

The complete verification script is available at:

**`database_readonly_verification.sql`**

This script contains ONLY:
- `SELECT` statements
- Catalog queries (`pg_tables`, `pg_policies`, `pg_proc`, `pg_indexes`, etc.)
- Aggregate counts

It does NOT contain:
- `INSERT`, `UPDATE`, `DELETE`, `UPSERT`
- `ALTER`, `DROP`, `CREATE`, `TRUNCATE`
- `GRANT`, `REVOKE`
- Any mutation operations

---

## 15. What Runtime Verification Will Determine

Once the SQL script is run, it will answer:

| Question | Script Section |
|---|---|
| Were all 77 migrations applied? | Section 2 |
| Do all expected tables exist? | Section 3 |
| Are all RLS policies correctly configured? | Sections 4-5 |
| Are the P0 RLS bypasses actually active? | Section 5 (5.1-5.8) |
| Are non-existent roles referenced in policies? | Sections 5.9-5.10 |
| What role values actually exist in profiles? | Section 6 |
| Do helper functions exist and are they correct? | Section 7 |
| What views exist? | Section 8 |
| Is tenant data correctly scoped? | Section 9 |
| Is festival data correctly scoped? | Section 10 |
| Is the organisation hierarchy valid? | Section 11 |
| Are grades consistent with scores? | Section 12 |
| Are judge tokens and marks intact? | Section 13 |
| Do API keys exist? | Section 14 |
| Is storage metadata correct? | Section 15 |
| Are notifications working? | Section 16 |
| Are audit tables populated? | Section 17 |
| Is Poster Studio data intact? | Section 18 |
| Are indexes present? | Section 19 |
| Are triggers active? | Section 20 |

---

## 16. Summary of Unverified Findings

### P0 Issues (All Unverified Against Runtime)

| Issue | Repository Evidence | Runtime Status |
|---|---|---|
| mark_entries RLS bypass | `027` lines 47-62 | **Unverified** |
| judge_tokens public SELECT | `019` lines 20-23 | **Unverified** |
| organisations USING (true) | `007` lines 48-49 | **Unverified** |
| participants USING (true) | `004` lines 38-39 | **Unverified** |
| system_api_keys wide-open | Root SQL lines 19-45 | **Unverified** |
| Hard-coded credentials | `008` lines 12,43 | **Unverified** |
| Grade 70% vs 75% | `pointCalculator.ts:6` vs `resultCalculator.ts:24` | **Unverified** |
| Broken role references | `030` line 59, `044` | **Unverified** |

### P1 Issues (All Unverified Against Runtime)

| Issue | Repository Evidence | Runtime Status |
|---|---|---|
| Missing RLS on venues, schedules, etc. | No migration found | **Unverified** |
| Hard-coded years in functions | `006`, `024` | **Unverified** |
| listParticipants() unscoped | `SupabaseDatabaseProvider.ts:157` | **Unverified** |
| No automated tests | Zero test files | **Confirmed** (static) |

---

## 17. What Was Fully Inspected (Static)

- All 77 migration file contents
- All 20+ root-level SQL files
- All provider interfaces and implementations
- All service files (20+)
- All hook files (18+)
- All repository files (11)
- All Edge Functions (4)
- All route layouts and screens
- All documentation files
- All configuration files
- All package dependencies

## What Could Not Be Verified (Runtime Required)

- Actual database migration history
- Actual RLS policy state
- Actual table existence and row counts
- Actual function definitions and grants
- Actual role values in profiles
- Actual tenant/festival data ownership
- Actual grade configuration and affected records
- Actual API key existence and exposure
- Actual judge token and mark integrity
- Actual schema drift from migrations

## Next Steps

1. **Run `database_readonly_verification.sql`** in Supabase SQL Editor
2. **Review all output sections** against the expectations documented here
3. **Update this report** with runtime-confirmed findings
4. **Proceed to corrective migration** once runtime state is confirmed

---

*End of Database Runtime Verification Report*
