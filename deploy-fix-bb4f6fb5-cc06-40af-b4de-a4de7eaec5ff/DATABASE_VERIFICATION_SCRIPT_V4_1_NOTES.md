# Database Verification Script V4.1 — Architecture & Change Notes

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Scope**: Complete diagnostic review and refinement of `database_readonly_verification_v4.sql` -> `database_readonly_verification_v4_1.sql`  
**Safety Classification**: Read-only by design and statically reviewed for non-mutating statements.

---

## 1. Executive Summary

`database_readonly_verification_v4_1.sql` is a refined, production-grade, read-only SQL verification script built to establish the actual runtime truth of the connected Supabase PostgreSQL database against repository migrations, static audit findings, and target multi-tenant/multi-festival requirements.

V4.1 builds upon the 2-step architecture introduced in V4, addressing false-positive alerts, data privacy edge cases, float/numeric calculation errors, missing boundary integrity checks, and documentation alignment.

---

## 2. Summary of Diagnostics & V4.1 Improvements

| # | Topic | Diagnostic Findings in V4 | V4.1 Technical Correction | Benefit / Result |
|---|---|---|---|---|
| 1 | **Migration History** | Subsection B.2 dumped raw `statements` text, risking output bloat (megabytes) and leaking legacy seed data. | B.3 outputs safe metadata (`version`, `name`, `executed_at`, `statement_count`). Raw `statements` moved to optional B.5 with privacy warning. | Safe by default; prevents seed data leaks and SQL Editor grid overflow. |
| 2 | **Function Source Inspection** | Subsections C.4–C.7 returned raw `prosrc` text, contradicting documentation claims that main sections return no code definitions. | C.4 outputs structured boolean audit flags (`references_2025`, `references_2026`, `references_tenant_id`, `references_festival_id`). | Concise, privacy-safe audit flags in main section; full bodies retained in optional C.9. |
| 3 | **Unconditional `true` Policies** | Broad `LIKE '%true%'` matched legitimate policies like `is_active = true`, causing high false-positive rates. | Replaced with exact normalized string match: `qual = 'true' OR with_check = 'true' OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true'`. | Zero false positives on legitimate `is_active = true` production policies. |
| 4 | **Policy Roles Inspection** | Array containment `roles @> ARRAY['authenticated']` relied on implicit array coercion. | Updated to explicit, type-safe matching: `'authenticated'::name = ANY(roles) OR 'public'::name = ANY(roles)`. | Strict type safety for `name[]` array columns in PostgreSQL 15+. |
| 5 | **Score Average Rounding** | `ROUND(AVG(total_score), 2)` fails with a fatal PostgreSQL error if `total_score` is defined as `double precision` or `real`. | Updated to `ROUND(AVG(total_score)::numeric, 2)`. Added `data_type` reporting to Part E matrix. | Resilient against data type schema drift; safe across all numeric/float types. |
| 6 | **Duplicate Mark Entry Output** | F.29 returned raw `(judge_id, schedule_id, registration_id)` key triples, violating summary-only documentation rules. | Main F.29 updated to a single-row aggregate summary. Detailed key triples moved to optional F.35 (limited to 50 rows). | Summary-only by default; diagnostic key triples available for optional remediation. |
| 7 | **Ownership & Boundary Integrity** | Missing aggregate boundary integrity checks for cross-tenant and cross-festival data corruption. | Added Subsections F.30–F.34 checking registration/participant tenant mismatches, result/festival mismatches, and active festival anomalies. | Immediate automated detection of multi-tenant and multi-festival boundary breaches. |
| 8 | **Documentation Alignment** | Notes contained minor section label mismatches and privacy claim discrepancies with the SQL. | Updated `DATABASE_VERIFICATION_SCRIPT_V4_1_NOTES.md` to perfectly match `database_readonly_verification_v4_1.sql` 100%. | Complete consistency between documentation and executed SQL. |

---

## 3. Section Safety & Run Instructions

`database_readonly_verification_v4_1.sql` is organized into 8 distinct parts with clear safety and privacy boundaries:

```text
Part A: Universal Catalog Preflight  [Universally Safe - Always Run]
Part B: Migration History            [B.1-B.4 Safe Metadata | B.5 Optional Forensic Raw SQL]
Part C: Function & Grant Inspection  [C.1-C.8 Safe Metadata & Flags | C.9-C.10 Optional Definitions]
Part D: P0 RLS Verification          [Universally Safe Catalog Queries - Always Run]
Part E: Prerequisite Matrix          [Universally Safe Catalog Matrix with Data Types - Always Run]
Part F: Core Data & Boundary Checks  [F.1-F.34 Safe Summary Counts | F.35 Optional Detailed Duplicates]
Part G: Optional Modules             [G.1-G.16 Schema-Dependent Module Summaries]
Part H: Verification Complete        [Universally Safe Catalog Summary - Always Run]
```

### Categorization & Execution Table

| Section | Safety Classification | Required Prerequisite | Output Type |
|---|---|---|---|
| **PART A** | **Universally Safe** | Run Always | Preflight catalog counts, RLS status, column/index/trigger inventories. |
| **PART B (B.1–B.4)** | **Safe Metadata** | Run B.2-B.4 if B.1 = `true` | Migration table existence, column inventory, safe migration metadata (NO raw SQL text). |
| **PART B (B.5)** | **Optional / Forensic** | Run with Caution | Outputs raw DDL/DML migration statements text. Review for seed secrets before sharing. |
| **PART C (C.1–C.8)** | **Safe Metadata & Flags** | Run Always | Function attributes, SECURITY DEFINER audit, `aclexplode` grants, structured security flags. |
| **PART C (C.9–C.10)** | **Optional / Shielded** | Run with Caution | Full function definitions (`pg_get_functiondef`) and view definitions. Review output before sharing. |
| **PART D** | **Universally Safe** | Run Always | Exact normalized P0 RLS policy audit (`USING (true)`, `mark_entries`, `judge_tokens`, `system_api_keys`). |
| **PART E** | **Universally Safe** | Run Always | Evaluates `information_schema` to produce a table, column, and data-type matrix for Part F & G. |
| **PART F (F.1–F.34)** | **Schema-Dependent Summary** | Check Part E Matrix First | Single-row aggregate counts for tenant/festival distributions, profiles, scores, and boundary mismatches. |
| **PART F (F.35)** | **Optional / Diagnostic** | Run for Remediation | Top 50 duplicate mark entry key triples `(judge_id, schedule_id, registration_id, count)`. |
| **PART G (G.1–G.16)** | **Schema-Dependent Summary** | Check Part E Matrix First | Module aggregate counts (`system_api_keys`, `file_metadata`, `notifications`, `Poster Studio`). |
| **PART H** | **Universally Safe** | Run Always | Final public schema summary counts (tables, policies, functions, views). |

---

## 4. Technical Explanation of V4.1 PostgreSQL Inspection Logic

### 1. Function Privileges & `PUBLIC` ACL Explosion (Subsection C.3)
PostgreSQL functions grant `EXECUTE` to `PUBLIC` by default unless explicitly revoked. `PUBLIC` is a pseudo-role (`grantee = 0` in ACLs). V4.1 uses:
```sql
EXISTS (
  SELECT 1
  FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
  WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE'
) AS public_has_explicit_or_default_grant
```
This accurately inspects function privileges without relying on invalid `pg_roles` joins.

### 2. Exact Boolean `TRUE` Policy Inspection (Subsections D.2, D.3, D.8)
PostgreSQL deparses `USING (true)` as the literal string `'true'`. Broad `LIKE '%true%'` matching causes false positives on policies containing `is_active = true`. V4.1 uses exact normalized matching:
```sql
qual = 'true' OR with_check = 'true'
OR TRIM(BOTH '()' FROM TRIM(qual)) = 'true'
OR TRIM(BOTH '()' FROM TRIM(with_check)) = 'true'
```
This eliminates false positives on legitimate boolean column checks.

### 3. Type-Safe Score Rounding (Subsection F.21)
In PostgreSQL, `ROUND(double precision, integer)` does not exist. If `results.total_score` is float/double precision, `ROUND(AVG(total_score), 2)` crashes. V4.1 uses:
```sql
ROUND(AVG(total_score)::numeric, 2) AS avg_score
```
This guarantees execution across all numeric and floating-point schema definitions.

---

## 5. Schema-Drift Recognition & Data Privacy Guidelines

### Recognizing Schema Drift
When running schema-dependent queries in Part F or Part G:
- `ERROR: relation "public.table_name" does not exist` -> Indicates a missing migration.
- `ERROR: column "column_name" does not exist` -> Indicates a missing column migration.
Record these errors in the Phase 5 Runtime Verification Report under `Runtime Disproved` or `Schema Drift`.

### Data Privacy Rules
Main Sections (Parts A through H) return **counts, boolean flags, catalog names, and aggregate numbers**. V4.1 **NEVER** returns:
- Participant names, emails, phone numbers, or addresses
- User passwords or auth tokens
- Raw judge tokens or session keys
- Raw API key values
- Signed R2 URLs

If you execute Optional Subsections B.5, C.9, C.10, or F.35, review and redact the output for secrets or internal credentials before attaching to tickets or public documentation.

---

## 6. What Cannot Be Verified Automatically Via SQL

1. **Supabase Auth Platform Configuration**: Password min length, SMTP credentials, OAuth providers, and JWT expiry settings.
2. **Hard-coded Migration Passwords**: Password rotation status for accounts created in initial SQL scripts. (Must be verified/rotated in Supabase Dashboard -> Auth -> Users).
3. **Edge Function Environment Variables**: `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` configured in Edge Function runtimes.
4. **Cloudflare R2 Bucket Configuration**: CORS rules, lifecycle policies, and public access settings.
5. **Frontend Application Environment**: `EXPO_PUBLIC_BACKEND_PROVIDER` settings in build scripts.

---

## 7. Next Steps for the Human Reviewer

1. **Static Review of V4.1**: Verify `database_readonly_verification_v4_1.sql` for PostgreSQL syntax, catalog accuracy, and read-only safety.
2. **Execute Universal Catalog Sections**: Run Part A, Part C (C.1–C.8), Part D, and Part E in Supabase SQL Editor.
3. **Inspect Prerequisite Matrix**: Check the Part E output table to see which tables have `verification_status = 'READY FOR DATA CHECKS'` and inspect reported `existing_columns_with_types`.
4. **Execute Schema-Dependent Data Checks**: Run the corresponding queries in Part B (B.1–B.4), Part F (F.1–F.34), and Part G.
5. **Compile Phase 5 Runtime Report**: Save tabular results and classify all static audit findings into *Runtime Confirmed*, *Runtime Disproved*, *Still Unverified*, or *Permission Prevented Verification*.
