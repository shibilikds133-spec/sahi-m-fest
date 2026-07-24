# Database Verification Script V4 — Architecture & Change Notes

**Date**: 2026-07-23  
**Target Repository**: Festival Management Platform (`web-for-sahi--main`)  
**Scope**: Complete review and redesign of `database_readonly_verification_v3.sql` -> `database_readonly_verification_v4.sql`  
**Safety Classification**: Read-only by design and statically reviewed for non-mutating statements.

---

## 1. Executive Summary

`database_readonly_verification_v4.sql` is a corrected, production-grade, read-only SQL verification script designed to establish the actual runtime truth of the connected Supabase PostgreSQL database against repository migrations, static audit findings, and target architecture requirements.

Unlike previous versions, V4 eliminates invalid PostgreSQL catalog references, illegal PL/pgSQL constructs, fake automatic conditional execution, and unshielded secret exposure risks.

It provides a transparent, section-by-section audit workflow structured into Parts A through H.

---

## 2. Analysis of V3 Defects and V4 Corrections

| # | V3 Defect | Technical Root Cause in PostgreSQL | V4 Correction Applied |
|---|---|---|---|
| 1 | **Anonymous `DO` Blocks with `RETURN QUERY EXECUTE`** | In PostgreSQL, anonymous `DO` blocks execute code with a `void` return type. Using `RETURN QUERY` or `RETURN QUERY EXECUTE` inside a `DO` block is illegal and throws `ERROR: cannot use RETURN QUERY in a DO block`, immediately aborting execution in Supabase SQL Editor. | Completely removed all `RETURN QUERY EXECUTE` calls from `DO` blocks. Replaced with transparent, plain `SELECT` queries preceded by explicit prerequisite comments based on Part E matrix. |
| 2 | **Reference to `pg_catalog.pg_acl`** | PostgreSQL catalog does not contain a relation or view named `pg_acl`. Attempting to query `pg_catalog.pg_acl` throws `ERROR: relation "pg_catalog.pg_acl" does not exist`. | Replaced with built-in PostgreSQL ACL inspection functions: `aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner)))` filtering for `grantee = 0` (PUBLIC pseudo-role) and `privilege_type = 'EXECUTE'`. |
| 3 | **Misleading `PUBLIC` Privilege Checks** | Joining `pg_roles` expecting a row for `PUBLIC` produces incorrect privilege results because `PUBLIC` is a special pseudo-role, not a normal role entry in `pg_roles`. | Combined `has_function_privilege('anon', ...)` and `has_function_privilege('authenticated', ...)` with `aclexplode(...)` to accurately distinguish explicit grants, inherited grants, and default PUBLIC function grants. |
| 4 | **Fake Conditional Execution Claims** | V3 claimed to dynamically execute and return queries inside `DO` blocks when tables existed. However, dynamic queries inside `DO` blocks do not return tabular result sets to the Supabase SQL Editor grid. | Abandoned fake conditional `DO` block returns in favor of a 2-step audit model: Part E generates a pure catalog Prerequisite Matrix, and subsequent schema-dependent queries are executed based on matrix results. |
| 5 | **Unshielded Secret Exposure Risk** | V3 outputted full function definitions (`pg_get_functiondef`) and view definitions directly in main sections without warning the user that runtime definitions might contain embedded secrets or business logic. | Provided targeted, safe metadata queries in main sections (C.1-C.8) and isolated full definitions into an explicit OPTIONAL subsection (C.9-C.10) with prominent WARNING headers. |

---

## 3. Section Safety & Run Instructions

The V4 script is structured into 8 distinct parts:

```text
Part A: Universal Catalog Preflight  [Universally Safe]
Part B: Migration History            [B.1 Safe | B.2/B.3 Conditional on B.1]
Part C: Function & Grant Inspection  [C.1-C.8 Safe Metadata | C.9-C.10 Optional Definitions]
Part D: P0 RLS Verification          [Universally Safe Catalog Queries]
Part E: Prerequisite Matrix          [Universally Safe Pure Catalog Query]
Part F: Core Data Checks             [Schema-Dependent: Check Part E First]
Part G: Optional Modules             [Schema-Dependent: Check Part E First]
Part H: Verification Complete        [Universally Safe Catalog Summary]
```

### Categorization Table

| Section | Safety Classification | Execution Requirement | Notes |
|---|---|---|---|
| **PART A** | **Universally Safe** | Run Always | Queries `pg_class`, `pg_namespace`, `pg_tables`, `information_schema`. Never fails on any working PostgreSQL database. |
| **PART B (B.1)** | **Universally Safe** | Run Always | Checks existence of `supabase_migrations.schema_migrations`. |
| **PART B (B.2, B.3)** | **Conditional** | Run ONLY if B.1 = `true` | Queries `supabase_migrations.schema_migrations`. |
| **PART C (C.1-C.8)** | **Universally Safe** | Run Always | Inspects function metadata, volatility, `SECURITY DEFINER` status, helper functions, and ACL grants. Returns NO code definitions. |
| **PART C (C.9-C.10)** | **Optional / Shielded** | Run with Caution | Outputs full function and view definitions. Review output for secrets before sharing. |
| **PART D** | **Universally Safe** | Run Always | Queries `pg_policies` catalog for P0 RLS bypasses, permissive `USING (true)`, and invalid role references. |
| **PART E** | **Universally Safe** | Run Always | Evaluates `information_schema` to produce a table/column prerequisite matrix for Part F and Part G. |
| **PART F** | **Schema-Dependent** | Check Part E Matrix First | Aggregate queries on core application tables (`participants`, `organisations`, `results`, `mark_entries`, `judge_tokens`). Returns counts and distributions only. |
| **PART G** | **Schema-Dependent** | Check Part E Matrix First | Aggregate queries on optional modules (`system_api_keys`, `file_metadata`, `notifications`, `Poster Studio`). |
| **PART H** | **Universally Safe** | Run Always | Catalog summary counts for tables, policies, functions, and views. |

---

## 4. Technical Explanation of PostgreSQL Privilege Inspection in V4

In PostgreSQL:
1. Functions are created with default `EXECUTE` privileges granted to `PUBLIC` unless explicitly revoked.
2. `PUBLIC` is an implicit pseudo-role (`grantee = 0` in ACL structures), not a standard row in `pg_roles`.
3. If `proacl` in `pg_proc` is `NULL`, default ACL applies (`acldefault('f', p.proowner)`).
4. `aclexplode()` expands the `aclitem[]` array into tuples: `(grantor, grantee, privilege_type, is_grantable)`.

V4 uses this PostgreSQL catalog logic:
```sql
EXISTS (
  SELECT 1
  FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) x
  WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE'
) AS public_has_explicit_or_default_grant
```
This accurately reports whether `PUBLIC` has `EXECUTE` privileges without depending on `pg_roles` joins or non-existent catalog views like `pg_acl`.

---

## 5. Schema-Drift Recognition & Data Privacy Guidelines

### How to Recognize Schema-Drift Errors
When executing schema-dependent queries in Part F or Part G:
- **Missing Table Error**: `ERROR: relation "public.table_name" does not exist`
  * Meaning: The migration creating `table_name` was never applied to the runtime database.
- **Missing Column Error**: `ERROR: column "column_name" does not exist`
  * Meaning: An incremental migration adding `column_name` was skipped or failed during deployment.

These errors are not script defects—they are empirical evidence of schema drift. Record each error in the Phase 5 Runtime Verification Report under `Runtime Disproved` or `Schema Drift`.

### Data Privacy Guidelines
- Parts A through G return counts, boolean flags, catalog names, and aggregate numbers.
- V4 **NEVER** outputs:
  * Participant names, emails, phone numbers, addresses
  * User passwords, password hashes, or auth secrets
  * Raw judge tokens or active session keys
  * Raw API keys or encrypted credentials
  * Signed R2 URLs or temporary access tokens
- If you execute Optional Subsection C.9 or C.10 (Full Definitions), inspect the text output for embedded secrets, internal webhook URLs, or hard-coded credentials before attaching the log to any public ticket or repository documentation.

---

## 6. Limitations: What Cannot Be Verified Automatically Via SQL

A database SQL verification script cannot verify items outside the PostgreSQL catalog and accessible tables. The following must be verified manually:

1. **Supabase Auth Configuration**: Password min length, SMTP server settings, OAuth providers, and JWT expiry settings stored in Supabase platform configuration.
2. **Hard-coded Super-Admin Credentials**: Password rotation status for accounts created in migration files. (Must be verified and updated in Supabase Dashboard -> Auth -> Users).
3. **Edge Functions & Environment Variables**: Environment variables (`SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) configured in Edge Function runtimes.
4. **Cloudflare R2 Bucket Settings**: CORS rules, bucket permissions, lifecycle policies, and public access settings.
5. **Frontend Environment Configuration**: `EXPO_PUBLIC_BACKEND_PROVIDER` and API endpoint URLs in Expo client builds.

---

## 7. Instructions for Saving SQL Output for Phase 5 Report

When running V4 in Supabase SQL Editor:
1. Run Part A, Part C (C.1-C.8), Part D, and Part E first.
2. Click **Export CSV** or copy the tabular output from each section.
3. Check Part E (Prerequisite Matrix) to see which tables have `verification_status = 'READY FOR DATA CHECKS'`.
4. Run the corresponding queries in Part F and Part G.
5. Save all section outputs into a directory or document titled `runtime_verification_logs_2026-07-23`.
6. Use the collected output to compile the **Phase 5 Runtime Verification Report** classifying every static audit finding into:
   - `Runtime Confirmed`
   - `Runtime Disproved`
   - `Still Unverified`
   - `Permission Prevented Verification`

---

## 8. Next Steps for the Human Reviewer

1. **Static Review of V4**: Verify `database_readonly_verification_v4.sql` for PostgreSQL syntax, read-only safety, and catalog accuracy.
2. **Execute Catalog & Preflight Sections**: Run Part A, Part C (C.1-C.8), Part D, and Part E in Supabase SQL Editor.
3. **Review Prerequisite Matrix**: Inspect the Part E matrix output to confirm which tables/columns exist in the target database.
4. **Execute Core & Optional Data Checks**: Run the Part F and Part G queries whose prerequisites are satisfied in Part E.
5. **Compile Runtime Verification Report**: Record the runtime truth and proceed to Stage 2 (Human Architecture Decisions) and Stage 3 (Batch 1 Corrective Security Migrations).
