# Architecture Audit — Phase 2

**Date**: 2026-07-22
**Scope**: Deep technical audit of database schema, RLS, security, multi-tenant/festival isolation, scoring consistency, dependencies, and Supabase coupling
**Mode**: READ-ONLY. No code changes, no migrations, no configuration changes.

---

## 1. Executive Summary

Phase 2 verified Phase 1 claims against actual source code and SQL. Key findings:

**Critical P0 Issues Found:**
1. **CRITICAL RLS BYPASS on mark_entries** — `027_judge_portal_rls_bypass.sql` (lines 52-62) opens INSERT/UPDATE/SELECT on `mark_entries` to `anon, authenticated` with `USING (true)` and `WITH CHECK (true)`. Any authenticated user can modify any judge's marks in any tenant.
2. **CRITICAL RLS BYPASS on judge_tokens** — `019_judge_tokens.sql` (line 21-23) allows `SELECT` on `judge_tokens` by anyone. Unauthenticated users can read all unused tokens.
3. **CRITICAL RLS BYPASS on organisations** — `007_flexible_hierarchy.sql` (line 48-49) has `FOR ALL USING (true)` on organisations, allowing any authenticated user to modify any organisation.
4. **CRITICAL RLS BYPASS on participants** — `004_phase5_participant_management.sql` (line 38-39) has `FOR ALL USING (true)` on participants.
5. **Hard-coded credentials in migration** — `008_superadmin_setup.sql` (line 12,43) contains email `shibilikds938@gmail.com` and password `m1o2n3u4` in plaintext SQL.
6. **Grade calculation inconsistency CONFIRMED** — `resultCalculator.ts` line 23 uses 75% for A grade; `pointCalculator.ts` line 5 uses 70% for A grade. These produce different results for scores between 70-74%.
7. **system_api_keys RLS is wide open** — `create_system_api_keys.sql` (lines 23-45) allows any authenticated user to read/insert/update/delete API keys.
8. **festival_calendar defaults to 2025** — `001_initial_schema.sql` line 18: `festival_year int DEFAULT 2025`.
9. **`get_public_leaderboard` has hard-coded `2026`** — `024_public_leaderboard_rpc.sql` line 53: `festival.festival_year = 2026`.
10. **`ssf_get_category` hard-codes `2026`** — `006_fix_category_trigger.sql` line 72: `p_festival_year int := 2026`.

---

## 2. Scope Actually Inspected

| Category | Files Read | Notes |
|---|---|---|
| All 76 migration SQL files | Full content of 30+ critical migrations, filenames of all 76 | Priority given to RLS, functions, schemas |
| All 20+ root SQL files | Full content of 10 key files | Classified each |
| Direct Supabase imports | 7 files with direct `supabase` import | `settings.tsx`, `exportQueueService.ts`, `fontService.ts`, `publicAiService.ts`, `superService.ts`, `unitProfileService.ts`, `useNotificationsInbox.ts`, `public-ai-chat+api.ts` |
| `.from()` queries | 7 files | `exportQueueService.ts`, `fontService.ts`, `participantService.ts`, `participantUnitAssignmentService.ts`, `publicAiService.ts`, `pdfGenerator.ts`, `settings.tsx` |
| `.rpc()` calls | 1 file direct | `unitProfileService.ts` |
| `.auth.` usage | 1 file | `superService.ts` (creates isolated client) |
| All Edge Functions | 4 files full content | `r2-presign`, `send-notification`, `notification-cron`, `_shared/r2Client` |
| All provider interfaces | 3 interfaces | Auth, Database, Storage |
| All repository files | 11 files | Via provider chain |
| All service files | 20+ files | Direct and indirect Supabase |
| All hooks | 18 files | Core hooks |
| Grade calculation files | 4 implementations | `resultCalculator.ts`, `pointCalculator.ts`, DB RPCs |
| All documentation | 4 files | `plan.md`, `project.md`, `rule.md`, `README.md` |

---

## 3. Phase 1 Claims Verified or Corrected

| Phase 1 Claim | Verification | Corrected? |
|---|---|---|
| Grade calculation: 75% vs 70% | **CONFIRMED** — `resultCalculator.ts` line 23: `if (score >= 75) return 'A'`; `pointCalculator.ts` line 5: `if (pct >= 70) return 'A'` | Yes, confirmed |
| `dexie` unused | No imports found in `src/` — **Likely unused** | Confirmed |
| `openai` unused | No imports found in `src/` — **Likely unused** | Confirmed |
| `zod` unused | No imports found in `src/` — **Likely unused** | Confirmed |
| `@react-navigation/bottom-tabs` unused | No bottom tab layouts found — **Likely unused** | Confirmed |
| `useFestivalSettings.ts` is legacy | Not imported anywhere visible — **Likely legacy** | Confirmed |
| `usePageAccess.ts` is a stub | Returns `{isVisible: true, canEdit: true}` always — **Confirmed stub** | Confirmed |
| `pageManagementStore.ts` is a stub | Empty no-op functions — **Confirmed stub** | Confirmed |
| `participantService.updateCodeLetter()` throws | Line 205: `throw new Error('Not implemented here yet')` — **Confirmed incomplete** | Confirmed |
| 10+ root-level test JS files | 10+ confirmed — all diagnostic/one-off scripts | Confirmed |
| No automated test suite | **Confirmed** — zero test files found | Confirmed |
| Duplicate migration numbers `018` and `022` | **Confirmed** — two files each | Confirmed |
| `useBulkImport.ts` partially migrated | **Confirmed** — uses `participantService` for some ops, direct patterns remain | Confirmed |

---

## 4. Complete Migration Content Audit

### Migration Summary

| # | Filename | Tables Created | Tables Modified | Functions | RLS Policies | Destructive | Risk |
|---|---|---|---|---|---|---|---|
| 001 | `001_initial_schema.sql` | tenants, festival_calendar, categories, items, points_config, scoring_criteria, participants, registrations, group_members, venues, schedules, judges, mark_entries, results, point_table, announcements, attendance, certificates, transfer_logs, audit_logs | — | — | None | No | Low |
| 002 | `002_auth_profiles.sql` | profiles | — | `handle_new_user()` (SECURITY DEFINER) | profiles: 3 policies | No | Medium — trigger auto-creates profile as 'admin' |
| 003 | `003_add_participant_fields.sql` | — | participants (+phone, +org_name) | — | — | No | Low |
| 004 | `004_phase5_participant_management.sql` | — | participants (+age, +class_std, +email, +membership_no, +is_verified, +is_locked, +updated_at), registrations (+level, +is_locked) | `audit_participant_changes()` | participants: 2 policies (**USING (true)**) | No | **HIGH — wide-open RLS** |
| 005 | `005_category_age_logic.sql` | — | participants (+dob, +education_type) | `ssf_calculate_age()`, `ssf_get_category()` (hard-codes 2025), `validate_participant_category()` | — | No | Medium — hard-coded 2025 |
| 006 | `006_fix_category_trigger.sql` | — | — | Updates `ssf_calculate_age()`, `ssf_get_category()`, `validate_participant_category()` (hard-codes 2026) | — | No | Medium — hard-codes 2026 |
| 007 | `007_flexible_hierarchy.sql` | organisations | participants (+organisation_id, +competition_level, -unit_org_id), registrations (+organisation_id, -unit_org_id) | — | organisations: 2 policies (**FOR ALL USING (true)**) | **YES — DROP COLUMN** | **HIGH — wide-open RLS, destructive DROP** |
| 008 | `008_superadmin_setup.sql` | — | profiles (+is_superadmin) | — | — | **YES — DELETE FROM auth.users** | **HIGH — hard-coded credentials** |
| 009 | `009_tenant_management_funcs.sql` | — | — | `setup_tenant_records()` (SECURITY DEFINER) | — | No | Medium |
| 010 | `010_tenant_revocation_func.sql` | — | — | `revoke_tenant_access()` (SECURITY DEFINER, deletes auth users) | — | **YES — DELETE FROM auth.users, tenants** | **HIGH — destructive** |
| 011 | `011_multi_tenant_rls.sql` | — | — | `get_my_tenant_id()`, `is_superadmin()` | organisations, profiles, tenants, participants, registrations, items, categories, festival_calendar | No | Medium |
| 012 | `012_cleanup_old_policies.sql` | — | — | Updates `get_my_tenant_id()` | Drops old policies dynamically | No | Low |
| 013 | `013_hierarchical_orgs.sql` | — | — | `setup_child_organisation()` (SECURITY DEFINER) | — | No | Medium |
| 014 | `014_fix_org_rls.sql` | — | — | `get_my_org_id()` | organisations: updated policies | No | Low |
| 015 | `015_add_rejection_reason.sql` | — | participants (+rejection_reason) | — | — | No | Low |
| 016 | `016_add_audit_fields.sql` | — | All 15 tables (+created_at, +updated_at, +created_by, +updated_by) | `update_modified_column()` | — | No | Low — idempotent |
| 017 | `017_fix_items_upsert.sql` | — | items (unique constraint) | Updates `get_my_tenant_id()`, `is_superadmin()` | items: 2 new policies | No | Low |
| 018a | `018_phase5_judges_marks_results.sql` | — | judges, mark_entries (+unique constraint), results (+unique constraint) | — | judges, mark_entries, results: RLS | No | Low |
| 018b | `018_results_policies.sql` | — | — | — | — | No | **INVALID — contains Malayalam text comment, not SQL** |
| 019 | `019_judge_tokens.sql` | judge_tokens | — | — | judge_tokens: 2 policies (**public SELECT**) | No | **HIGH — public SELECT on tokens** |
| 020 | `020_complete_judge_system.sql` | judge_tokens (IF NOT EXISTS) | — | — | judge_tokens, mark_entries (**public INSERT**), results | No | **HIGH — duplicates 019, public INSERT on mark_entries** |
| 021 | `021_generate_judge_token_rpc.sql` | judge_tokens (IF NOT EXISTS) | — | `generate_judge_token()` (SECURITY DEFINER) | — | No | Medium |
| 022a | `022_scoring_rules.sql` | scoring_rules, scoring_criteria | — (**DROP CASCADE existing**) | — | 2 tables: RLS | **YES — DROP TABLE CASCADE** | **HIGH — destroys existing scoring_criteria** |
| 022b | `022_validate_judge_token_rpc.sql` | — | — | `validate_judge_token()` (SECURITY DEFINER, GRANT to anon) | — | No | Medium |
| 023 | `023_expanded_points_config.sql` | — | points_config (+8 group columns) | — | — | No | Low |
| 024 | `024_public_leaderboard_rpc.sql` | — | — | `get_public_leaderboard()` (SECURITY DEFINER, hard-codes 2026) | — | No | **MEDIUM — hard-coded 2026** |
| 025 | `025_r2_storage_metadata.sql` | file_metadata | — | — | file_metadata: 3 policies | No | Low |
| 027 | `027_judge_portal_rls_bypass.sql` | — | — | `get_judge_registrations()` (SECURITY DEFINER, GRANT to public) | mark_entries: **widens to anon/authenticated** | No | **CRITICAL — full RLS bypass on mark_entries** |
| 028 | `028_hybrid_participant_management.sql` | — | tenants (+organisation_id) | `get_visible_organisations()`, `is_org_visible()`, `setup_child_organisation()` (updated) | participants, registrations: 8 new policies using `is_org_visible` | No | Medium |
| 030 | `030_leaderboard_settings.sql` | festival_leaderboard_settings, poster_templates | — | `update_updated_at_column()` | 2 tables: RLS (but policy uses `role IN ('super_admin', 'tenant_admin')` which don't exist) | No | **MEDIUM — RLS references non-existent roles** |
| 033 | `033_result_visibility.sql` | — | results (+result_status) | `get_festival_results()` (SECURITY DEFINER), `get_public_leaderboard()` (updated) | — | No | Low |
| 037 | `037_get_festival_results_hierarchy.sql` | — | — | `get_festival_results()` (replaced, SECURITY DEFINER) | — | No | Low |
| 042 | `042_public_published_results.sql` | — | — | `get_public_published_results()` (SECURITY DEFINER) | — | No | Low |
| 044 | `044_leaderboard_settings_admin_policy.sql` | — | — | — | festival_leaderboard_settings: 3 new policies (references `role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')`) | No | **MEDIUM — role names inconsistent** |
| 049 | `049_candidate_profiles.sql` | — | participants (+profile_slug, +profile_bio, +profile_photo_object_key, +public_profile_enabled, +show_organisation_public) | `slugify_candidate_name()`, `ensure_candidate_profile_slug()`, `get_public_candidate_profile()`, `get_public_published_results()` (replaced) | — | No | Low |
| 050 | `050_poster_studio.sql` | poster_drafts, poster_versions, poster_approval_requests | poster_templates (+status, +layers, +schema_version) | — | 3 tables: RLS | No | Low |
| 055 | `055_participant_unit_audit_logs.sql` | participant_unit_batches, participant_unit_audit_logs, system_events | participants (+is_locked, +lock_scope, +lock_reason, +import_source) | `preview_bulk_unit_assignment()`, `execute_bulk_unit_assignment()`, `rollback_unit_assignment()` (all SECURITY DEFINER) | 3 tables: RLS | No | Low |
| 057 | `057_junior_dataset_import.sql` | import_sessions | — | `execute_junior_import_chunk()` (SECURITY DEFINER) | import_sessions: RLS | No | Low |
| 061 | `061_production_safety_patch.sql` | — | — | — | — | **Uses COMMIT; outside transaction** | Low — performance index |
| 066 | `066_public_ai_views.sql` | — | — | Views: `vw_public_leaderboard`, `vw_public_results`, `vw_public_schedule`, `vw_public_live_status`, `vw_public_participants` | — | No | Low — read-only views |
| 073 | `073_public_unit_profile.sql` | — | — | `get_public_unit_profile()` (SECURITY DEFINER) | — | No | Low |
| 074 | `074_communication_center.sql` | user_notification_tokens, notifications, notification_logs | profiles (+notification_enabled), schedules (+notification_sent) | `reset_schedule_notification()` | 3 tables: RLS | No | Low |
| 075 | `075_add_scoring_rules_guidelines.sql` | — | scoring_rules (+guidelines) | — | — | No | Low |
| 076 | `076_seed_scoring_rules.sql` | — | — | DELETE + re-insert scoring rules | — | **YES — DELETE existing data** | Medium — destructive seed |

### Migration Anomalies

| Anomaly | Details | Risk |
|---|---|---|
| Duplicate `018` | `018_phase5_judges_marks_results.sql` and `018_results_policies.sql` (Malayalam text) | Low — 018b is invalid |
| Duplicate `022` | `022_scoring_rules.sql` (DROP CASCADE) and `022_validate_judge_token_rpc.sql` | **HIGH** — both create judge_tokens table |
| Missing `063` | `063_official_participant_bracket.sql` is in root, not `supabase/migrations/` | Medium — out of order |
| `022_scoring_rules.sql` uses `DROP TABLE IF EXISTS scoring_criteria CASCADE` | Destroys existing scoring_criteria data | **HIGH** |
| `008_superadmin_setup.sql` contains plaintext password | `m1o2n3u4` in SQL | **CRITICAL** |
| `018b` contains Malayalam text, not SQL | File content: `implementation നടത്തിയ ടീച്ചറുകൾ...` | Low — no-op |
| `061` uses `COMMIT;` outside transaction | May fail in migration runner | Medium |

---

## 5. Root-Level SQL Audit

| File | Classification | Equivalent in Migrations | Safe to Re-run | Action |
|---|---|---|---|---|
| `063_official_participant_bracket.sql` | Valid migration candidate | No — missing from `supabase/migrations/` | Yes (IF NOT EXISTS) | Should be moved to migrations |
| `add_code_letter_lock.sql` | Valid migration candidate | No | Yes (IF NOT EXISTS) | Should be merged into a migration |
| `add_general_category.sql` | Seed data | Partially | Depends on content | Should be merged |
| `clear_all_test_data.sql` | Destructive repair | No | **NO** | Archive — test only |
| `clear_test_data.sql` | Destructive repair (preserves one tenant) | No | **NO** | Archive — test only |
| `create_system_api_keys.sql` | Schema + seed + **insecure RLS** | No | Partially (table already exists?) | **Must fix RLS before production** |
| `fix_notifs.sql` | Emergency RLS fix | Partially — supersedes 074 policies | Yes | Should be merged into a migration |
| `fix_rls.sql` | Abandoned attempt (7 lines, incomplete JS) | No | N/A | Remove |
| `fix_mappings.js` | Diagnostic/repair script | No | N/A | Archive |
| `insert_shibili.sql` | Seed data (specific user) | No | **NO** | Archive |
| `insert_test_data.sql` | Test fixture | No | **NO** | Archive — test only |
| `restore_schedules.sql` | Production data repair (hard-coded IDs) | No | **NO** | Archive — one-off repair |
| `063_official_participant_bracket.sql` | Schema addition | No | Yes | Merge into migration |

---

## 6. Current Database Schema Map (Evidence-Based)

### Tables Confirmed in Migrations

| Table | Created In | Columns (key) | PK | FKs | tenant_id | festival_id | organisation_id |
|---|---|---|---|---|---|---|---|
| `tenants` | 001 | id, name, org_type, subscription_status, contact_phone, contact_email, created_at, updated_at, created_by, updated_by, organisation_id | uuid PK | organisation_id→organisations | **N/A (is the tenant)** | — | — |
| `festival_calendar` | 001 | id, tenant_id, festival_year (DEFAULT 2025), level, custom_name, start_date, end_date, registration_open, registration_close, result_publish_date, is_active, source, created_at, updated_at, created_by, updated_by | uuid PK | tenant_id→tenants | **YES** | **N/A (is the festival)** | — |
| `categories` | 001 | id, tenant_id, code, name_ml, class_min, class_max, age_min, age_max, gender, is_active, created_at, updated_at, created_by, updated_by, festival_id | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | Added 016 | — |
| `items` | 001 | id, tenant_id, festival_id, item_code, item_name_ml, item_name_en, item_type, participation_type, category_codes, gender, duration_minutes, group_min/max_members, level_availability, daf_allowed, white_dress_required, is_active, etc. | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `points_config` | 001 | id, tenant_id, festival_id, rank_1/2/3_points, grade_*_points, ind_*_points, grp_*_points, less_than_3_teams_rule, created_at, updated_at, created_by, updated_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `scoring_rules` | 022 | id, tenant_id, event_name, event_name_ml, total_marks, time_limit, is_default, guidelines, created_at, updated_at | uuid PK | tenant_id→tenants | **YES** (nullable for defaults) | — | — |
| `scoring_criteria` | 022 | id, rule_id, name, marks, sort_order, created_at | uuid PK | rule_id→scoring_rules | Via parent | — | — |
| `participants` | 001 | id, tenant_id, festival_id, organisation_id, name, gender, dob, category_code, photo_url, chest_number, unique_code, status, phone, org_name, age, class_std, email, membership_no, is_verified, is_locked, updated_at, rejection_reason, competition_level, profile_slug, profile_bio, profile_photo_object_key, public_profile_enabled, show_organisation_public, lock_scope, lock_reason, import_source | uuid PK | tenant_id→tenants, festival_id→festival_calendar, organisation_id→organisations | **YES** | **YES** | **YES** |
| `registrations` | 001 | id, tenant_id, festival_id, item_id, participant_id, organisation_id, status, approved_by, code_letter, is_group_registration, created_at, level, is_locked, updated_at, created_by, updated_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar, item_id→items, participant_id→participants, organisation_id→organisations | **YES** | **YES** | **YES** |
| `group_members` | 001 | id, registration_id, participant_id, is_locked, created_at, updated_at, created_by, updated_by | uuid PK | registration_id→registrations, participant_id→participants | Via parent | Via parent | — |
| `venues` | 001 | id, tenant_id, festival_id, name, venue_type, capacity, location, created_at, updated_at, created_by, updated_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `schedules` | 001 | id, tenant_id, festival_id, item_id, venue_id, start_time, end_time, judge_panel_id, status, buffer_minutes, created_at, updated_at, created_by, updated_by, notification_sent, official_participant_bracket, is_shuffle_locked, shuffle_locked_at, shuffle_locked_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar, item_id→items, venue_id→venues | **YES** | **YES** | — |
| `judges` | 001 | id, tenant_id, festival_id, name, phone, specialization, login_user_id, handbook_received, created_at, updated_at, created_by, updated_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `mark_entries` | 001 | id, tenant_id, schedule_id, judge_id, registration_id, criteria_scores, total_mark, is_draft, is_final, submitted_at, competition_end_time, created_at, updated_at, created_by, updated_by | uuid PK | tenant_id→tenants, schedule_id→schedules, judge_id→judges, registration_id→registrations | **YES** | Via schedule | — |
| `results` | 001 | id, tenant_id, festival_id, item_id, registration_id, total_score, rank, grade, points_awarded, grade_only, published, published_at, published_by, meets_state_standard, audit_log, created_at, updated_at, created_by, updated_by, result_status, public_visible, public_result_no | uuid PK | tenant_id→tenants, festival_id→festival_calendar, item_id→items, registration_id→registrations | **YES** | **YES** | — |
| `point_table` | 001 | id, tenant_id, festival_id, org_id, category_code, total_points, gold_count, silver_count, bronze_count, last_updated, created_at, updated_at, created_by, updated_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `announcements` | 001 | id, tenant_id, festival_id, title, message, type, target_role, created_at | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `attendance` | 001 | id, tenant_id, participant_id, schedule_id, checkin_time, checkin_method, status | uuid PK | tenant_id→tenants, participant_id→participants, schedule_id→schedules | **YES** | Via schedule | — |
| `certificates` | 001 | id, tenant_id, participant_id, item_id, certificate_type, pdf_url, grade, generated_at | uuid PK | tenant_id→tenants, participant_id→participants, item_id→items | **YES** | — | — |
| `transfer_logs` | 001 | id, from_tenant_id, to_tenant_id, transfer_method, transferred_by, participant_count, status, errors_json, created_at | uuid PK | — | **Via from/to** | — | — |
| `audit_logs` | 001 | id, tenant_id, user_id, action, table_name, record_id, old_value, new_value, created_at | uuid PK | — | **YES** | — | — |
| `profiles` | 002 | id (FK→auth.users), tenant_id, role, full_name, phone, created_at, is_superadmin, notification_enabled | uuid PK | id→auth.users, tenant_id→tenants | **YES** | — | — |
| `judge_tokens` | 019 | id, tenant_id, judge_id, schedule_id, token, is_used, used_at, created_by, created_at, expires_at | uuid PK | tenant_id→tenants, judge_id→judges, schedule_id→schedules | **YES** | Via schedule | — |
| `file_metadata` | 025 | id, tenant_id, festival_id, asset_type, file_url, bucket_name, object_key, content_type, file_size, visibility, is_public, expires_at, uploaded_at, generated_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `festival_leaderboard_settings` | 030 | id, tenant_id, festival_id, is_public_visible, auto_refresh_enabled, show_rank_movement, show_timestamps, show_grade_summary, is_frozen, preview_visibility, poster_enabled, certificate_enabled, poster_top_count, theme_config, created_at, updated_at, updated_by, team_point_status, ranking_mode, item_limit, show_individual_rankings | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `poster_templates` | 030 | id, tenant_id, festival_id, name, version, background_url, width, height, aspect_ratio, field_mappings, is_active, created_at, updated_at, updated_by, status, layers, schema_version | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `poster_drafts` | 050 | id, template_id, editor_id, content, updated_at | uuid PK | template_id→poster_templates | Via template | Via template | — |
| `poster_versions` | 050 | id, template_id, version_number, content, editor_id, label, created_at | uuid PK | template_id→poster_templates | Via template | Via template | — |
| `poster_approval_requests` | 050 | id, template_id, requested_by, reviewed_by, status, reviewer_comment, created_at, updated_at | uuid PK | template_id→poster_templates | Via template | Via template | — |
| `participant_unit_batches` | 055 | id, started_at, completed_at, status, total_records, success_count, failed_count, skipped_count, processed_count, tenant_id, target_unit_id, rolled_back_at, notes | uuid PK | tenant_id→tenants, target_unit_id→organisations | **YES** | — | — |
| `participant_unit_audit_logs` | 055 | id, participant_id, old_unit_id, new_unit_id, changed_by, changed_at, batch_id, tenant_id, is_reverted, reverted_at, reverted_by | uuid PK | participant_id→participants, batch_id→participant_unit_batches, tenant_id→tenants | **YES** | — | — |
| `system_events` | 055 | id, event_type, event_metadata, created_at, created_by, tenant_id | uuid PK | tenant_id→tenants | **YES** | — | — |
| `import_sessions` | 057 | id, tenant_id, festival_id, filename, status, started_at, completed_at, participants_count, registrations_count, skipped_count, error_count, report_json, created_by | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `generated_posters` | 032 | id, tenant_id, festival_id, template_id, template_version, file_url, object_key, leaderboard_snapshot, event_name | uuid PK | tenant_id→tenants, festival_id→festival_calendar | **YES** | **YES** | — |
| `generated_assets` | — | (referenced in code) | uuid PK | — | Yes | Yes | — |
| `export_jobs` | — | (referenced in code) | uuid PK | — | Yes | Yes | — |
| `user_notification_tokens` | 074 | id, user_id, token, device_type, last_seen, created_at | uuid PK | user_id→auth.users | **NO** | — | — |
| `notifications` | 074 | id, tenant_id, title, message, type, priority, sender_id, created_at, sent_at | uuid PK | tenant_id→tenants, sender_id→auth.users | **YES** | — | — |
| `notification_logs` | 074 | id, notification_id, user_id, status, delivered_at, error_message, created_at | uuid PK | notification_id→notifications, user_id→auth.users | Via notification | — | — |
| `system_api_keys` | Root SQL | id, provider, key_value, is_active, created_at | uuid PK | — | **NO** | — | — |

---

## 7. Table Ownership Classification

| Table | Ownership | tenant_id Enforced | festival_id Enforced | Notes |
|---|---|---|---|---|
| `tenants` | Global system | N/A | — | Superadmin only |
| `profiles` | User-owned | YES (nullable for superadmin) | — | |
| `organisations` | Tenant-owned | YES | — | Hierarchical via parent_id |
| `festival_calendar` | Tenant-owned | YES | N/A | Each row IS a festival |
| `categories` | Tenant+festival | YES | Added 016 | |
| `items` | Tenant+festival | YES | YES | |
| `points_config` | Tenant+festival | YES | YES | |
| `scoring_rules` | Tenant-owned (nullable for defaults) | YES (nullable) | — | Global defaults have NULL tenant_id |
| `scoring_criteria` | Via parent rule | Via parent | — | |
| `participants` | Tenant+festival+org | YES | YES | organisation_id from 007 |
| `registrations` | Tenant+festival+org | YES | YES | organisation_id from 007 |
| `group_members` | Via registration | Via parent | Via parent | |
| `venues` | Tenant+festival | YES | YES | |
| `schedules` | Tenant+festival | YES | YES | |
| `judges` | Tenant+festival | YES | YES | |
| `mark_entries` | Tenant-owned | YES | Via schedule | |
| `results` | Tenant+festival | YES | YES | |
| `point_table` | Tenant+festival+org | YES | YES | org_id column |
| `announcements` | Tenant+festival | YES | YES | |
| `attendance` | Tenant-owned | YES | Via schedule | |
| `certificates` | Tenant-owned | YES | — | Missing festival_id |
| `transfer_logs` | Cross-tenant | via from/to | — | |
| `audit_logs` | Tenant-owned | YES | — | |
| `judge_tokens` | Tenant-owned | YES | Via schedule | |
| `file_metadata` | Tenant+festival | YES | YES | |
| `festival_leaderboard_settings` | Tenant+festival | YES | YES | Unique constraint on both |
| `poster_templates` | Tenant+festival | YES | YES | |
| `poster_drafts` | User-owned | Via template | Via template | editor_id check |
| `poster_versions` | Tenant-owned | Via template | Via template | |
| `poster_approval_requests` | Tenant-owned | Via template | Via template | |
| `participant_unit_batches` | Tenant-owned | YES | — | |
| `participant_unit_audit_logs` | Tenant-owned | YES | — | |
| `system_events` | Tenant-owned | YES | — | |
| `import_sessions` | Tenant+festival | YES | YES | |
| `generated_posters` | Tenant+festival | YES | YES | |
| `user_notification_tokens` | User-owned | **NO** | — | Missing tenant_id |
| `notifications` | Tenant-owned | YES | — | |
| `notification_logs` | User-owned | Via notification | — | |
| `system_api_keys` | **Global** | **NO** | — | **No tenant isolation** |

---

## 8. Complete Direct Supabase Dependency Report

### Files with Direct `import { supabase }` (Bypassing Provider/Repository)

| File | Line | Operation | Table/RPC | Tenant Scope | Festival Scope | Risk | Priority |
|---|---|---|---|---|---|---|---|
| `src/services/fontService.ts` | 1,38,55,79 | `.from('file_metadata')` | file_metadata | Via query filter | Via query filter | Medium — bypasses storageProvider | P1 |
| `src/services/publicAiService.ts` | 1,73-119 | `.from('vw_*')` views | 5 views | Via view filter | Via view filter | Low — read-only public views | P2 |
| `src/services/unitProfileService.ts` | 1,48 | `.rpc('get_public_unit_profile')` | RPC | Via RPC param | Via RPC | Low — SECURITY DEFINER RPC | P2 |
| `src/services/exportQueueService.ts` | 2,56-167 | `.from('export_jobs')`, `.from('generated_assets')` | export_jobs, generated_assets | Via query filter | Via query filter | Medium — bypasses provider | P1 |
| `src/services/superService.ts` | 1,47-53 | `createClient()` (isolated) | Supabase Auth | N/A | N/A | Medium — isolated auth for signup | P1 |
| `src/core/hooks/useNotificationsInbox.ts` | 2,32-56 | `.from('notification_logs')`, `.from('notifications')` | notification_logs, notifications | Via RLS | — | Low — user-scoped via RLS | P2 |
| `src/app/settings.tsx` | 5,26-54 | `.from('profiles')` | profiles | Via RLS (auth.uid()) | — | Low — own-profile only | P2 |
| `src/app/api/public-ai-chat+api.ts` | 2,8-61 | `.from('system_api_keys')`, `.from('festival_calendar')` | system_api_keys, festival_calendar | **NO** — reads all API keys | **NO** — reads any active festival | **HIGH — API keys readable by any authenticated user** | **P0** |
| `src/core/contexts/NotificationContext.tsx` | 6,77-135 | `.from('notification_logs')`, `.from('notifications')`, `.from('user_notification_tokens')`, `.channel()` | notification_logs, notifications, user_notification_tokens | Via RLS / user_id filter | — | Low — user-scoped | P2 |

### Files Using `.from()` Indirectly (via Provider Chain — Acceptable)

These files use the database provider/repository chain:
- `src/providers/database/SupabaseDatabaseProvider.ts` — all `.from()` calls are inside the approved provider
- `src/lib/repositories/*.ts` — all 11 repository files use `databaseProvider` methods
- `src/services/storage/r2StorageProvider.ts` — uses `supabase.functions.invoke('r2-presign')` (approved)

---

## 9. Query Scope and CRUD Safety Report

### Unsafe Operations

| File | Method | Table | Current Filters | Missing Filters | Severity | Impact |
|---|---|---|---|---|---|---|
| `SupabaseDatabaseProvider.ts:157-163` | `listParticipants()` | participants | None (all tenants) | tenant_id, festival_id | **HIGH** | Lists ALL participants across ALL tenants |
| `SupabaseDatabaseProvider.ts:184-189` | `getParticipantRegistrations()` | registrations | participant_id only | tenant_id | Medium | Could leak registrations if participant_id guessed |
| `SupabaseDatabaseProvider.ts:192-198` | `getRegistrationsByItem()` | registrations | item_id only | tenant_id (comment: "RLS handles") | Low — relies on RLS | |
| `SupabaseDatabaseProvider.ts:310-314` | `listOrganisations()` | via RPC `get_visible_organisations` | p_tenant_id | — | Low — RPC handles scope | |
| `SupabaseDatabaseProvider.ts:327-398` | `getAdminDashboardStats()` | Multiple | tenant_id | — | Low | Properly scoped |
| `exportQueueService.ts:56-68` | `fetchQueue()` | export_jobs | festival_id, status | tenant_id | Medium — festival_id filter only | |
| `fontService.ts:54-71` | `getFonts()` | file_metadata | asset_type, tenant_id | — | Low | Properly scoped |
| `publicAiService.ts:73-119` | `buildPublicFestivalContext()` | 5 views | festival_id | — | Low — read-only views | |
| `settings.tsx:26-30` | `fetchPreferences()` | profiles | auth.uid() | — | Low — own profile only | |
| `public-ai-chat+api.ts:8-12` | API key fetch | system_api_keys | is_active | **tenant_id** | **HIGH** — returns ALL active API keys globally | |

### CRUD Safety Issues

| Issue | File | Table | Type | Severity |
|---|---|---|---|---|
| Hard delete on participants | `SupabaseDatabaseProvider.ts:233-241` | participants | Data loss risk | P1 |
| Hard delete on judges | `SupabaseDatabaseProvider.ts:712-715` | judges | Data loss risk | P1 |
| Hard delete on venues | `SupabaseDatabaseProvider.ts:429-435` | venues | Data loss risk | P1 |
| Hard delete on schedules | `SupabaseDatabaseProvider.ts:465-471` | schedules | Data loss risk | P1 |
| No audit log on result publish | `SupabaseDatabaseProvider.ts:826-838` | results | Missing audit | P1 |
| Bulk import without transaction boundary | `execute_junior_import_chunk` | participants, registrations | Partial failure risk | P1 |
| `022_scoring_rules.sql` DROP CASCADE | Migration | scoring_criteria | Data loss | **P0** |

---

## 10. Multi-Tenant Readiness

### Evidence

**Tenant creation**: `setup_tenant_records()` RPC (009) creates tenant + org + profile atomically. **Confirmed working**.

**Tenant resolution**: `get_my_tenant_id()` reads from `profiles` table. **Confirmed** — depends on `auth.uid()` → `profiles.tenant_id`.

**Tenant RLS**: Core tables (participants, registrations, items, festival_calendar, etc.) have tenant-scoped policies via `get_my_tenant_id()`. **Confirmed for most tables**.

**Weaknesses**:
1. `organisations` table has legacy `FOR ALL USING (true)` policy from 007 — **superseded by 014 but should be verified**
2. `system_api_keys` has no tenant isolation — **global table**
3. `user_notification_tokens` has no tenant isolation — **user-only scoping**
4. Some RLS policies reference non-existent role values (`super_admin`, `tenant_admin`, `festival_admin` in 030, 044) while actual profiles use `admin`, `judge`, `volunteer`, `participant`
5. `get_festival_results()` RPC checks `role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')` — only `admin` exists in the CHECK constraint

### Multi-Tenant Readiness: **65%**

- Database schema: 80% (most tables have tenant_id)
- RLS policies: 60% (inconsistent role names, some wide-open legacy policies)
- Application layer: 50% (many services pass tenant_id, but `listParticipants()` has no filter)
- Edge Functions: 70% (send-notification checks tenant, notification-cron doesn't)

---

## 11. Multi-Festival Readiness

### Evidence

**Festival calendar**: `festival_calendar` table with `tenant_id`, `festival_year`, `is_active`. **Confirmed**.

**Active festival selection**: `useFestival.ts` fetches active festival by tenant. `getActiveFestival()` queries `festival_calendar WHERE is_active = true`.

**Festival-scoped tables**: items, participants, registrations, venues, schedules, judges, results, points_config all have `festival_id`. **Confirmed**.

**Weaknesses**:
1. `festival_calendar.festival_year DEFAULT 2025` — should be 2026 or configurable
2. `get_public_leaderboard()` hard-codes `festival.festival_year = 2026`
3. `ssf_get_category()` hard-codes `p_festival_year int := 2026`
4. No festival switcher UI — only "active" festival is used
5. No festival archive/status management
6. `certificates` table missing `festival_id`
7. `scoring_rules` table missing `festival_id` — rules are tenant-wide, not festival-specific

### Multi-Festival Migration Completion: **55%**

- Database schema: 70% (festival_id present on most tables, but defaults hard-coded)
- Provider/service readiness: 50% (active festival used, but no multi-festival switching)
- UI readiness: 30% (no festival selector, no historical festival view)
- Permission readiness: 40% (RLS doesn't differentiate festival contexts for some operations)
- Production readiness: 40% (hard-coded years, no archive workflow)

---

## 12. Organisation and Permission Audit

### Roles Found in Code

| Role | Where Used | CHECK constraint | RLS references |
|---|---|---|---|
| `admin` | profiles.role CHECK (002) | **YES** | `get_my_tenant_id()`, `is_superadmin()` |
| `judge` | profiles.role CHECK (002) | **YES** | Via token-based access |
| `volunteer` | profiles.role CHECK (002) | **YES** | Not visible in RLS |
| `participant` | profiles.role CHECK (002) | **YES** | Not visible in RLS |
| `super_admin` | RLS policies (030, 044) | **NO** — not in CHECK | Used in `festival_leaderboard_settings` |
| `tenant_admin` | RLS policies (030, 044) | **NO** — not in CHECK | Used in `festival_leaderboard_settings` |
| `festival_admin` | RPC functions (033, 037, 042) | **NO** — not in CHECK | Used in `get_festival_results()` |
| `admin_leader` | Edge Function (send-notification) | **NO** — not in CHECK | Used in notification role check |
| `superadmin` | Edge Function (send-notification) | **NO** — not in CHECK | Used in notification role check |
| `is_superadmin` | profiles table (boolean) | Separate column | Primary superadmin mechanism |

### Permission Issues

| Issue | Severity | Evidence |
|---|---|---|
| **Inconsistent role names** | HIGH | 5 different role naming conventions across RLS, RPCs, and Edge Functions |
| **Non-existent roles in RLS** | HIGH | `festival_leaderboard_settings` policies reference `super_admin`, `tenant_admin` which don't exist in CHECK constraint |
| **Organisation policy `USING (true)`** | HIGH | `007` line 48-49 allows any authenticated user to modify organisations |
| **No permission loading after login** | MEDIUM | Only role and is_superadmin loaded; no permission matrix |
| **Judge access is token-based, not role-based** | LOW | Design choice — acceptable for unauthenticated judge portal |

---

## 13. Complete RLS Audit

### Tables with RLS Enabled

| Table | RLS Enabled | Policies | Operation Coverage | Tenant Enforcement | Risks |
|---|---|---|---|---|---|
| `tenants` | YES (011) | SELECT: user's own + superadmin ALL | SELECT only for non-superadmin | Via get_my_tenant_id | Low |
| `profiles` | YES (002,011) | SELECT: own + superadmin ALL | SELECT, INSERT, UPDATE | Via auth.uid() | Low |
| `organisations` | YES (007,014) | SELECT: own + children + superadmin; ALL: superadmin | SELECT, ALL | Via get_my_tenant_id + parent check | **Legacy `USING (true)` may still exist** |
| `festival_calendar` | YES (011) | SELECT: local or global | SELECT only | Via get_my_tenant_id | **Missing INSERT/UPDATE/DELETE for admins** |
| `categories` | YES (011) | SELECT: local or global | SELECT only | Via get_my_tenant_id | **Missing INSERT/UPDATE/DELETE for admins** |
| `items` | YES (011,017) | SELECT: local or global; ALL: tenant admins | SELECT, ALL | Via get_my_tenant_id | Low |
| `participants` | YES (004,028) | SELECT/INSERT/UPDATE/DELETE: is_org_visible + superadmin | Full CRUD | Via is_org_visible() | Low — properly scoped |
| `registrations` | YES (004,028) | SELECT/INSERT/UPDATE/DELETE: is_org_visible + superadmin | Full CRUD | Via is_org_visible() | Low |
| `judges` | YES (018) | SELECT: all authenticated; ALL: tenant admins | Full CRUD | Via get_my_tenant_id | Low |
| `mark_entries` | YES (018,020,027) | SELECT: all; INSERT: **anon/authenticated (true)**; UPDATE: **anon/authenticated (true)**; ALL: tenant admins | **FULLY OPEN to anon** | **NO** | **CRITICAL** |
| `results` | YES (018,020) | SELECT: all authenticated; ALL: tenant admins | Full CRUD | Via get_my_tenant_id | Low |
| `venues` | Not confirmed | — | — | — | **Missing RLS** |
| `schedules` | Not confirmed | — | — | — | **Missing RLS** |
| `point_table` | Not confirmed | — | — | — | **Missing RLS** |
| `announcements` | Not confirmed | — | — | — | **Missing RLS** |
| `attendance` | Not confirmed | — | — | — | **Missing RLS** |
| `certificates` | Not confirmed | — | — | — | **Missing RLS** |
| `audit_logs` | Not confirmed | — | — | — | **Missing RLS** |
| `judge_tokens` | YES (019) | SELECT: **true (anyone)**; ALL: tenant admins | SELECT fully open | Tenant for ALL | **Public SELECT on tokens** |
| `file_metadata` | YES (025) | SELECT: public assets + all certificates; ALL: tenant admins | Full CRUD | Via get_my_tenant_id | Low |
| `festival_leaderboard_settings` | YES (030,044) | SELECT/INSERT/UPDATE: role-based (broken roles); Public SELECT: is_public_visible | Partial | **Broken role references** | **MEDIUM** |
| `poster_templates` | YES (030) | ALL: role-based (broken roles) | Full CRUD | **Broken role references** | **MEDIUM** |
| `poster_drafts` | YES (050) | ALL: editor_id = auth.uid() | Full CRUD | User-owned | Low |
| `poster_versions` | YES (050) | ALL: role-based (admin) | Full CRUD | Via role check | Low |
| `poster_approval_requests` | YES (050) | ALL: role-based (admin) | Full CRUD | Via role check | Low |
| `participant_unit_batches` | YES (055) | SELECT/INSERT/UPDATE: tenant-scoped | Partial CRUD | Via get_my_tenant_id | Low |
| `participant_unit_audit_logs` | YES (055) | SELECT/INSERT/UPDATE: tenant-scoped | Partial CRUD | Via get_my_tenant_id | Low |
| `system_events` | YES (055) | SELECT/INSERT: tenant-scoped | Partial CRUD | Via get_my_tenant_id | Low |
| `import_sessions` | YES (057) | ALL: tenant-scoped | Full CRUD | Via get_my_tenant_id | Low |
| `user_notification_tokens` | YES (074) | ALL: user-owned | Full CRUD | Via auth.uid() = user_id | Low |
| `notifications` | YES (074) | SELECT: tenant + superadmin; ALL: admin roles | Full CRUD | Via get_my_tenant_id | Low |
| `notification_logs` | YES (074) | SELECT: own; UPDATE: own; ALL: admin roles | Full CRUD | Via auth.uid() | Low |
| `system_api_keys` | Root SQL | SELECT/INSERT/UPDATE/DELETE: **any authenticated** | Full CRUD | **NO** | **CRITICAL** |

### Critical RLS Findings

1. **`mark_entries`**: `027_judge_portal_rls_bypass.sql` lines 52-62 set `USING (true)` and `WITH CHECK (true)` for INSERT and UPDATE to `public, anon, authenticated`. This means **any anonymous or authenticated user can modify any judge's marks in any tenant**. The original `018` and `020` policies are overridden.

2. **`judge_tokens`**: `019` line 21-23: `FOR SELECT USING (true)` — anyone can read all unused judge tokens.

3. **`organisations`**: `007` line 48-49: `FOR ALL USING (true)` — may still be active if 014 didn't drop it.

4. **`system_api_keys`**: Root SQL file allows any authenticated user full CRUD on API keys.

5. **Non-existent roles**: `festival_leaderboard_settings` and `poster_templates` policies reference `super_admin`, `tenant_admin`, `festival_admin` which don't exist in the profiles.role CHECK constraint. These policies likely **never match**, effectively blocking all non-superadmin access.

---

## 14. RPC and Database Function Audit

| Function | Security | Tables Accessed | Tenant Scope | Role Check | Mutation | Risk |
|---|---|---|---|---|---|---|
| `handle_new_user()` | SECURITY DEFINER | profiles | Sets role='admin' | None | INSERT | Low |
| `setup_tenant_records()` | SECURITY DEFINER | tenants, organisations, profiles | Creates new tenant | None (anyone can call) | INSERT/UPDATE | **MEDIUM — any authenticated user can create tenants** |
| `revoke_tenant_access()` | SECURITY DEFINER | organisations, auth.users, auth.identities, tenants, profiles | Deletes tenant | None | DELETE | **HIGH — destructive, no role check** |
| `setup_child_organisation()` | SECURITY DEFINER | tenants, organisations, profiles | Creates child | is_superadmin() OR tenant match | INSERT/UPDATE | Low — properly checked |
| `get_my_tenant_id()` | SECURITY DEFINER | profiles | Reads own tenant | auth.uid() | None (read-only) | Low |
| `is_superadmin()` | SECURITY DEFINER | profiles | Reads own flag | auth.uid() | None (read-only) | Low |
| `get_my_org_id()` | SECURITY DEFINER | organisations | Reads own org | get_my_tenant_id() | None (read-only) | Low |
| `get_visible_organisations()` | SECURITY DEFINER | organisations, tenants | Recursive hierarchy | p_tenant_id param | None (read-only) | **MEDIUM — tenant_id supplied by client** |
| `is_org_visible()` | SECURITY DEFINER | organisations | Checks visibility | get_my_tenant_id() | None (read-only) | Low |
| `generate_judge_token()` | SECURITY DEFINER | judge_tokens | Creates token | None (client-supplied tenant_id) | INSERT | **MEDIUM — tenant_id from client** |
| `validate_judge_token()` | SECURITY DEFINER | judge_tokens, judges, schedules, items, venues | Reads token + joins | None (public) | None (read-only) | Low — token is the auth |
| `get_judge_registrations()` | SECURITY DEFINER | registrations, schedules, participants | Reads by schedule | None (public) | None (read-only) | Low |
| `get_public_leaderboard()` | SECURITY DEFINER | results, festival_calendar, registrations, participants, organisations | Hard-codes 2026 | Public visibility check | None (read-only) | **MEDIUM — hard-coded year** |
| `get_festival_results()` | SECURITY DEFINER | results, registrations, schedules, items, participants, organisations | Via params | role IN (broken roles) | None (read-only) | **MEDIUM — broken role check** |
| `get_public_published_results()` | SECURITY DEFINER | Multiple | Via params | Public visibility | None (read-only) | Low |
| `get_public_candidate_profile()` | SECURITY DEFINER | participants, organisations, registrations, items, results | Via slug | public_profile_enabled | None (read-only) | Low |
| `get_public_unit_profile()` | SECURITY DEFINER | organisations, participants, registrations, items, results | Via unit_id | None (public) | None (read-only) | Low — exposes all participants for a unit |
| `preview_bulk_unit_assignment()` | SECURITY DEFINER | participants, organisations | Via params | is_org_visible + tenant check | None (read-only) | Low |
| `execute_bulk_unit_assignment()` | SECURITY DEFINER | participants, registrations, organisations, participant_unit_audit_logs | Via params | is_org_visible + tenant check | UPDATE | Low — properly checked |
| `rollback_unit_assignment()` | SECURITY DEFINER | participant_unit_audit_logs, participants, registrations, organisations | Via batch_id | None (anyone can call) | UPDATE | **MEDIUM — no role check on rollback** |
| `execute_junior_import_chunk()` | SECURITY DEFINER | participants, registrations, items, import_sessions | Via params | None (client-supplied tenant_id) | INSERT/UPDATE | **MEDIUM — tenant_id from client** |
| `ssf_calculate_age()` | IMMUTABLE | None | None | None | None | Low |
| `ssf_get_category()` | IMMUTABLE | None | None | None | None | **MEDIUM — hard-codes 2026** |
| `validate_participant_category()` | Trigger | participants | None | None | RAISE on mismatch | Low |
| `update_modified_column()` | Trigger | Any | None | None | Sets updated_at | Low |
| `reset_schedule_notification()` | Trigger | schedules | None | None | Resets notification_sent | Low |
| `slugify_candidate_name()` | IMMUTABLE | None | None | None | None | Low |
| `ensure_candidate_profile_slug()` | Trigger | participants | None | None | Sets profile_slug | Low |

---

## 15. Edge Function Security Audit

### `r2-presign`
- **Auth**: Verifies `supabaseClient.auth.getUser()` — **properly authenticated**
- **CORS**: `*` origin — **wide open**
- **Input validation**: Validates objectKey pattern via regex, validates contentType for profiles
- **Service-role**: None — uses anon client with user's auth token
- **Risk**: LOW — properly authenticated, validated

### `send-notification`
- **Auth**: Verifies user token, checks profile role (admin/superadmin)
- **Service-role**: YES — `SUPABASE_SERVICE_ROLE_KEY` used for database writes
- **Tenant scope**: Filters profiles by tenant_id for non-superadmin senders
- **Risk**: MEDIUM — service-role used but tenant-scoped

### `notification-cron`
- **Auth**: **NONE** — uses service-role directly
- **Tenant scope**: None — queries all schedules with `notification_sent = false`
- **Risk**: LOW — cron-triggered, not user-accessible, but no tenant isolation

### `_shared/r2Client`
- **Purpose**: Shared S3 client for R2
- **Secrets**: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` from env
- **Risk**: Low — server-side only

---

## 16. Authentication and Session Audit

### Flow (Confirmed)
```
Login (auth/login.tsx)
  → authService.login(identifier, password)
    → authProvider.lookupEmailByUsername() [RPC: lookup_email_by_username]
    → authProvider.signInWithPassword() [Supabase Auth]
    → authProvider.getProfile(userId) [profiles table]
  → authStore.setUser(user, tenant_id, role, is_superadmin)

Root Layout
  → checkSession() on mount
    → authService.getCurrentSession()
    → Restores auth state

useProtectedRoute()
  → Routes based on role + is_superadmin
```

### Issues Found

| Issue | Severity | Evidence |
|---|---|---|
| No password reset flow | MEDIUM | No UI or code for password reset |
| No disabled/deleted user handling | MEDIUM | No check for user status in profile |
| `handle_new_user()` auto-creates profile as 'admin' | LOW | 002 line 31: `role = 'admin'` |
| Dev mode bypasses all auth | LOW | `dev_config.ts:isDevMode` — currently false |
| No session refresh in UI screens | LOW | Supabase handles auto-refresh |
| `superService.ts` creates isolated Supabase client | MEDIUM | Uses `createClient()` directly — correct for isolated signup but couples to Supabase |

---

## 17. Result, Grade, and Scoring Audit

### Grade Calculation Implementations

| # | File | Function | A Threshold | B Threshold | C Threshold | Location |
|---|---|---|---|---|---|---|
| 1 | `src/core/utils/pointCalculator.ts:1-10` | `calculateGrade()` | **70%** | 60% | 50% | Frontend |
| 2 | `src/lib/calculators/resultCalculator.ts:22-28` | `ResultCalculator.getGrade()` | **75%** | 60% | 50% | Frontend |
| 3 | `rule.md` (documentation) | Business rule | **90%** for A+ | 75% for A | 60% for B | Documentation |
| 4 | `001_initial_schema.sql:215` | Comment in results table | `≥90/≥75/≥60/≥50` | — | — | Schema comment |

### CONFIRMED INCONSISTENCY

**`pointCalculator.ts`** (line 5): `if (pct >= 70) return 'A'` — Used by `judgeService.ts` and mark entry flow.

**`resultCalculator.ts`** (line 23): `if (score >= 75) return 'A'` — Used by `ResultCalculator` class.

**`rule.md`** (Section 9): States A grade = 75%.

**Schema comment**: States `≥75` for A.

The `pointCalculator.ts` is **incorrect** — it uses 70% instead of 75%. The `resultCalculator.ts` and `rule.md` agree on 75%.

### Points Configuration

| Source | Rank 1 | Rank 2 | Rank 3 | Configurable |
|---|---|---|---|---|
| `001_initial_schema.sql` defaults | 10 | 7 | 5 | Via points_config table |
| `pointCalculator.ts` defaults | 5 | 3 | 1 | Different defaults! |
| `resultCalculator.ts` | Uses config | Uses config | Uses config | Via PointsConfig type |

### Score Thresholds from `pointCalculator.ts`

| Grade | Individual Points | Group Points | Source |
|---|---|---|---|
| A+ | 6 | 18 | Config or default |
| A | 5 | 15 | Config or default |
| B | 3 | 10 | Config or default |
| C | 1 | 5 | Config or default |

---

## 18. Database Type Generation Audit

**No generated Supabase types found.** The project does not use `supabase gen types typescript` or any auto-generated database types.

**Manual types** in `src/types/index.ts` define: Tenant, Festival, Category, Item, Participant, Registration, PointsConfig. These are **incomplete** — missing many tables (schedules, judges, results, etc.).

**`any` usage**: Extensive throughout the codebase. The `DatabaseProvider` interface uses generic `<T>` types, and most callers pass `any`.

**Schema drift risk**: HIGH — manual types will drift from actual database schema. No compile-time verification.

---

## 19. Dependency Usage Verification

| Package | Phase 1 Claim | Verified | Evidence |
|---|---|---|---|
| `dexie` | Likely unused | **Confirmed unused** | No imports found in `src/` |
| `openai` | Likely unused | **Confirmed unused** | No imports found in `src/` — only `@google/generative-ai` used |
| `zod` | Likely unused | **Confirmed unused** | No imports found in `src/` |
| `@react-navigation/bottom-tabs` | Likely unused | **Confirmed unused** | All layouts use Stack, not Tabs |
| `@react-navigation/elements` | Likely unused | **Confirmed unused** | No direct imports found |
| `@react-navigation/native` | Likely unused directly | **Indirectly active** | Expo Router uses it internally |

---

## 20. Environment and Secret Exposure Audit

| Variable | Scope | Exposed to Frontend | Risk |
|---|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Frontend | YES | **Safe** — expected |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Frontend | YES | **Safe** — anon key |
| `EXPO_PUBLIC_R2_BUCKET` | Frontend | YES | **Safe** — bucket name |
| `EXPO_PUBLIC_R2_PUB_DOMAIN` | Frontend | YES | **Safe** — public domain |
| `EXPO_PUBLIC_STORAGE_PROVIDER` | Frontend | YES | **Safe** — config |
| `EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET` | Frontend | YES | **Safe** — bucket name |
| `R2_ACCOUNT_ID` | Edge Function | NO | **Safe** |
| `R2_ACCESS_KEY_ID` | Edge Function | NO | **Safe** |
| `R2_SECRET_ACCESS_KEY` | Edge Function | NO | **Safe** |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Function | NO | **Safe** |
| `GEMINI_API_KEY` / `GEMINI_API_KEYS` | Frontend (env fallback) | **YES** via `process.env` | **MEDIUM** — exposed if env vars set |
| `system_api_keys` table | Read by `public-ai-chat+api.ts` | YES — any authenticated user can read via RLS | **CRITICAL** |
| Hard-coded credentials in `008` | Migration SQL | N/A (database-side) | **CRITICAL** — `shibilikds938@gmail.com` / `m1o2n3u4` |
| Hard-coded tenant_id in `clear_test_data.sql` | Root SQL | N/A | LOW — test data |

---

## 21. Data Integrity Risks

| Risk | Table | Evidence | Severity |
|---|---|---|---|
| Duplicate registration possible | registrations | Unique on (participant_id, item_id) but not (participant_id, item_id, festival_id) until 057 | P1 |
| Chest number collision across festivals | participants | Unique on (chest_number, festival_id) — OK | Low |
| Orphaned registrations | registrations | No CASCADE delete from participants | P1 |
| Orphaned mark_entries | mark_entries | ON DELETE CASCADE from schedules/judges/registrations | Low |
| Published results modified without history | results | No audit trail for rank/grade changes after publish | P1 |
| Concurrent import corruption | participants | 057 uses `pg_advisory_xact_lock` — properly guarded | Low |
| Bulk unit assignment race condition | participants | 055 uses `FOR UPDATE SKIP LOCKED` + integrity hash — properly guarded | Low |

---

## 22. Security Risks

| Risk | Location | Severity | Evidence |
|---|---|---|---|
| **mark_entries fully open to anon** | `027` lines 52-62 | **P0 CRITICAL** | `USING (true) WITH CHECK (true)` for INSERT/UPDATE to public, anon, authenticated |
| **judge_tokens readable by anyone** | `019` lines 21-23 | **P0 CRITICAL** | `FOR SELECT USING (true)` |
| **system_api_keys fully open** | Root SQL | **P0 CRITICAL** | Any authenticated user can read/modify API keys |
| **organisations may be fully open** | `007` lines 48-49 | **P0** | `FOR ALL USING (true)` — verify if 014 dropped it |
| **Hard-coded credentials in migration** | `008` line 12,43 | **P0** | Email + password in plaintext SQL |
| **service-role in Edge Functions** | `send-notification` | P1 | Used with manual tenant scoping |
| **No CORS restriction on r2-presign** | Edge Function | P1 | `Access-Control-Allow-Origin: *` |
| **Broken RLS on leaderboard settings** | `030`, `044` | P1 | References non-existent role names |
| **Client-supplied tenant_id in RPCs** | `generate_judge_token`, `execute_junior_import_chunk` | P1 | tenant_id accepted from request without server verification |
| **No rate limiting on Edge Functions** | All 4 functions | P2 | No abuse protection |

---

## 23. Migration Risks

| Risk | Migration | Severity |
|---|---|---|
| `022_scoring_rules.sql` DROP CASCADE | Drops scoring_criteria and scoring_rules | **P0** |
| `008_superadmin_setup.sql` hard-coded credentials | Password in plaintext | **P0** |
| `007_flexible_hierarchy.sql` DROP COLUMN | Removes unit_org_id permanently | P1 |
| `018b` invalid SQL file | Contains Malayalam text | Low |
| `061` uses COMMIT outside transaction | May fail in migration runner | Medium |
| Missing RLS on venues, schedules, point_table, etc. | Not confirmed in migrations | **P1** |
| Duplicate migration numbers (018, 022) | May cause confusion | Medium |

---

## 24. P0 Release Blockers

| # | Issue | Evidence | Impact |
|---|---|---|---|
| 1 | **mark_entries RLS bypass** | `027_judge_portal_rls_bypass.sql` lines 52-62 | Any user can modify any judge's marks |
| 2 | **judge_tokens public SELECT** | `019_judge_tokens.sql` lines 21-23 | Anyone can read access tokens |
| 3 | **system_api_keys fully open** | Root `create_system_api_keys.sql` lines 23-45 | API keys readable/modifiable by any user |
| 4 | **organisations potentially fully open** | `007_flexible_hierarchy.sql` lines 48-49 | Verify if superseded by 014 |
| 5 | **Hard-coded credentials in SQL** | `008_superadmin_setup.sql` lines 12,43 | Password exposed in migration history |
| 6 | **Grade calculation inconsistency** | `pointCalculator.ts` line 5 (70%) vs `resultCalculator.ts` line 23 (75%) | Incorrect grades for scores 70-74% |
| 7 | **Broken RLS on leaderboard/poster tables** | `030`, `044` reference non-existent roles | Admins may be locked out of leaderboard settings |

---

## 25. P1 Pre-Release Requirements

| # | Issue | Evidence |
|---|---|---|
| 1 | Hard deletes without soft-delete on participants, judges, venues, schedules | `SupabaseDatabaseProvider.ts` multiple methods |
| 2 | No audit trail for result publication changes | `publishResults()` in provider |
| 3 | `listParticipants()` queries ALL tenants | `SupabaseDatabaseProvider.ts:157-163` |
| 4 | Inconsistent role naming across RLS, RPCs, and Edge Functions | 5+ different naming conventions |
| 5 | No database type generation | Manual types only, extensive `any` usage |
| 6 | Client-supplied tenant_id in RPCs | `generate_judge_token`, import RPCs |
| 7 | `venues`, `schedules`, `point_table` may lack RLS | Not confirmed in migrations |
| 8 | Hard-coded `2025`/`2026` in functions and defaults | `ssf_get_category`, `get_public_leaderboard`, `festival_calendar` |
| 9 | No CORS restriction on R2 presign Edge Function | `Access-Control-Allow-Origin: *` |
| 10 | `superService.ts` creates isolated Supabase client | Direct `createClient` import |

---

## 26. P2 Later Improvements

| # | Issue |
|---|---|
| 1 | Unused dependencies: `dexie`, `openai`, `zod`, `@react-navigation/bottom-tabs` |
| 2 | Root-level test/SQL scripts should be archived |
| 3 | `usePageAccess.ts` and `pageManagementStore.ts` are stubs |
| 4 | `participantService.updateCodeLetter()` throws "Not implemented" |
| 5 | `README.md` is generic Expo boilerplate |
| 6 | No automated test suite |
| 7 | `useFestivalSettings.ts` appears unused/legacy |

---

## 27. Verified Migration Completion Percentages

### Database Schema: **75%**
- Core tables present and properly scoped
- Missing RLS on some tables (venues, schedules, point_table)
- Hard-coded years in functions and defaults
- Duplicate scoring implementations

### Provider/Service Layer: **55%**
- Auth, participants, festival settings, judges, schedules, leaderboard migrated
- `fontService`, `publicAiService`, `unitProfileService`, `exportQueueService` bypass provider
- `listParticipants()` unscoped

### UI Readiness: **40%**
- Core flows work
- No festival switcher
- No historical festival view
- Broken leaderboard settings RLS may block admin UI

### Permission Readiness: **35%**
- Basic role-based routing works
- RLS role names inconsistent across 5+ naming conventions
- Some RLS policies reference non-existent roles
- mark_entries wide open

### Production Readiness: **30%**
- P0 security issues must be resolved
- Hard-coded credentials in migration history
- Grade calculation inconsistency
- No automated tests
- No database type generation

---

## 28. Questions Requiring Runtime or Production Verification

1. Are the `007` `USING (true)` policies on `organisations` still active, or were they properly dropped by `014`?
2. Are `venues`, `schedules`, `point_table`, `announcements`, `attendance`, `certificates`, `audit_logs` actually missing RLS, or were policies added outside migrations?
3. Is the `system_api_keys` table actually exposed via PostgREST, or is it excluded from the API schema?
4. What is the current state of the `generated_posters` table — does it have RLS?
5. Are there any database views or functions not captured in the 76 migrations?
6. Has the `027` mark_entries bypass been applied to production?
7. What is the actual production state of the `festival_leaderboard_settings` RLS — can admins actually manage settings?

---

## 29. Phase 3 Recommended Scope

1. **P0 Security Fixes**: Resolve mark_entries RLS, judge_tokens exposure, system_api_keys access, organisations policy
2. **RLS Completion**: Add RLS to all tables missing it (venues, schedules, point_table, etc.)
3. **Role Standardization**: Unify role naming across profiles CHECK constraint, RLS policies, RPCs, and Edge Functions
4. **Grade Calculation Fix**: Standardize to 75% threshold per rule.md
5. **Hard-coded Year Removal**: Make `ssf_get_category`, `get_public_leaderboard`, and `festival_calendar` defaults configurable
6. **Database Type Generation**: Set up `supabase gen types typescript` and reduce `any` usage
7. **Soft-Delete Migration**: Add `deleted_at` to participants, judges, venues, schedules before implementing soft-delete
8. **Unused Dependency Cleanup**: Remove `dexie`, `openai`, `zod`, `@react-navigation/bottom-tabs`
9. **Migration Cleanup**: Archive root-level SQL scripts, fix duplicate numbers, move `063` into migrations
10. **Custom Backend Readiness Assessment**: Evaluate which Supabase-dependent services can be extracted first

---

## 30. Evidence Index

### Critical Files Read in Full
| File | Lines | Key Finding |
|---|---|---|
| `supabase/migrations/001_initial_schema.sql` | 298 | 20 tables created, no RLS |
| `supabase/migrations/004_phase5_participant_management.sql` | 52 | **Wide-open RLS on participants** |
| `supabase/migrations/007_flexible_hierarchy.sql` | 52 | **Wide-open RLS on organisations**, DROP COLUMN |
| `supabase/migrations/008_superadmin_setup.sql` | 85 | **Hard-coded credentials** |
| `supabase/migrations/011_multi_tenant_rls.sql` | 77 | Core RLS policies |
| `supabase/migrations/018_phase5_judges_marks_results.sql` | 75 | Judges/marks/results RLS |
| `supabase/migrations/019_judge_tokens.sql` | 42 | **Public SELECT on tokens** |
| `supabase/migrations/020_complete_judge_system.sql` | 69 | **Public INSERT on mark_entries** |
| `supabase/migrations/022_scoring_rules.sql` | 375 | **DROP CASCADE**, scoring seed data |
| `supabase/migrations/027_judge_portal_rls_bypass.sql` | 69 | **CRITICAL RLS bypass on mark_entries** |
| `supabase/migrations/028_hybrid_participant_management.sql` | 152 | Org visibility, RPCs |
| `supabase/migrations/030_leaderboard_settings.sql` | 111 | **Broken role references** |
| `supabase/migrations/033_result_visibility.sql` | 252 | Result visibility, leaderboard |
| `supabase/migrations/044_leaderboard_settings_admin_policy.sql` | 74 | **More broken role references** |
| `supabase/migrations/049_candidate_profiles.sql` | 287 | Candidate profiles, public results |
| `supabase/migrations/050_poster_studio.sql` | 80 | Poster studio tables |
| `supabase/migrations/055_participant_unit_audit_logs.sql` | 454 | Bulk assignment RPCs |
| `supabase/migrations/057_junior_dataset_import.sql` | 168 | Import RPCs |
| `supabase/migrations/066_public_ai_views.sql` | 128 | 5 public views |
| `supabase/migrations/073_public_unit_profile.sql` | 84 | Unit profile RPC |
| `supabase/migrations/074_communication_center.sql` | 107 | Notification tables |
| `supabase/migrations/076_seed_scoring_rules.sql` | 747+ | Destructive re-seed |
| `create_system_api_keys.sql` | 45 | **Wide-open RLS on API keys** |
| `clear_test_data.sql` | 120 | Destructive script |
| `insert_test_data.sql` | 100 | Test fixture |
| `fix_notifs.sql` | 17 | Emergency RLS fix |
| `restore_schedules.sql` | 1122+ | Production data repair |
| `src/core/utils/pointCalculator.ts` | 60 | **70% A threshold** |
| `src/lib/calculators/resultCalculator.ts` | 97 | **75% A threshold** |
| `src/app/api/public-ai-chat+api.ts` | 186 | **API keys readable by any user** |
| `src/services/fontService.ts` | 86 | Direct Supabase |
| `src/services/publicAiService.ts` | 236 | Direct Supabase |
| `src/services/unitProfileService.ts` | 91 | Direct Supabase |
| `src/services/exportQueueService.ts` | 192 | Direct Supabase |
| `src/core/hooks/useNotificationsInbox.ts` | 110 | Direct Supabase |
| `src/app/settings.tsx` | 118 | Direct Supabase |

---

*End of Phase 2 Architecture Audit*
