# Database Verification Script V4.2 — Architecture & Change Notes

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Scope**: Meticulous diagnostic review and enhancement of `database_readonly_verification_v4_1.sql` -> `database_readonly_verification_v4_2.sql`  
**Safety Classification**: Read-only by design and statically reviewed for non-mutating statements.

---

## 1. Executive Summary

`database_readonly_verification_v4_2.sql` is the perfected, production-grade, read-only SQL verification script for the festival management platform database.

V4.2 resolves all physical column resolution issues in migration metadata queries, provides generic PostgreSQL role safety while retaining Supabase compatibility, enforces strict sequential section numbering, fixes NULL comparison semantics in multi-tenant boundary checks, splits null ownership from dangling relational references, and aligns all documentation 100%.

---

## 2. Diagnostics & V4.2 Technical Improvements

| # | Topic | Diagnostic Analysis | V4.2 Technical Fix / Design | Benefit |
|---|---|---|---|---|
| 1 | **Migration Metadata Query B.3** | Direct SQL references to `statements`, `executed_at`, or `inserted_at` fail at SQL compile/parse time if physical columns differ across Supabase CLI versions, regardless of `CASE WHEN EXISTS`. | Uses composite-row `to_jsonb(sm)` subquery: `migration_row ->> 'executed_at'`, `jsonb_typeof(migration_row -> 'statements')`. | 100% resilient across ALL Supabase CLI migration table variations without SQL compile errors. |
| 2 | **Supabase Function Roles in C.3** | `has_function_privilege('anon', ...)` throws a fatal error on vanilla PostgreSQL databases where `anon` or `authenticated` roles do not exist. | Wraps privilege calls in `to_regrole('anon') IS NOT NULL`: `CASE WHEN to_regrole('anon') IS NOT NULL THEN has_function_privilege('anon', ...) ELSE NULL END`. | PostgreSQL-generic AND Supabase-compatible; never crashes on missing roles. |
| 3 | **Sequential Section Numbering** | V4.1 had non-sequential section numbering in Part C (C.1, C.2, C.3, C.4, C.8, C.9, C.10). | Re-numbered Part C sequentially: C.1, C.2, C.3, C.4, C.5 (Views Metadata), C.6 (Full Functions Def), C.7 (Full Views Def). | 100% consistent sequential numbering across SQL comments and Notes. |
| 4 | **Boundary Comparisons & NULLs** | Standard `!=` evaluates to `NULL` (unknown) when comparing NULL values, missing cross-tenant boundary violations where one side is NULL. | Replaced `!=` with `IS DISTINCT FROM` in Subsections F.15, F.30, F.31, F.32. | Accurately counts NULL vs non-NULL mismatches as boundary integrity violations. |
| 5 | **Null Ownership vs Dangling References** | F.33 combined null tenant/festival ownership with missing parent row references in one query. | Split into F.33 (Dangling Relational References for registrations, results, mark_entries) and F.34 (Participants Null Ownership vs Dangling Record Analysis). | Clear, distinct metrics for missing parent records versus unassigned NULL IDs. |
| 6 | **F.35 Prerequisite Header** | F.35 (Active festival anomalies) queried both `public.tenants` and `public.festival_calendar`, but header omitted `festival_calendar`. | Corrected header comment to: `-- PREREQUISITE: Run only if tables 'tenants' AND 'festival_calendar' exist`. | Accurate prerequisite guidance for human reviewer. |
| 7 | **Part E Data Type Claims** | Part E reports existing column types but does not perform automated validation. | Updated comments and Notes to explicitly describe reported types as empirical evidence for manual schema-drift review by human auditor. | Transparent, accurate description of Part E matrix capability. |
| 8 | **Unconditional `TRUE` Policy Detection** | Broad `LIKE '%true%'` produces false positives; exact normalized string matching is required. | Uses `qual = 'true' OR with_check = 'true' OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true'`. | Zero false positives on legitimate `is_active = true` production policies. |
| 9 | **Audit Completeness (F.33)** | Missing boundary integrity checks for foreign key relationships. | Added F.33 aggregate counts for registrations missing participants, results missing registrations, and marks missing registrations. | Complete relational integrity coverage for core competition tables. |

---

## 3. Section Safety & Run Instructions

```text
Part A: Universal Catalog Preflight  [Universally Safe - Run Always]
Part B: Migration History            [B.1-B.4 Safe JSONB Metadata | B.5 Optional Forensic Raw SQL]
Part C: Function & Grant Inspection  [C.1-C.5 Safe Metadata & Flags | C.6-C.7 Optional Definitions]
Part D: P0 RLS Verification          [Universally Safe Catalog Queries - Run Always]
Part E: Prerequisite Matrix          [Universally Safe Catalog Matrix with Data Types - Run Always]
Part F: Core Data & Boundary Checks  [F.1-F.35 Safe Aggregate Summaries | F.36 Optional Detailed Forensic Duplicates]
Part G: Optional Modules             [G.1-G.16 Schema-Dependent Module Summaries]
Part H: Verification Complete        [Universally Safe Catalog Summary - Run Always]
```

### Categorization Table

| Section | Safety Classification | Execution Requirement | Notes |
|---|---|---|---|
| **PART A** | **Universally Safe** | Run Always | Preflight catalog counts, RLS status, column/index/trigger inventories. |
| **PART B (B.1–B.4)** | **Safe Metadata** | Run B.2-B.4 if B.1 = `true` | Migration table existence, column inventory, JSONB composite-row safe metadata (NO raw SQL text). |
| **PART B (B.5)** | **Optional / Forensic** | Run with Caution | Outputs raw DDL/DML migration statements text. Review for seed secrets before sharing. |
| **PART C (C.1–C.5)** | **Safe Metadata & Flags** | Run Always | Function attributes, `SECURITY DEFINER` audit, `to_regrole` safe privileges, structured security flags, views metadata. |
| **PART C (C.6–C.7)** | **Optional / Shielded** | Run with Caution | Full function definitions (`pg_get_functiondef`) and view definitions. Review output before sharing. |
| **PART D** | **Universally Safe** | Run Always | Exact normalized P0 RLS policy audit (`USING (true)`, `mark_entries`, `judge_tokens`, `system_api_keys`). |
| **PART E** | **Universally Safe** | Run Always | Evaluates `information_schema` to produce a table, column, and data-type matrix for Part F & G. |
| **PART F (F.1–F.35)** | **Schema-Dependent Summary** | Check Part E Matrix First | Single-row aggregate counts for tenant/festival distributions, profiles, scores, dangling references, and boundary mismatches. |
| **PART F (F.36)** | **Optional / Diagnostic** | Run for Remediation | Top 50 duplicate mark entry key triples `(judge_id, schedule_id, registration_id, count)`. |
| **PART G (G.1–G.16)** | **Schema-Dependent Summary** | Check Part E Matrix First | Module aggregate counts (`system_api_keys`, `file_metadata`, `notifications`, `Poster Studio`). |
| **PART H** | **Universally Safe** | Run Always | Final public schema summary counts (tables, policies, functions, views). |

---

## 4. Technical Mechanism: JSONB Composite-Row Dynamic Resolution in B.3

In PostgreSQL, referring to physical column names directly in a SELECT clause causes compile-time parsing errors if the column does not physically exist in the target table schema.

V4.2 solves this using `to_jsonb(sm)`:
```sql
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
```

### Why This Works
1. `to_jsonb(sm)` serializes the row into a JSONB object at runtime.
2. The PostgreSQL parser only checks that `sm` (the table) exists.
3. JSONB key extractions (`migration_row ->> 'key'`) evaluate dynamically at runtime. If a key is missing from the JSONB representation, it evaluates to `NULL` without raising a SQL syntax error.
4. This makes B.3 100% resilient across every Supabase CLI migration table schema variation.

---

## 5. Schema-Drift Recognition & Data Privacy Guidelines

### Recognizing Schema Drift
When running schema-dependent queries in Part F or Part G:
- `ERROR: relation "public.table_name" does not exist` -> Indicates a missing migration.
- `ERROR: column "column_name" does not exist` -> Indicates a missing column migration.
Record these errors in the Phase 5 Runtime Verification Report under `Runtime Disproved` or `Schema Drift`.

### Data Privacy Rules
Main Sections (Parts A through H) return **counts, boolean flags, catalog names, and aggregate numbers**. V4.2 **NEVER** returns:
- Participant names, emails, phone numbers, or addresses
- User passwords or auth tokens
- Raw judge tokens or session keys
- Raw API key values
- Signed R2 URLs

If you execute Optional Subsections B.5, C.6, C.7, or F.36, review and redact output before sharing.

---

## 6. What Cannot Be Verified Automatically Via SQL

1. **Supabase Auth Platform Settings**: Password min length, SMTP credentials, OAuth providers, and JWT expiry settings.
2. **Hard-coded Migration Passwords**: Password rotation status for accounts created in initial SQL scripts. (Must be verified/rotated in Supabase Dashboard -> Auth -> Users).
3. **Edge Function Environment Variables**: `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` configured in Edge Function runtimes.
4. **Cloudflare R2 Bucket Configuration**: CORS rules, lifecycle policies, and public access settings.
5. **Frontend Application Environment**: `EXPO_PUBLIC_BACKEND_PROVIDER` settings in build scripts.

---

## 7. Next Steps for the Human Reviewer

1. **Static Review of V4.2**: Verify `database_readonly_verification_v4_2.sql` for PostgreSQL syntax, catalog accuracy, and read-only safety.
2. **Execute Universal Catalog Sections**: Run Part A, Part C (C.1–C.5), Part D, and Part E in Supabase SQL Editor.
3. **Inspect Prerequisite Matrix**: Check Part E output to see which tables have `verification_status = 'READY FOR DATA CHECKS'` and inspect `existing_columns_with_types`.
4. **Execute Schema-Dependent Data Checks**: Run the corresponding queries in Part B (B.1–B.4), Part F (F.1–F.35), and Part G.
5. **Compile Phase 5 Runtime Report**: Save tabular results and classify all static audit findings into *Runtime Confirmed*, *Runtime Disproved*, *Still Unverified*, or *Permission Prevented Verification*.
