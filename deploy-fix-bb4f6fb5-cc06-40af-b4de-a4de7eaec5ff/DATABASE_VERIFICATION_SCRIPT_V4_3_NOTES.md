# Database Verification Script V4.3 — Architectural & Project Impact Notes

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Scope**: Comprehensive architectural review and perfection of `database_readonly_verification_v4_3.sql` and `database_verification_forensic_optional.sql`  
**Safety Classification**: Read-only by design and statically reviewed for non-mutating statements.

---

## 1. Executive Summary

`database_readonly_verification_v4_3.sql` is the finalized, production-ready, read-only SQL verification script for the festival management platform.

V4.3 strictly separates main summary/verification queries from sensitive forensic code/DDL dumps, replaces table-level readiness with a precise Query-Level Prerequisite Matrix, joins `pg_policies` with `pg_class` to evaluate active RLS enforcement, introduces high-risk RLS risk summaries, refactors multi-festival readiness into a neutral decision report, splits null foreign keys from dangling relational references, and incorporates comprehensive boundary integrity checks.

---

## 2. Comprehensive Impact Analysis & Findings

### Finding 1: Optional Forensic Queries Executable in Main Script

* **Current implementation**: Previous versions labeled raw migration statements (B.5), full function definitions (C.6), full view definitions (C.7), and detailed duplicate record key triples (F.36) as "optional", but kept active SQL statements in the main script.
* **Actual problem**: Executing the file in Supabase SQL Editor automatically ran code dumps and key listings, violating the main script's non-sensitive summary guarantee.
* **Project impact**: SQL Editor logs and exported audit reports exposed legacy migration DDL, initial passwords, internal RPC webhook URLs, and persistent record key triples.
* **Example failure scenario**: A reviewer exports SQL Editor results to share with an external auditor, inadvertently leaking legacy database seed credentials embedded in initial migration statements.
* **Severity**: High (Data Privacy & Credential Exposure)
* **Recommended fix**: Completely remove all code-definition, raw DDL, and record key triple queries from `database_readonly_verification_v4_3.sql` and isolate them in `database_verification_forensic_optional.sql`.
* **Why this fix is preferred**: Keeps the main verification script 100% clean, aggregate-only, and safe to share without redaction.
* **Verification method**: Inspect `database_readonly_verification_v4_3.sql` for any `pg_get_functiondef`, raw `statements` text, or persistent key triples.
* **Remaining risk**: Reviewers must still redact output if they explicitly choose to run `database_verification_forensic_optional.sql`.

---

### Finding 2: Table-Level Readiness vs Query-Level Prerequisite Matrix

* **Current implementation**: Part E generated a readiness status *per table* based on a generic list of required columns.
* **Actual problem**: Table-level readiness either blocked queries unnecessarily (e.g. missing an optional `expires_at` column in `judge_tokens` blocked basic count queries) or marked a table ready when a specific query required columns not included in the generic list (e.g. `points_config`).
* **Project impact**: Human reviewers were either incorrectly blocked from running safe queries or experienced SQL syntax errors when running queries with unverified columns.
* **Example failure scenario**: F.20 queried `ind_a_plus_points` on `points_config`, but Part E checked only `rank_1_points`. The reviewer ran F.20 and encountered a fatal `column does not exist` error.
* **Severity**: Medium (Audit Resiliency & False Blockers)
* **Recommended fix**: Transform Part E into a **Query-Level Prerequisite Matrix** (`E.1`) that tests the exact table(s) and column(s) required by each individual Part F and Part G query (`query_id`).
* **Why this fix is preferred**: Provides 100% accurate, query-by-query execution guidance (`ready_for_query = true/false`).
* **Verification method**: Execute `E.1` and verify that `ready_for_query` accurately reflects column availability for each `query_id`.
* **Remaining risk**: If a new query is added to Part F/G in future versions, its entry must be added to the Part E CTE.

---

### Finding 3: Defined Policies vs Active RLS Enforcement Status

* **Current implementation**: Part D queried `pg_policies` in isolation without checking `relrowsecurity` on `pg_class`.
* **Actual problem**: A policy defined in `pg_policies` is NOT enforced by PostgreSQL if `relrowsecurity` is `false` on the underlying table.
* **Project impact**: Misleads auditors into assuming RLS protection is active when table-level RLS is actually disabled, creating a false sense of security.
* **Example failure scenario**: `mark_entries` has a tenant isolation policy defined in `pg_policies`, but an emergency fix disabled RLS (`ALTER TABLE mark_entries DISABLE ROW LEVEL SECURITY`). Part D reported the policy as present, masking the fact that the entire table was publicly exposed.
* **Severity**: High (False Security Conclusions)
* **Recommended fix**: Join `pg_policies` with `pg_class` and `pg_namespace` in Part D and evaluate `c.relrowsecurity`. Classify status as `ACTIVE POLICY (ENFORCED)` or `POLICY DEFINED BUT RLS DISABLED (NOT ENFORCED - HIGH RISK)`.
* **Why this fix is preferred**: Distinguishes policy existence from actual runtime database enforcement.
* **Verification method**: Compare `c.relrowsecurity` values across all public tables in `D.1`.
* **Remaining risk**: Role privileges granted via standard `GRANT` statements outside RLS must still be audited.

---

### Finding 4: Permissive vs Restrictive Boolean TRUE Policy Classification

* **Current implementation**: Subsections D.2, D.3, and D.8 searched for `qual = 'true'` without filtering for `permissive = 'PERMISSIVE'`.
* **Actual problem**: In PostgreSQL RLS, `RESTRICTIVE` policies combine with `AND`. A `RESTRICTIVE` policy `USING (true)` is a pass-through that does NOT grant access, whereas a `PERMISSIVE` policy `USING (true)` grants broad access (`OR`).
* **Project impact**: Classifying restrictive `true` policies as P0 security bypasses generates false positives and wastes engineering effort.
* **Example failure scenario**: A developer adds a restrictive tenant filter `RESTRICTIVE USING (tenant_id = get_my_tenant_id())` alongside a pass-through `RESTRICTIVE USING (true)`. The audit flags it as a critical P0 bypass.
* **Severity**: Medium (Audit False Positives)
* **Recommended fix**: Filter boolean TRUE bypass queries in D.2, D.3, and D.8 using `(p.permissive = 'PERMISSIVE' OR p.permissive IS NULL)`.
* **Why this fix is preferred**: Strictly targets policies that actually grant broad access.
* **Verification method**: Verify that only `PERMISSIVE` policies are returned in D.2, D.3, and D.8.
* **Remaining risk**: Complex custom function expressions in RLS policies must still be reviewed statically.

---

### Finding 5: High-Risk Access Summaries for `mark_entries` and `judge_tokens`

* **Current implementation**: D.4 and D.5 listed all policies on `mark_entries` and `judge_tokens` but did not automatically highlight high-risk bypass conditions.
* **Actual problem**: Auditors had to manually scan policy rows to identify whether anon or authenticated roles had unrestricted read/write access.
* **Project impact**: Critical security vulnerabilities (P0-1 mark entries manipulation, P0-2 judge token enumeration) could be overlooked during manual result inspection.
* **Example failure scenario**: An auditor scans 15 policies on `mark_entries` and misses a permissive `FOR ALL TO authenticated USING (true)` policy buried in the list.
* **Severity**: High (Security Vulnerability Oversight)
* **Recommended fix**: Add targeted Risk-Summary Subsections `D.4a` (`mark_entries` manipulation risk) and `D.5a` (`judge_tokens` enumeration risk) to automatically isolate dangerous policy combinations.
* **Why this fix is preferred**: Provides instant, automated visibility into P0-1 and P0-2 risks while keeping full policy lists for reference.
* **Verification method**: Run `D.4a` and `D.5a` in Supabase SQL Editor.
* **Remaining risk**: None; complements full inventory queries.

---

### Finding 6: Multi-Festival Active Readiness Reporting

* **Current implementation**: F.35 was titled "Active Festival Count Anomalies" and classified tenants with >1 active festival as database corruption.
* **Actual problem**: The target platform architecture explicitly supports multi-festival tenants (Level 2 & Level 3 models with historical or parallel active festivals).
* **Project impact**: Pre-judges valid multi-festival configurations as database corruption before business requirements are finalized.
* **Example failure scenario**: A tenant runs a Milad Kids program and a Sahithyotsav festival concurrently. The audit flags the tenant as corrupted.
* **Severity**: Low (Architectural Misclassification)
* **Recommended fix**: Refactor F.35 into `Tenant Active Festival Multi-Festival Decision Report` with neutral categories (`active_tenants_with_zero_active_festivals`, `active_tenants_with_single_active_festival`, `active_tenants_with_multiple_active_festivals`), labeling multiple active festivals as `Architecture decision required`.
* **Why this fix is preferred**: Provides decision support without forcing unconfirmed assumptions.
* **Verification method**: Inspect F.35 output categories.
* **Remaining risk**: Final multi-festival business rules must be determined in Stage 2.

---

### Finding 7: Splitting Null Foreign Keys from Dangling Relational References

* **Current implementation**: Previous versions combined NULL foreign key values with non-NULL dangling references (where the referenced row is missing).
* **Actual problem**: A NULL foreign key indicates an unassigned or optional relationship, whereas a non-NULL foreign key pointing to a non-existent primary key indicates broken data integrity or deleted parent records.
* **Project impact**: Confuses remediation planning because unassigned records require default backfilling, whereas dangling records indicate corrupt data requiring deletion or re-parenting.
* **Example failure scenario**: F.25 reports 50 orphan judge tokens. Engineers attempt to delete judge tokens, not realizing 45 of them simply have `judge_id IS NULL` (unassigned drafts).
* **Severity**: Medium (Remediation Confusion)
* **Recommended fix**: Split Subsections F.25, F.26, F.28, F.33, and F.34 into separate aggregate counts: `null_foreign_key_count` vs `missing_referenced_record_count`.
* **Why this fix is preferred**: Delivers precise diagnostic clarity for remediation teams.
* **Verification method**: Inspect output columns in F.25, F.26, F.28, F.33, and F.34.
* **Remaining risk**: None; improves aggregate clarity.

---

### Finding 8: Relational & Cross-Boundary Competition Integrity

* **Current implementation**: Boundary checks in V4.2 covered basic tenant/festival mismatches, but missed multi-table competition boundary checks.
* **Actual problem**: Data corruption can occur across multi-step relationships (e.g. a participant registered for an item belonging to a different festival, or a judge scoring a schedule belonging to a different festival).
* **Project impact**: Results, leaderboards, and mark entries can be corrupted across festival boundaries without triggering foreign key violations.
* **Example failure scenario**: A registration connects Participant (Festival A) to Item (Festival B). Marks are entered and points are added to Festival B's leaderboard, corrupting standings.
* **Severity**: High (Data Integrity & Competition Standing Corruption)
* **Recommended fix**: Add Subsection `F.36` checking cross-boundary competition alignment:
  - Registration participant festival vs item festival
  - Result festival vs item festival
  - Judge festival vs schedule festival
  - Mark entry judge festival vs schedule festival
  - Mark entry item festival vs schedule festival
* **Why this fix is preferred**: Validates full relational boundary integrity using schema-confirmed relationships.
* **Verification method**: Execute `F.36` in Supabase SQL Editor.
* **Remaining risk**: Non-foreign-key soft references must be audited at the application layer.

---

## 3. Section Safety & Execution Categorization

```text
Part A: Universal Catalog Preflight  [Universally Safe - Run Always]
Part B: Migration History            [B.1-B.4 Safe JSONB Metadata]
Part C: Function & Grant Inspection  [C.1-C.5 Safe Metadata & Flags]
Part D: P0 RLS Verification          [Universally Safe Catalog Queries - Active RLS Joins]
Part E: Query-Level Matrix           [Universally Safe - Query Readiness Matrix]
Part F: Core Data & Boundary Checks  [F.1-F.36 Safe Aggregate Summaries]
Part G: Optional Modules             [G.1-G.16 Schema-Dependent Module Summaries]
Part H: Verification Complete        [Universally Safe Catalog Summary]
```

### Categorization Table

| File | Section | Safety | Prerequisite | Output Type |
|---|---|---|---|---|
| **V4.3** | **Part A** | Universally Safe | Run Always | Preflight counts, RLS status, column/index/trigger inventories. |
| **V4.3** | **Part B (B.1–B.4)** | Safe Metadata | Run B.2–B.4 if B.1 = `true` | Migration table existence, column inventory, JSONB composite-row safe metadata. |
| **V4.3** | **Part C (C.1–C.5)** | Safe Metadata & Flags | Run Always | Function attributes, SECURITY DEFINER audit, `to_regrole` safe privileges, structured flags. |
| **V4.3** | **Part D (D.1–D.8)** | Universally Safe | Run Always | Active RLS policy enforcement joins, risk summaries D.4a & D.5a, normalized TRUE checks. |
| **V4.3** | **Part E (E.1)** | Universally Safe | Run Always | Query-Level Prerequisite Matrix evaluating exact query readiness (`ready_for_query`). |
| **V4.3** | **Part F (F.1–F.36)** | Schema-Dependent Summary | Check `E.1` Matrix First | Single-row aggregate counts for tenant/festival distributions, dangling references, boundary checks. |
| **V4.3** | **Part G (G.1–G.16)** | Schema-Dependent Summary | Check `E.1` Matrix First | Module aggregate counts (`system_api_keys`, `file_metadata`, `notifications`, `Poster Studio`). |
| **V4.3** | **Part H** | Universally Safe | Run Always | Final public schema summary counts (tables, policies, functions, views). |
| **FORENSIC** | **Section 1–4** | Optional / Sensitive | Run with Caution | Raw migration statements (1.1), full function defs (2.1), full view defs (3.1), duplicate key triples (4.1). |

---

## 4. Instructions for Human Reviewer

1. **Static Review**: Inspect `database_readonly_verification_v4_3.sql` and `database_verification_forensic_optional.sql`.
2. **Run Main Verification Script**: Execute `database_readonly_verification_v4_3.sql` in Supabase SQL Editor.
3. **Inspect Query-Level Matrix (`E.1`)**: Verify which queries in Part F and Part G have `ready_for_query = true`.
4. **Execute Ready Data Checks**: Run the corresponding queries in Part F and Part G.
5. **Run Optional Forensic Script Only If Needed**: If detailed code definitions or raw migration statements are required for audit remediation, execute `database_verification_forensic_optional.sql` and redact output before sharing.
6. **Compile Phase 5 Report**: Record all findings under *Runtime Confirmed*, *Runtime Disproved*, *Still Unverified*, or *Permission Prevented Verification*.
