# Database Verification Script — Final Repository-Backed Validation Report

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Status**: Final static verification candidate (Repository Validated)  

---

## 1. Repository Coverage Summary

| Repository Component Area | Count Reviewed | Primary References |
|---|---|---|
| Migration Files (`supabase/migrations/`) | **77 files** | `001_initial_schema.sql` through `076_seed_scoring_rules.sql` |
| Root SQL Files | **11 files** | `create_system_api_keys.sql`, `063_official_participant_bracket.sql`, `add_code_letter_lock.sql` |
| Generated Schema & Types Files | **3 files** | `src/types/index.ts`, `src/core/config/`, database type contracts |
| Application Data-Usage Files | **45+ files** | `src/services/`, `src/lib/repositories/`, `src/hooks/`, `src/core/store/` |
| Edge Functions | **3 functions** | `supabase/functions/` (`notification-cron`, `r2-presign`, `send-notification`) |
| Documentation Files | **8 files** | Architectural notes, audit reports, READMEs |

---

## 2. Query Validation Summary (Part F & Part G)

* **Total Part F queries verified**: 36 queries (F.1 to F.36)
* **Total Part G queries verified**: 16 queries (G.1 to G.16)
* **Queries fully supported by repository evidence**: 52 queries (100%)
* **Queries corrected**: 3 prerequisite CTE entries corrected in Part E (F.33, F.35, F.36)
* **Queries removed**: 0 (all queries supported by physical repository schema)
* **Queries requiring human architecture decision**: 1 (F.35 neutral multi-festival active status report)
* **Queries requiring runtime confirmation**: All 52 queries (execution against live database)

---

## 3. Read-Only Safety Checklist

| Verification Item | Status | Technical & Repository Evidence |
|---|---|---|
| No `INSERT` statements | **PASS** | 0 occurrences in main script |
| No `UPDATE` statements | **PASS** | 0 occurrences in main script |
| No `DELETE` statements | **PASS** | 0 occurrences in main script |
| No `MERGE` / `UPSERT` statements | **PASS** | 0 occurrences in main script |
| No `ALTER` / `DROP` / `CREATE` / `TRUNCATE` | **PASS** | 0 occurrences in main script |
| No `GRANT` / `REVOKE` statements | **PASS** | 0 occurrences in main script |
| No PL/pgSQL `DO` procedural blocks | **PASS** | 0 occurrences in main script |
| No dynamic `EXECUTE` / `CALL` / `COPY` | **PASS** | 0 occurrences in main script |
| No application function invocations (`SELECT rpc_func()`) | **PASS** | 0 application RPCs executed; only built-in catalog getters (`version()`, `aclexplode()`, `to_regrole()`, `to_jsonb()`, `to_regclass()`) |
| No secret-retrieval / system function calls | **PASS** | 0 occurrences |
| No network / filesystem function calls | **PASS** | 0 occurrences |

---

## 4. Privacy & Output Safety Checklist

| Verification Item | Status | Technical & Repository Evidence |
|---|---|---|
| No raw migration statements in main script | **PASS** | B.3 outputs safe metadata only; raw statements moved to forensic file |
| No full function definitions (`pg_get_functiondef`) in main script | **PASS** | Moved exclusively to forensic file |
| No full view definitions (`definition`) in main script | **PASS** | Moved exclusively to forensic file |
| No raw judge token values | **PASS** | Only token counts and status aggregates returned |
| No raw API key values or encrypted key values | **PASS** | Only key counts and provider distributions returned |
| No PII (names, emails, phone numbers, passwords) | **PASS** | Zero user/participant PII returned |
| No detailed remediation key triples | **PASS** | F.29 returns single-row aggregate summary; detailed key triples moved to forensic file |

---

## 5. Query-Level Prerequisite Validation Matrix

| Query ID | Repository Evidence File | Tables Used | Columns Used | Part E Declared Match | Verdict |
|---|---|---|---|---|---|
| **F.1** | `001_initial_schema.sql` L2 | `tenants` | `tenants.id` | YES | Keep as-is |
| **F.2** | `007_flexible_hierarchy.sql` L9 | `organisations` | `organisations.tenant_id` | YES | Keep as-is |
| **F.3** | `001_initial_schema.sql` L107 | `participants` | `participants.tenant_id` | YES | Keep as-is |
| **F.4** | `001_initial_schema.sql` L107 | `participants` | `participants.tenant_id` | YES | Keep as-is |
| **F.5** | `001_initial_schema.sql` L131 | `registrations` | `registrations.tenant_id` | YES | Keep as-is |
| **F.6** | `001_initial_schema.sql` L131 | `registrations` | `registrations.tenant_id` | YES | Keep as-is |
| **F.7** | `001_initial_schema.sql` L14 | `festival_calendar` | `festival_calendar.festival_year`, `is_active` | YES | Keep as-is |
| **F.8** | `001_initial_schema.sql` L14 | `festival_calendar` | `festival_calendar.tenant_id`, `is_active` | YES | Keep as-is |
| **F.9** | `001_initial_schema.sql` L107 | `participants` | `participants.festival_id` | YES | Keep as-is |
| **F.10** | `001_initial_schema.sql` L107 | `participants` | `participants.festival_id` | YES | Keep as-is |
| **F.11** | `001_initial_schema.sql` L44 | `items` | `items.festival_id` | YES | Keep as-is |
| **F.12** | `001_initial_schema.sql` L207 | `results` | `results.festival_id` | YES | Keep as-is |
| **F.13** | `007_flexible_hierarchy.sql` L9 | `organisations` | `organisations.org_type`, `parent_id` | YES | Keep as-is |
| **F.14** | `007_flexible_hierarchy.sql` L9 | `organisations` | `organisations.id`, `parent_id` | YES | Keep as-is |
| **F.15** | `007_flexible_hierarchy.sql` L9 | `organisations` | `organisations.id`, `tenant_id`, `parent_id` | YES | Keep as-is |
| **F.16** | `002_auth_profiles.sql` L5 | `profiles` | `profiles.role` | YES | Keep as-is |
| **F.17** | `002_auth_profiles.sql` L5 | `profiles` | `profiles.role` | YES | Keep as-is |
| **F.18** | `008_superadmin_setup.sql` | `profiles` | `profiles.is_superadmin` | YES | Keep as-is |
| **F.19** | `002_auth_profiles.sql` L5 | `profiles` | `profiles.role` | YES | Keep as-is |
| **F.20** | `001_initial_schema.sql` L79, `023` | `points_config` | `points_config.festival_id`, rank & grade points | YES | Keep as-is |
| **F.21** | `001_initial_schema.sql` L207 | `results` | `results.grade`, `total_score` | YES | Keep as-is |
| **F.22** | `001_initial_schema.sql` L207 | `results` | `results.grade`, `total_score` | YES | Keep as-is |
| **F.23** | `022_scoring_rules.sql` L6 | `scoring_rules` | `scoring_rules.is_default`, `tenant_id` | YES | Keep as-is |
| **F.24** | `019_judge_tokens.sql` L5 | `judge_tokens` | `judge_tokens.is_used`, `expires_at` | YES | Keep as-is |
| **F.25** | `019_judge_tokens.sql`, `001` | `judge_tokens`, `judges` | `judge_tokens.judge_id`, `judges.id` | YES | Keep as-is |
| **F.26** | `019_judge_tokens.sql`, `001` | `judge_tokens`, `schedules` | `judge_tokens.schedule_id`, `schedules.id` | YES | Keep as-is |
| **F.27** | `001_initial_schema.sql` L191 | `mark_entries` | `mark_entries.is_final`, `is_draft` | YES | Keep as-is |
| **F.28** | `001_initial_schema.sql` L191 | `mark_entries`, `judges` | `mark_entries.judge_id`, `judges.id` | YES | Keep as-is |
| **F.29** | `027_judge_portal_rls_bypass.sql` | `mark_entries` | `mark_entries.judge_id`, `schedule_id`, `registration_id` | YES | Keep as-is |
| **F.30** | `001_initial_schema.sql` | `registrations`, `participants` | `participant_id`, `tenant_id` | YES | Keep as-is |
| **F.31** | `001_initial_schema.sql` | `results`, `registrations`, `participants` | `registration_id`, `festival_id`, `participant_id` | YES | Keep as-is |
| **F.32** | `001_initial_schema.sql` | `schedules`, `items` | `item_id`, `festival_id` | YES | Keep as-is |
| **F.33** | `001_initial_schema.sql` | `registrations`, `participants`, `results`, `mark_entries` | `registrations.id`, `participant_id`, `results.registration_id`, `mark_entries.registration_id` | YES (Part E fixed) | Corrected prerequisite |
| **F.34** | `001_initial_schema.sql`, `007` | `participants`, `tenants`, `festival_calendar` | `tenant_id`, `festival_id` | YES | Keep as-is |
| **F.35** | `001_initial_schema.sql`, `009` | `tenants`, `festival_calendar` | `tenants.id`, `tenants.is_active`, `festival_calendar.tenant_id`, `is_active` | YES (Part E fixed) | Corrected prerequisite |
| **F.36** | `001`, `019`, `027` | `registrations`, `participants`, `items`, `results`, `schedules`, `judges`, `judge_tokens`, `mark_entries` | Relational FK IDs across competition model | YES (Part E fixed) | Corrected prerequisite |
| **G.1** | `create_system_api_keys.sql` | `system_api_keys` | `provider`, `is_active` | YES | Keep as-is |
| **G.2** | `025_r2_storage_metadata.sql` | `file_metadata` | `asset_type`, `tenant_id`, `festival_id` | YES | Keep as-is |
| **G.3** | `074_communication_center.sql` | `notifications` | `notifications.tenant_id` | YES | Keep as-is |
| **G.4** | `074_communication_center.sql` | `notification_logs` | `notification_logs.status` | YES | Keep as-is |
| **G.5** | `074_communication_center.sql` | `user_notification_tokens` | `user_notification_tokens.user_id` | YES | Keep as-is |
| **G.6** | `001_initial_schema.sql` L288 | `audit_logs` | `audit_logs.id` | YES | Keep as-is |
| **G.7** | `055_participant_unit_audit_logs.sql` | `system_events` | `system_events.id` | YES | Keep as-is |
| **G.8** | `055_participant_unit_audit_logs.sql` | `participant_unit_batches` | `participant_unit_batches.id` | YES | Keep as-is |
| **G.9** | `055_participant_unit_audit_logs.sql` | `participant_unit_audit_logs` | `participant_unit_audit_logs.id` | YES | Keep as-is |
| **G.10** | `057_junior_dataset_import.sql` | `import_sessions` | `import_sessions.id` | YES | Keep as-is |
| **G.11** | `030`, `050_poster_studio.sql` | `poster_templates` | `poster_templates.id` | YES | Keep as-is |
| **G.12** | `050_poster_studio.sql` | `poster_drafts` | `poster_drafts.id` | YES | Keep as-is |
| **G.13** | `050_poster_studio.sql` | `poster_versions` | `poster_versions.id` | YES | Keep as-is |
| **G.14** | `032_generated_posters.sql` | `generated_posters` | `generated_posters.id` | YES | Keep as-is |
| **G.15** | `053_media_center_assets.sql` | `generated_assets` | `generated_assets.id` | YES | Keep as-is |
| **G.16** | `053_media_center_assets.sql` | `export_jobs` | `export_jobs.id` | YES | Keep as-is |

---

## 6. RLS Audit Validation Checklist

| Verification Item | Status | Technical & Repository Evidence |
|---|---|---|
| RLS-disabled tables visible in D.1 | **PASS** | D.1 starts from `pg_class c` and `LEFT JOIN pg_policies p`, rendering `RLS DISABLED` for unprotected tables |
| RLS-enabled tables with zero policies visible in D.1 | **PASS** | Rendered as `RLS ENABLED — NO POLICIES DEFINED (DENY ALL NON-OWNER ACCESS)` |
| Permissive vs restrictive policy distinction correct | **PASS** | Filtered via `(p.permissive = 'PERMISSIVE' OR p.permissive IS NULL)` in D.2, D.3, D.4a, D.5a, D.8 |
| Command-aware policy evaluation implemented | **PASS** | D.4a evaluates `qual` for SELECT/DELETE, `with_check` for INSERT, and both for UPDATE/ALL |
| Broad-role vs privileged-role classification correct | **PASS** | D.2 and D.3 separate `BROAD ROLE UNCONDITIONAL TRUE BYPASS` from `PRIVILEGED ROLE UNCONDITIONAL TRUE POLICY` |
| Normalized TRUE-expression matching avoids false positives | **PASS** | Exact normalized matching (`qual = 'true'`, `TRIM(BOTH '()' FROM TRIM(qual)) = 'true'`) prevents false positives on `is_active = true` |

---

## 7. Final Package Verdict

`Ready for runtime verification`
