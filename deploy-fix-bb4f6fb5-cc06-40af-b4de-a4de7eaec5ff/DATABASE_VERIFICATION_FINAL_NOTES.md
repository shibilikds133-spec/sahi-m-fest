# Database Verification Script — Final Repository-Backed Impact Notes

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Scope**: Final repository-backed validation pass for `database_readonly_verification_final.sql` and `database_verification_forensic_optional.sql`  
**Safety Classification**: Read-only by design and statically reviewed for non-mutating statements.

---

## 1. Executive Summary

`database_readonly_verification_final.sql` is the final static verification candidate for the festival management platform database.

This document records the exact 10-field impact analysis for every confirmed defect and correction applied during the final repository-backed verification pass.

---

## 2. Comprehensive 10-Field Impact Analysis & Corrected Findings

### Finding 1: D.1 Unable to Discover RLS-Enabled Tables Without Policies

* **Repository evidence**: `supabase/migrations/011_multi_tenant_rls.sql` enables RLS on core tables (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`), while policies are added in separate migrations (`018`, `019`, `025`, `027`, `030`, `050`, `053`, `055`, `074`).
* **Current SQL implementation**: D.1 queried `pg_policies` as the primary table in a `FROM pg_policies p JOIN pg_class c` statement.
* **Actual problem**: An ordinary table with `relrowsecurity = true` (RLS enabled) but **zero** policies defined in `pg_policies` does not produce any rows when querying `pg_policies`.
* **Runtime condition**: Occurs whenever RLS is enabled on a table before policies are written, or when policies are dropped during a migration reset.
* **Project impact**: Falsely indicates that all RLS-enabled tables have policy coverage, masking tables where RLS is enabled but zero policies exist (which blocks all non-owner user access).
* **Example failure scenario**: A developer enables RLS on `participants` but forgets to deploy the policy migration. D.1 reports no policy issue because `participants` doesn't appear in `pg_policies`, masking a fatal denial-of-service for all application users.
* **Severity**: P2 (Incorrect Audit Conclusion)
* **Recommended minimal fix**: Re-architected D.1 to start from `pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid` and `LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = n.nspname`.
* **Why this fix matches the repository**: Guarantees that every public table appears in D.1, accurately classifying status as `RLS DISABLED`, `RLS ENABLED — NO POLICIES DEFINED`, or `RLS ENABLED — ACTIVE POLICY ENFORCED`.
* **How the fix was validated**: Statically verified that all `pg_class` tables in schema `public` with `relkind = 'r'` are enumerated in D.1 regardless of `pg_policies` existence.
* **Remaining uncertainty**: None for catalog discovery; role permissions granted via `GRANT` outside RLS must still be reviewed at runtime.

---

### Finding 2: D.2 & D.3 Unconditional TRUE Policy Role-Scope Classification

* **Repository evidence**: `supabase/migrations/007_flexible_hierarchy.sql` L48 defines `CREATE POLICY "Admins full access to organisations" ON organisations FOR ALL USING (true);`. `011_multi_tenant_rls.sql` defines tenant-scoped policies.
* **Current SQL implementation**: D.2 (`participants`) and D.3 (`organisations`) checked `permissive = 'PERMISSIVE'` and `qual = 'true'`, but did not distinguish broad roles from privileged admin roles.
* **Actual problem**: A policy defined for a tightly scoped admin role (e.g. `FOR ALL TO super_admin USING (true)`) was classified identically to a public/anon tenant isolation bypass.
* **Runtime condition**: Occurs when inspecting databases containing legitimate super-admin or tenant-admin override policies.
* **Project impact**: Misleads auditors into reporting legitimate admin access rules as critical P0 tenant-isolation vulnerabilities, potentially causing corrective migrations that remove required admin access.
* **Example failure scenario**: An auditor sees `organisations_admin_policy USING (true)` and marks it as a P0 security vulnerability, prompting a migration that breaks the super-admin dashboard.
* **Severity**: P2 (Incorrect Audit Conclusion)
* **Recommended minimal fix**: Added a `risk_classification` CASE statement in D.2 and D.3 that categorizes findings into `BROAD ROLE UNCONDITIONAL TRUE BYPASS (P0 CRITICAL RISK)` (when `public`, `anon`, or `authenticated` is present) vs `PRIVILEGED ROLE UNCONDITIONAL TRUE POLICY (REVIEW REQUIRED)`.
* **Why this fix matches the repository**: Isolates actual tenant-isolation breaches while flagging admin policies for human review.
* **How the fix was validated**: Verified that policies are categorized based on role membership array checks.
* **Remaining uncertainty**: Unrecognized custom role names must still be validated against the runtime role model.

---

### Finding 3: D.4a & D.5a Command-Aware RLS Risk Evaluation

* **Repository evidence**: `supabase/migrations/027_judge_portal_rls_bypass.sql` (L47-L62) physically created permissive public policies on `mark_entries` (`FOR SELECT USING (true)`, `FOR INSERT WITH CHECK (true)`, `FOR UPDATE USING (true) WITH CHECK (true)`). `019_judge_tokens.sql` (L20-L23) created public SELECT policy `USING (true)` on `judge_tokens`.
* **Current SQL implementation**: D.4a (`mark_entries`) checked `p.cmd IN ('SELECT', 'INSERT', 'UPDATE', 'ALL')` and evaluated `qual IS NULL` or `qual = 'true'`.
* **Actual problem**: PostgreSQL RLS uses `qual` (`USING`) ONLY for `SELECT` and `DELETE` operations, and `with_check` (`WITH CHECK`) ONLY for `INSERT` operations. `UPDATE` uses both. Checking `qual IS NULL` for an `INSERT` policy reported it as high risk even if `with_check` contained a strict tenant check!
* **Runtime condition**: Occurs when inspecting `INSERT` or `UPDATE` policies that leave `USING` empty and define `WITH CHECK`.
* **Project impact**: Harmless `INSERT` policies were reported as critical security vulnerabilities, while dangerous `INSERT WITH CHECK (true)` policies could be overlooked if `qual` was non-null.
* **Example failure scenario**: A judge mark-entry insertion policy `FOR INSERT WITH CHECK (judge_id = auth.uid())` has no `USING` clause. D.4a flagged it as a high-risk bypass because `qual IS NULL`.
* **Severity**: P0 (Security Vulnerability Classification Accuracy)
* **Recommended minimal fix**: Refactored D.4a to evaluate command-specific expressions:
  - `SELECT` / `DELETE`: Checks `qual = 'true'`
  - `INSERT`: Checks `with_check = 'true'`
  - `UPDATE` / `ALL`: Checks `qual = 'true' OR with_check = 'true'`
* **Why this fix matches the repository**: Aligns RLS audit logic exactly with PostgreSQL engine policy enforcement rules and physical repository migration policies in `027_judge_portal_rls_bypass.sql` and `019_judge_tokens.sql`.
* **How the fix was validated**: Verified command-specific evaluation logic in D.4a and D.5a.
* **Remaining uncertainty**: Complex custom function expressions in `WITH CHECK` clauses require static review.

---

### Finding 4: Part E Prerequisite Matrix Coverage Mismatches (F.33, F.35, F.36)

* **Repository evidence**: `supabase/migrations/001_initial_schema.sql` (`registrations`, `results`, `mark_entries`, `participants`, `schedules`, `judges`, `items`), `009_tenant_management_funcs.sql` (`tenants.is_active`, `festival_calendar.is_active`), `019_judge_tokens.sql` (`judge_tokens`).
* **Current SQL implementation**: Part E declared required tables and columns for Part F queries, but omitted several columns actually referenced in F.33 (`registrations.id`), F.35 (`tenants.is_active`), and F.36 (`results` table, `judge_tokens` table, and 6 referenced columns).
* **Actual problem**: `ready_for_query = true` evaluated to `true` even if `registrations.id` or `tenants.is_active` was missing, causing SQL compile errors when running F.33, F.35, or F.36.
* **Runtime condition**: Occurs when running verification against an unmigrated database lacking `registrations.id` or `tenants.is_active`.
* **Project impact**: Undermines the reliability of Part E as a pre-execution safety gate.
* **Example failure scenario**: A reviewer checks Part E, sees `ready_for_query = true` for F.35, runs F.35, and gets a fatal `column tenants.is_active does not exist` error.
* **Severity**: P1 (Blocks Reliable Verification)
* **Recommended minimal fix**: Updated Part E CTE entries for F.33, F.35, and F.36 to explicitly declare every referenced table and column.
* **Why this fix matches the repository**: Ensures 100% accurate, query-by-query execution readiness.
* **How the fix was validated**: Performed exact line-by-line query-to-prerequisite validation in Pass 2 & 3 against repository schema.
* **Remaining uncertainty**: None; matrix declarations now match SQL and repository schema 100%.

---

### Finding 5: Separating Main Verification Script from Optional Forensic Script

* **Repository evidence**: Migration DDLs in `supabase/migrations/` contain raw migration SQL, function definitions (`pg_get_functiondef`), and internal table schemas.
* **Current SQL implementation**: Code definitions, raw migration SQL, and persistent key triples were labeled "optional" but remained active SQL in the main script.
* **Actual problem**: Running the entire main file in Supabase SQL Editor automatically executed code dumps and key listings.
* **Runtime condition**: Occurs whenever a human reviewer clicks "Run All" in Supabase SQL Editor.
* **Project impact**: SQL Editor logs exposed legacy migration seed credentials, internal RPC URLs, and persistent record key triples, violating main-script privacy guarantees.
* **Example failure scenario**: A reviewer exports SQL Editor results to share with an auditor, inadvertently exposing legacy database seed credentials embedded in initial migration statements.
* **Severity**: P3 (Privacy & Forensic Output Issue)
* **Recommended minimal fix**: Removed all code-definition, raw DDL, and key triple queries from `database_readonly_verification_final.sql` and moved them exclusively to `database_verification_forensic_optional.sql`.
* **Why this fix matches the repository**: Keeps the main verification script 100% clean, aggregate-only, and safe to share without redaction.
* **How the fix was validated**: Statically scanned `database_readonly_verification_final.sql` to confirm zero code-definition, DDL, or key triple queries exist.
* **Remaining uncertainty**: Reviewers executing the forensic file must review and redact outputs before sharing outside the project team.

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

---

## 4. Instructions for Human Reviewer

1. **Static Review**: Inspect `database_readonly_verification_final.sql` and `database_verification_forensic_optional.sql`.
2. **Run Main Verification Script**: Execute `database_readonly_verification_final.sql` in Supabase SQL Editor.
3. **Inspect Query-Level Matrix (`E.1`)**: Verify which queries in Part F and Part G have `ready_for_query = true`.
4. **Execute Ready Data Checks**: Run the corresponding queries in Part F and Part G.
5. **Run Optional Forensic Script Only If Needed**: If detailed code definitions or raw migration statements are required for audit remediation, execute `database_verification_forensic_optional.sql` and redact output before sharing.
6. **Compile Phase 5 Report**: Record all findings under *Runtime Confirmed*, *Runtime Disproved*, *Still Unverified*, or *Permission Prevented Verification*.
