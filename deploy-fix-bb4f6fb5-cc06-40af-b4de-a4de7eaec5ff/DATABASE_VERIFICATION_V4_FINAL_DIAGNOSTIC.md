# Database Verification Script V4 — Final Diagnostic Review

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Scope**: Evidence-based design, technical correctness, and safety audit of `database_readonly_verification_v4.sql` and `DATABASE_VERIFICATION_SCRIPT_V4_NOTES.md`  
**Technical Basis**: PostgreSQL 15+ catalog specifications and Supabase Dashboard execution behavior  

---

## 1. Migration History Output

* **Current implementation**: Subsection B.2 queries `version`, `name`, `statements`, and `executed_at` from `supabase_migrations.schema_migrations`.
* **Likely reason for this design**: The author wanted a complete record of applied migrations including the executed DDL/DML statements.
* **PostgreSQL behaviour**: `supabase_migrations.schema_migrations` is a table created by Supabase CLI. In PostgreSQL, querying a text or text[] column like `statements` returns the full string/array content. If the column does not exist in a given Supabase version, PostgreSQL throws `ERROR: column "statements" does not exist`.
* **Supabase relevance**: Different Supabase CLI versions use slightly different column schemas for `schema_migrations` (e.g., some have `version` and `name`, others have `version`, `statements`, and `executed_at`/`inserted_at`). Furthermore, `statements` contains raw migration SQL, which may include legacy seed data, hard-coded initial passwords, test emails, or temporary API keys.
* **Is it actually wrong?**: Partially fragile. Querying `statements` without checking column existence can fail on CLI versions lacking that column. Outputting raw DDL/DML text also leaks sensitive seed data and bloats result output.
* **Is it intentional?**: Yes, intended to provide full migration visibility.
* **Risk or limitation**: Potential output bloat (megabytes of SQL text), potential failure if column name differs, and potential exposure of sensitive historical DDL seed data.
* **Available alternatives**:
  1. Safe metadata query: `version`, `name` (or COALESCE), `executed_at` (or `inserted_at`), and `array_length(statements, 1) AS statement_count` (if `statements` exists).
  2. Column-inventory check on `supabase_migrations.schema_migrations` before running B.2.
  3. Moving raw `statements` text dump to an optional forensic query.
* **Best design for this project**: Add a column inventory check for `schema_migrations` in B.2, output safe metadata (`version`, `name`, `executed_at`, `statement_count`) in B.3, and move raw `statements` text to an optional Subsection B.4 with a privacy warning.
* **Verdict**: `Split into safe and forensic queries`
* **Confidence**: High

---

## 2. Function Source Output in C.4–C.7

* **Current implementation**: Subsections C.4, C.5, C.6, and C.7 query `p.prosrc AS function_body` for helper functions (`get_my_tenant_id`, `is_superadmin`) and hard-coded year checks (`ssf_get_category`, `get_public_leaderboard`).
* **Likely reason for this design**: To verify whether critical RPCs contain tenant/superadmin logic and whether functions hard-code years like `2025` or `2026`.
* **PostgreSQL behaviour**: `p.prosrc` returns the raw function body string from `pg_proc`. It works reliably for any PostgreSQL function.
* **Supabase relevance**: In Supabase, RPC functions implement core security rules. Viewing function bodies confirms whether tenant boundaries are enforced in database logic.
* **Is it actually wrong?**: Not technically wrong, but returning raw `prosrc` text in main metadata sections contradicts the documentation claim that C.1–C.8 return only non-sensitive metadata without code definitions.
* **Is it intentional?**: Yes, intended to check for hard-coded years and tenant filters.
* **Risk or limitation**: Minor section categorization mismatch with documentation; potential output clutter.
* **Available alternatives**:
  1. Replace raw `prosrc` output in C.4–C.7 with structured boolean audit flags:
     `p.prosrc ILIKE '%2025%' AS references_2025`, `p.prosrc ILIKE '%2026%' AS references_2026`, `p.prosrc ILIKE '%tenant_id%' AS references_tenant_id`.
  2. Retain raw `prosrc` in an optional detailed inspection section (C.9).
* **Best design for this project**: Use structured boolean flags in main Subsections C.4–C.7 for immediate, non-verbose audit signals, and rely on optional Subsection C.9 for full source inspection when needed.
* **Verdict**: `Minor improvement`
* **Confidence**: High

---

## 3. Detection of Unconditional `true` RLS Policies

* **Current implementation**: Subsections D.2 and D.3 use `(qual = 'true' OR with_check = 'true' OR qual LIKE '%true%' OR with_check LIKE '%true%')` to detect permissive policies.
* **Likely reason for this design**: The author wanted to catch all variations of boolean `true` policies across `participants` and `organisations`.
* **PostgreSQL behaviour**: In PostgreSQL `pg_policies`, policy expressions (`qual` and `with_check`) are deparsed text strings. A policy defined as `USING (true)` is deparsed by PostgreSQL as the string `'true'`. However, `LIKE '%true%'` matches ANY policy expression containing the substring `'true'`, such as `is_active = true`, `is_published = true`, `is_superadmin = true`, or `tenant_id = get_my_tenant_id() AND is_active = true`.
* **Supabase relevance**: In Supabase applications, many tables have legitimate policies containing `is_active = true` or `is_superadmin = true`. Broad `LIKE '%true%'` produces massive false positives, flagging secure policies as security bypasses.
* **Is it actually wrong?**: Yes. Broad `LIKE '%true%'` matching causes false positives that undermine audit accuracy.
* **Is it intentional?**: Intended to catch parenthesized variants like `(true)`, but implemented too broadly.
* **Risk or limitation**: High rate of false positive alerts on valid production policies.
* **Available alternatives**:
  1. Exact normalized match: `qual = 'true' OR with_check = 'true' OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true' OR TRIM(BOTH '()' FROM TRIM(with_check)) = 'true'`.
  2. Matching deparsed boolean literals without matching column names like `is_active = true`.
* **Best design for this project**: Replace broad `LIKE '%true%'` with exact normalized string comparison (`qual = 'true'` / `with_check = 'true'` / trimmed parentheses).
* **Verdict**: `Replace implementation`
* **Confidence**: High

---

## 4. Roles Array Inspection

* **Current implementation**: Subsection D.8 uses `(roles @> ARRAY['authenticated'] OR roles @> ARRAY['public'])`.
* **Likely reason for this design**: To check if an RLS policy applies to `authenticated` or `public` roles using array containment.
* **PostgreSQL behaviour**: In `pg_policies`, `roles` is an array of type `name[]`. In PostgreSQL 15+, `roles @> ARRAY['authenticated']` implicitly coerces `text[]` to `name[]` and evaluates correctly. However, explicit role checking via `'authenticated'::name = ANY(roles)` or `roles @> ARRAY['authenticated'::name]` is more explicit and type-safe.
* **Supabase relevance**: Supabase RLS heavily relies on `authenticated` and `anon` role arrays in `pg_policies`.
* **Is it actually wrong?**: No. It evaluates correctly in PostgreSQL 15+, but can be improved for strict type safety.
* **Is it intentional?**: Yes, standard array containment approach.
* **Risk or limitation**: Minor type coercion overhead; potential syntax warning in stricter SQL parsers.
* **Available alternatives**:
  1. Explicit type cast: `roles @> ARRAY['authenticated'::name]`
  2. Element matching: `'authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles)`
* **Best design for this project**: Use `'authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles)` for clear, type-safe array inspection.
* **Verdict**: `Minor improvement`
* **Confidence**: High

---

## 5. Average Score Rounding

* **Current implementation**: Subsection F.21 uses `ROUND(AVG(total_score), 2) AS avg_score`.
* **Likely reason for this design**: To format average total scores in the results summary to 2 decimal places.
* **PostgreSQL behaviour**: In PostgreSQL:
  - `AVG(numeric)` returns `numeric`. `ROUND(numeric, integer)` is valid.
  - `AVG(double precision)` returns `double precision`.
  - `ROUND(double precision, integer)` DOES NOT EXIST in PostgreSQL! Executing `ROUND(val::double precision, 2)` throws `ERROR: function round(double precision, integer) does not exist`.
* **Supabase relevance**: Depending on which migration was applied, `results.total_score` may be defined as `numeric`, `decimal(5,2)`, `real`, or `double precision`. If `total_score` is float/double precision, F.21 crashes with a fatal PostgreSQL function error.
* **Is it actually wrong?**: Yes, fragile against schema drift where `total_score` is floating-point.
* **Is it intentional?**: Intended to format output cleanly, but assumed `total_score` is always `numeric`.
* **Risk or limitation**: Query failure if `results.total_score` is `double precision` or `real`.
* **Available alternatives**:
  1. Cast average to numeric explicitly: `ROUND(AVG(total_score)::numeric, 2)`
  2. Include column data types in Part E Prerequisite Matrix to inform the reviewer of exact column types.
* **Best design for this project**: Change F.21 to `ROUND(AVG(total_score)::numeric, 2)` and add `data_type` / `udt_name` to the Part E matrix.
* **Verdict**: `Replace implementation`
* **Confidence**: High

---

## 6. Duplicate Mark Entry Output

* **Current implementation**: Subsection F.29 returns raw `judge_id`, `schedule_id`, `registration_id`, and `duplicate_count` rows.
* **Likely reason for this design**: To identify specific duplicate mark entry groups for remediation.
* **PostgreSQL behaviour**: `GROUP BY judge_id, schedule_id, registration_id HAVING COUNT(*) > 1` returns one row per duplicate group.
* **Supabase relevance**: In a corrupted database, this query could return hundreds or thousands of individual rows into the SQL Editor grid. Furthermore, returning specific record key triples contradicts the script's documentation claim that Part F returns strictly summary counts and aggregates.
* **Is it actually wrong?**: Not a database syntax error, but violates output privacy/summary constraints and risks output flooding.
* **Is it intentional?**: Intended for diagnostic remediation.
* **Risk or limitation**: SQL Editor grid overflow if duplicate records are numerous; inconsistency with summary-only documentation claims.
* **Available alternatives**:
  1. Two-stage design:
     - Primary query (F.29 in Main Section): Single-row aggregate summary (`total_duplicate_groups`, `max_duplicates_in_group`, `total_excess_duplicate_rows`).
     - Diagnostic query (F.29b in Optional Subsection): Detailed list of `(judge_id, schedule_id, registration_id, count)` limited to 50 rows.
* **Best design for this project**: Split into a single-row aggregate summary in main Part F, and place detailed record key triples in an optional diagnostic subsection.
* **Verdict**: `Split into safe and forensic queries`
* **Confidence**: High

---

## 7. Tenant and Festival Ownership Completeness

* **Current implementation**: V4 checks tenant distributions for `organisations`, `participants`, `registrations`, `festival_calendar`; festival distributions for `participants`, `items`, `results`; orphan organisations; cross-tenant parent-child links; orphan judge tokens; and orphan mark entries.
* **Likely reason for this design**: Covered primary entity ownership distribution.
* **PostgreSQL behaviour**: Standard foreign key / join relational queries.
* **Supabase relevance**: The core architecture requirement is multi-tenant and multi-festival isolation. Crucial boundary violations can occur across secondary relationships.
* **Is it actually wrong?**: Incomplete coverage of multi-tenant and multi-festival boundary risks.
* **Is it intentional?**: Omission due to incremental script evolution.
* **Risk or limitation**: Missing early detection of silent cross-tenant or cross-festival data corruption (e.g. registration tenant differing from participant tenant).
* **Available alternatives**:
  Add high-value aggregate boundary integrity checks to Part F:
  - F.30: Registrations tenant mismatch with participant tenant (`registrations.tenant_id != participants.tenant_id`)
  - F.31: Results festival mismatch with registration/item festival (`results.festival_id != participants.festival_id`)
  - F.32: Schedules item festival mismatch (`schedules.festival_id != items.festival_id`)
  - F.33: Participants referencing non-existent tenant or festival
  - F.34: Active festival anomalies per tenant (tenants with 0 active festivals or >1 active festival)
* **Best design for this project**: Add high-value aggregate boundary integrity queries (F.30–F.34) to Part F. All queries return a single aggregate count row.
* **Verdict**: `Minor improvement`
* **Confidence**: High

---

## 8. Notes and Script Consistency

* **Current implementation**: `DATABASE_VERIFICATION_SCRIPT_V4_NOTES.md` documents V4 architecture, safety rules, and section categorizations.
* **Likely reason for this design**: Documented the script design principles.
* **PostgreSQL behaviour**: Documentation file (Markdown).
* **Supabase relevance**: High; guides human reviewers executing the audit in Supabase SQL Editor.
* **Is it actually wrong?**: Yes, contains several minor documentation mismatches with the actual SQL:
  1. Notes claimed C.1–C.8 return NO code definitions, but C.4–C.7 in V4 SQL returned raw `p.prosrc`.
  2. Notes claimed Part B outputs safe metadata only, but B.2 in V4 SQL queried raw `statements`.
  3. Notes claimed Parts A–G return strictly counts/aggregates, but F.29 returned raw key triples.
  4. Notes referenced full definition subsections as C.6/C.7 in text, but they were C.9/C.10 in SQL.
* **Is it intentional?**: Discrepancies caused by rapid manual iterations.
* **Risk or limitation**: Confuses reviewers executing the verification workflow.
* **Available alternatives**:
  Align `DATABASE_VERIFICATION_SCRIPT_V4_1_NOTES.md` 100% with `database_readonly_verification_v4_1.sql`.
* **Best design for this project**: Correct all section labels, privacy claims, and execution guidelines in V4.1 Notes to perfectly match V4.1 SQL.
* **Verdict**: `Keep with documentation correction`
* **Confidence**: High

---

## 9. Read-Only Safety

* **Current implementation**: Static scan of `database_readonly_verification_v4.sql`.
* **Likely reason for this design**: Designed specifically for read-only database inspection.
* **PostgreSQL behaviour**:
  - `INSERT`, `UPDATE`, `DELETE`, `UPSERT`: NONE.
  - `ALTER`, `DROP`, `CREATE`, `TRUNCATE`: NONE.
  - `GRANT`, `REVOKE`: NONE.
  - `DO` blocks / dynamic SQL: NONE.
  - Application RPC execution: NONE.
  - Functions called: Only PostgreSQL built-in read-only catalog functions (`version()`, `current_setting()`, `pg_get_functiondef()`, `aclexplode()`, `to_regclass()`).
* **Supabase relevance**: 100% safe to execute as `postgres` or Service Role in Supabase SQL Editor.
* **Is it actually wrong?**: No. Read-only safety is fully verified.
* **Is it intentional?**: Yes, strict requirement.
* **Risk or limitation**: None.
* **Available alternatives**: N/A
* **Best design for this project**: Maintain existing strict read-only execution design.
* **Verdict**: `Keep as-is`
* **Confidence**: High

---

## 10. Overall Script Design

* **Current implementation**: 2-Step Architecture:
  `Catalog Preflight (Part A, C, D) -> Prerequisite Matrix (Part E) -> Schema-Dependent Queries (Part B, F, G) -> Optional Sensitive Definitions (Subsections C.9, C.10, B.4, F.29b)`.
* **Likely reason for this design**: Prevents SQL Editor crashes caused by missing tables or illegal PL/pgSQL DO block returns while keeping the script read-only and section-by-section runnable.
* **PostgreSQL behaviour**: Executing independent `SELECT` statements in Supabase SQL Editor allows subsequent queries to run even if one query fails due to schema drift.
* **Supabase relevance**: Optimal workflow for Supabase SQL Editor without requiring DDL permissions or function creation.
* **Is it actually wrong?**: No. It is the most practical and resilient architecture.
* **Is it intentional?**: Yes, deliberately selected to replace failed V3 DO-block design.
* **Risk or limitation**: Requires human reviewer to check Part E matrix before running schema-dependent queries.
* **Available alternatives**:
  1. DO blocks with `RAISE NOTICE`: Does not return tabular data to SQL Editor grid.
  2. Transactional `BEGIN ... ROLLBACK`: Fails completely on first missing table error.
  3. Creating temporary reporting functions: Modifies database state (`CREATE`), violating read-only rules.
* **Best design for this project**: Retain the 2-step architecture (Catalog Preflight & Matrix -> Prerequisite-guided SELECTs -> Optional Forensic queries).
* **Verdict**: `Keep as-is`
* **Confidence**: High

---

## Summary of Diagnostic Verdicts

| Concern | Subject | Verdict |
|---|---|---|
| **1** | Migration History Output | `Split into safe and forensic queries` |
| **2** | Function Source Output in C.4–C.7 | `Minor improvement` |
| **3** | Unconditional `true` RLS Policy Detection | `Replace implementation` |
| **4** | Roles Array Inspection | `Minor improvement` |
| **5** | Average Score Rounding | `Replace implementation` |
| **6** | Duplicate Mark Entry Output | `Split into safe and forensic queries` |
| **7** | Tenant & Festival Ownership Completeness | `Minor improvement` |
| **8** | Notes and Script Consistency | `Keep with documentation correction` |
| **9** | Read-Only Safety | `Keep as-is` |
| **10** | Overall Script Design | `Keep as-is` |

---

# Correction Plan for V4.1

The following corrections will be applied to produce `database_readonly_verification_v4_1.sql` and `DATABASE_VERIFICATION_SCRIPT_V4_1_NOTES.md`:

### 1. Blocking Correctness
- **F.21 Score Average Rounding**: Change `ROUND(AVG(total_score), 2)` to `ROUND(AVG(total_score)::numeric, 2)` to prevent function missing errors if `total_score` is floating-point.
- **Part E Prerequisite Matrix**: Add `data_type` and `udt_name` column reporting to `information_schema.columns` checks to detect data type schema drift.

### 2. Privacy and Output Safety
- **Part B Migration History**:
  * Add B.2 column inventory check for `supabase_migrations.schema_migrations`.
  * Update B.3 to query safe metadata: `version`, `name` (or fallback), `executed_at`, and `array_length(statements, 1) AS statement_count` (without returning raw SQL text).
  * Move raw `statements` text dump to optional Subsection B.4 with explicit privacy warning.
- **F.29 Duplicate Mark Entries**:
  * Update main F.29 query to a single-row aggregate summary (`total_duplicate_groups`, `max_duplicates_in_group`, `total_excess_duplicate_rows`).
  * Move detailed key triples `(judge_id, schedule_id, registration_id, count)` to optional Subsection F.29b (limited to 50 rows).

### 3. False-Positive Reduction
- **D.2 & D.3 Unconditional True Policy Detection**:
  * Replace broad `LIKE '%true%'` with exact normalized boolean check: `qual = 'true' OR with_check = 'true' OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true' OR TRIM(BOTH '()' FROM TRIM(with_check)) = 'true'`.
- **D.8 Policy Roles Inspection**:
  * Update array matching to type-safe form: `'authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles)`.

### 4. Audit Completeness
- **C.4–C.7 Function Inspection**:
  * Update main Subsections C.4–C.7 to output structured boolean audit flags (`references_2025`, `references_2026`, `references_tenant_id`, `references_festival_id`) instead of raw `prosrc` strings.
- **Part F Ownership Integrity Expansion**:
  * Add F.30: Registrations tenant mismatch with participant tenant.
  * Add F.31: Results festival mismatch with participant/item festival.
  * Add F.32: Schedules item festival mismatch.
  * Add F.33: Participants referencing missing tenant or festival.
  * Add F.34: Active festival count anomalies per tenant.

### 5. Documentation-Only Changes
- Update `DATABASE_VERIFICATION_SCRIPT_V4_1_NOTES.md` to reflect all V4.1 SQL updates, line numbers, subsection labels, and safety categorizations with 100% consistency.
