# FINAL DATABASE RUNTIME AUDIT REPORT

**Project**: Multi-tenant Supabase/PostgreSQL Festival Management Platform  
**Audit Method**: Complete execution of read-only runtime verification script (Parts A–H)  
**Executed As**: `postgres` role (full catalog visibility)  
**Date Recorded**: 2026-07-24  

> [!CAUTION]
> No database fix, schema mutation, policy change, data deletion, or migration application was performed during this audit.

---

# 1. Executive Conclusion

The live database is operational and contains a substantial implemented schema, but it is **not currently safe to treat competition results as fully trustworthy**.

The most serious runtime-confirmed issues are:

1. **Unrestricted `mark_entries` RLS policies**
2. **120 finalized mark records crossing festival boundaries**
3. **31 judge-to-schedule festival mismatches**
4. **35 schedule-to-item festival mismatches**
5. **59 registration-to-participant tenant mismatches**
6. **14 cross-tenant organisation hierarchy links**
7. **Broad authenticated `USING true` policies across core multi-tenant tables**
8. **Public/default EXECUTE access on the public RPC/function surface**
9. **Migration-history drift: only migrations 001–004 are recorded although the live schema is far newer**
10. **Four judge tokens reference missing schedule records**

## Immediate Operational Recommendation

Until remediation and post-fix verification are complete:

- Do not publish or certify final competition results.
- Do not permit additional anonymous mark updates.
- Do not perform manual bulk corrections directly in production.
- Take a full database backup before applying any migration.
- Preserve all 151 mark rows and all audit history during correction.
- Perform row-level mismatch analysis before changing IDs.

---

# 2. Runtime Environment

## A. Catalog and Platform

| Property | Value |
|---|---|
| PostgreSQL | **17.6** |
| Architecture | **aarch64, 64-bit** |
| Database | `postgres` |
| Current role | `postgres` |
| Supabase `project_ref` | not exposed in SQL session |
| Supabase `region` | not exposed in SQL session |

## Public Schema Summary

| Object | Count |
|---|---|
| Tables | **48** |
| Functions | **72** |
| RLS policies | **181** |
| Views | **6** |
| Indexes | **87** |
| Trigger event rows | **17** |
| Unique trigger names | **12** |
| Tables containing triggers | **9** |

## RLS Baseline

- RLS is enabled on all **48 public tables**.
- No public table was found with RLS disabled.
- `FORCE ROW LEVEL SECURITY` is disabled on all tables.
- Every public table has at least one policy.

> [!NOTE]
> RLS being enabled does not make a table secure when permissive policies contain `USING true` or `WITH CHECK true`.

---

# 3. Migration History Drift

Recorded columns in `supabase_migrations.schema_migrations`: `version`, `statements`, `name`

**Only four migrations recorded**: `001`, `002`, `003`, `004`

**However, the live schema contains**: 48 tables, 72 public functions, judge/stage portal modules, import modules, poster modules, notification modules, multi-festival logic, public result views, participant-unit systems, and leaderboard systems.

> [!WARNING]
> **Runtime-confirmed migration-history tracking drift.** Later schema changes were likely executed manually, restored from another database, applied outside the tracked migration process, or introduced after migration history was reset. A fresh deployment or disaster recovery may not reproduce the current production schema.

---

# 4. Function and RPC Security

| Property | Count |
|---|---|
| Total public functions | **72** |
| SECURITY DEFINER functions | **56** |
| SECURITY DEFINER without `search_path` | **17** |

**17 functions missing safe `search_path`**:
- Import: `execute_general_import_chunk`, `execute_hs_import_chunk`, `execute_hss_import_chunk`, `execute_junior_import_chunk`, `execute_lp_import_chunk`, `execute_schedule_import_chunk`, `execute_senior_import_chunk`, `execute_upper_primary_import_chunk`
- Auth/Org/Log: `get_my_org_id`, `handle_new_user`, `log_judge_activity`, `lookup_email_by_username`
- Stage/Judge: `stage_portal_apply_code_letters`, `stage_portal_get_registrations`, `stage_portal_update_registration`, `stage_verify_token`, `validate_judge_token`

**Function grants**: Runtime scan shows `anon_can_execute = true`, `authenticated_can_execute = true`, PUBLIC/default EXECUTE grant present across the function surface.

> [!IMPORTANT]
> Catalog-level EXECUTE permission does not by itself prove exploitation. Some functions may enforce `auth.uid()`, `is_superadmin()`, tenant checks, judge tokens, or ownership checks. Nevertheless the exposure is real and each sensitive RPC must be explicitly allowlisted.

**Year handling**: `ssf_get_category` contains a default festival year of **2026** — the database is not fully free from year-specific defaults.

---

# 5. View Inventory

Six public views exist: `judge_submission_status`, `vw_public_leaderboard`, `vw_public_live_status`, `vw_public_participants`, `vw_public_results`, `vw_public_schedule`.

> [!WARNING]
> Exposed columns, grants, `security_invoker` behaviour, and whether underlying RLS is always respected have **not** been fully validated. A separate view exposure review is required before these views are considered safe.

---

# 6. RLS Security Findings

## 6.1 Critical: `mark_entries` — P0

Runtime policies confirm:
- `anon`/`authenticated` INSERT with `WITH CHECK (true)`
- `anon`/`authenticated` UPDATE with `USING (true)` and `WITH CHECK (true)`
- `authenticated` DELETE with `USING (true)`
- `authenticated` SELECT with `USING (true)`

> [!CAUTION]
> **P0 Security Issue**: An anonymous or ordinary authenticated client can create or change competition marks without any tenant, festival, schedule, judge, or registration validation.

## 6.2 Broad Permissive Policies Across Core Tables

| Table | Vulnerability |
|---|---|
| `tenants` | authenticated CRUD with `USING (true)` |
| `registrations` | authenticated ALL `USING (true)` + duplicate override policy |
| `results` | authenticated CRUD with `USING (true)` |
| `schedules` | authenticated full access + public read |
| `categories` | broad authenticated CRUD |
| `festival_calendar` | broad authenticated CRUD |
| `items` | broad authenticated CRUD |
| `judges` | broad authenticated CRUD + anon SELECT |
| `announcements` | broad authenticated CRUD |
| `attendance` | broad authenticated CRUD |
| `audit_logs` | broad authenticated CRUD |
| `certificates` | broad authenticated CRUD |
| `group_members` | broad authenticated CRUD |
| `point_table` | broad authenticated CRUD |
| `points_config` | broad authenticated CRUD |
| `transfer_logs` | broad authenticated CRUD |
| `venues` | broad authenticated CRUD |

PostgreSQL permissive policies are OR-combined. A single broad `USING (true)` policy defeats all tenant-scoped policies on the same table.

## 6.3 `judge_tokens` — PASSED (Runtime)

Policy: `authenticated` ALL, condition: own tenant or superadmin. Public enumeration query returned **zero rows**. Earlier static claim of public enumeration is not supported by current runtime state.

## 6.4 `system_api_keys` — PASSED

All operations restricted to superadmins. Contains 2 active Gemini API keys. Raw key values not exposed.

## 6.5 `participants` and `organisations` — PASSED

Focused unconditional-true checks returned no rows. Currently tenant, org-visibility, or superadmin scoped.

---

# 7. Data Integrity Findings

## Core Counts

| Entity | Count |
|---|---|
| Tenants | **16** |
| Organisations | **25** |
| Participants | **311** |
| Registrations | **814** |
| Items | **705** |
| Results | **91** |
| Mark entries | **151** |
| Profiles | **17** |
| Active festival records | **4** |

## Organisation Hierarchy

| Check | Result |
|---|---|
| Root organisations | 7 |
| Child organisations | 18 |
| Missing-parent orphans | **0** |
| `tenant_id = NULL` | **5** |
| Cross-tenant parent-child links | **14 ⚠️ P1** |

## Registrations

- Registration-to-participant tenant mismatches: **59 ⚠️ P1** (7.2% of all registrations)

## Festival Calendar

- 2025: 2 active, 2026: 1 active, 2027: 1 active = **4 active festivals** across 4 tenants
- Note: `tenants.is_active` column does not exist — F.35 could not execute

## Mark Integrity Summary

| Property | Count |
|---|---|
| Total marks | **151** |
| Finalized | **151** |
| Drafts | **0** |
| Missing judge records | **0** |
| Missing registration records | **0** |
| Duplicate mark groups | **0** |
| Mark ↔ judge ↔ schedule festival mismatches | **120 ⚠️ P0** |
| Mark ↔ item ↔ schedule festival mismatches | **120 ⚠️ P0** |

> [!CAUTION]
> **120 out of 151 finalized marks (79.5%) fail at least one cross-festival context check.** The two counts of 120 may refer to overlapping rows and must not be added together. No final result should be certified until all rows are reconciled.

## Schedule and Judge Mismatches

| Check | Count | Severity |
|---|---|---|
| Schedule-to-item festival mismatches | **35** | P1 |
| Judge-to-schedule festival mismatches | **31** | P1 |
| Judge tokens linked to missing schedule | **4** | P1 |
| Registration ↔ participant ↔ item festival mismatches | **7** | P1 |

## Results

- Total results: **91** (all one festival)
- Result-to-participant festival mismatch: **1 ⚠️ P2**
- Result-to-item festival mismatch: **0**

## Scoring and Grades

| Grade | Count |
|---|---|
| `-` | 26 |
| `C` | 19 |
| `B` | 15 |
| `A` | 21 |
| `A+` | 3 |
| NULL | **7 ⚠️ P2** |

Scores 70–74: **8 rows, all graded A** — internally consistent.

---

# 8. Profile and Role Model — P2

| Property | Value |
|---|---|
| Total profiles | 17 |
| Current distinct role | `admin` |
| Users with NULL role | 0 |
| Superadmin accounts | **1** |

DB constraint allows: `admin`, `judge`, `volunteer`, `participant`  
Live RLS policies reference: `super_admin`, `tenant_admin`, `festival_admin`, `admin_leader`, `superadmin`

Role vocabulary is inconsistent between database constraint, policy logic, and application code.

---

# 9. Optional Module Status

| Module | Count |
|---|---|
| Audit logs | **1,211** ⚠️ (broad policy — needs protection) |
| System events | 128 |
| Participant-unit audit logs | 308 |
| Participant-unit batches | 65 |
| Import sessions | 22 |
| Export jobs | 16 |
| Generated assets | 12 |
| File metadata | 22 (13 posters, 9 templates) |
| Gemini API keys | 2 active |
| Notifications | 9 |

---

# 10. Checks That Passed

- All 48 public tables have RLS enabled
- Participants: no NULL tenant/festival, all reference valid tenants and festivals
- Organisations: no missing parent records
- Registrations: no NULL tenant, all reference existing participants
- Results: all reference existing registrations
- Mark entries: all reference existing registrations, existing judges, no duplicates
- Judge tokens: all reference existing judges
- 70–74 score grading internally consistent
- `judge_tokens` not publicly enumerable (runtime confirmed)
- `system_api_keys` superadmin restricted (runtime confirmed)
- `participants` and `organisations`: no unconditional `true` policies

---

# 11. Checks Not Executable

| Query | Missing Column |
|---|---|
| F.24 | `judge_tokens.expires_at` |
| F.35 | `tenants.is_active` |

---

# 12. Verification Script Defects

1. **D.6**: Contains pasted JSON output instead of SQL query.
2. **F.8**: Present in prerequisite matrix but query absent from Part F.
3. **F.10**: Present in prerequisite matrix but query absent from Part F.

---

# 13. Severity Classification

## P0 — Immediate
| ID | Finding |
|---|---|
| P0-1 | Unrestricted mark-entry RLS (anon/authenticated write access) |
| P0-2 | 120 of 151 finalized marks fail cross-festival context checks |
| P0-3 | Results must not be certified until all relationships are reconciled |

## P1 — High Priority
- 59 registration/participant tenant mismatches
- 35 schedule/item festival mismatches
- 31 judge/schedule festival mismatches
- 14 cross-tenant organisation links
- 7 participant/item registration festival mismatches
- 4 judge tokens linked to missing schedules
- Broad authenticated permissive policies across 17+ core tables
- Public/default EXECUTE grants on sensitive RPCs
- 17 SECURITY DEFINER functions without safe `search_path`
- Migration-history drift (only 4 of 77+ migrations tracked)

## P2 — Medium Priority
- 1 result/participant festival mismatch
- 7 result rows with NULL grade
- Missing `judge_tokens.expires_at` column
- Missing `tenants.is_active` column
- Role vocabulary inconsistency (constraint vs policy vs app code)
- View exposure not fully verified
- Year-specific default (2026) in `ssf_get_category`
- Verification script defects (D.6, F.8, F.10)

---

# 14. Required Remediation Order

## Phase 0 — Freeze and Backup
1. Disable public result publication.
2. Temporarily block anonymous mark INSERT and UPDATE.
3. Take a full Supabase/PostgreSQL backup.
4. Export mismatch row IDs into a secure forensic report.
5. Preserve all 1,211 audit log rows and all 151 mark rows.

## Phase 1 — Security Containment
1. Replace broad `mark_entries` policies with token+tenant-validated policies.
2. Remove broad authenticated `USING (true)` / `WITH CHECK (true)` policies from tenant-owned tables.
3. Retain only explicitly intentional public SELECT policies.
4. Revoke PUBLIC/default EXECUTE from sensitive RPCs; grant only to required roles.
5. Add safe `search_path` to all 17 flagged SECURITY DEFINER functions.
6. Verify every SECURITY DEFINER function performs explicit authorization.

## Phase 2 — Data Reconciliation
Produce dry-run row-level reports (do not update using assumptions) for each mismatch category:
- 59 registration tenant mismatches
- 14 organisation hierarchy boundary links
- 35 schedule/item mismatches
- 31 judge/schedule mismatches
- 120 mark cross-festival mismatches
- 7 registration participant/item mismatches
- 1 result/participant mismatch
- 4 dangling judge-token schedule references
- 7 NULL-grade result rows

For each group, determine the authoritative source of truth before applying any correction.

## Phase 3 — Prevent Recurrence
- Composite foreign keys for tenant/festival-aligned relationships
- Unique constraints required by composite foreign keys
- Validation triggers for cross-table consistency not expressible as FK
- Safe deletion/cascade behaviour for judge tokens and schedules

## Phase 4 — Migration Recovery
1. Inventory the actual production schema.
2. Compare with all repository migration files.
3. Create forward-only reconciliation migrations.
4. Establish a documented production baseline for reproducible deployment.

## Phase 5 — Reverification
Re-run complete A–H audit plus role-level behavioural tests using: `anon`, `authenticated` ordinary admin, `judge`, `superadmin`, `service_role`.

---

# 15. Post-Fix Acceptance Criteria

- [ ] D.4a returns zero high-risk mark policies
- [ ] Sensitive tables have no broad authenticated write/delete policies
- [ ] F.26 returns zero missing schedule references
- [ ] F.30 returns zero tenant mismatches
- [ ] F.31 returns zero result/participant festival mismatches
- [ ] F.32 returns zero schedule/item mismatches
- [ ] F.36 returns zero unexplained cross-boundary mismatches
- [ ] Intentional global/root organisation links are formally documented
- [ ] Sensitive functions are no longer executable by PUBLIC/anon unless explicitly required
- [ ] All SECURITY DEFINER functions have safe `search_path`
- [ ] Migration history and live schema are reproducible from repository
- [ ] All 151 existing mark records are accounted for with before/after reconciliation
- [ ] Audit logs remain intact (≥ 1,211 rows preserved)
- [ ] Result publication remains blocked until all criteria above pass

---

# Final Assessment

The database is feature-rich and structurally active, but its current runtime state contains both **security-policy defects** and **competition-boundary data defects**.

The most urgent concern is not missing data. It is that existing, finalized data is connected across incorrect tenant or festival boundaries.

**The correct response is a controlled, evidence-preserving remediation — not a blind bulk update.**
