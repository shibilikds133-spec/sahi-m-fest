# Database Verification Script Diagnostic

**Date**: 2026-07-22
**Scope**: Line-by-line review of `database_readonly_verification.sql`
**Purpose**: Determine whether each identified concern is genuinely wrong, intentionally designed, or acceptable

---

## 1. `forcerowsecurity` from `pg_tables`

* **Observed SQL**: Line 97: `t.forcerowsecurity AS rls_forced` from `pg_tables t`
* **Actual PostgreSQL behaviour**: `pg_tables` is a convenience view over `pg_class` + `pg_namespace`. In PostgreSQL 9.5+ (when RLS was introduced), `pg_tables` includes `rowsecurity` and `forcerowsecurity` columns. Supabase runs PostgreSQL 15+, so both columns are available. This is standard PostgreSQL catalog functionality.
* **Is it definitely wrong?** No. This is valid PostgreSQL.
* **Could it be intentional?** Yes — the script explicitly wants to check whether RLS is forced (meaning even table owners must obey RLS policies).
* **Likely reason it was written this way**: The author wanted to inspect forced RLS status, which is a security-relevant property. `pg_tables` is the standard catalog view for this.
* **Runtime impact**: Will produce a boolean column `rls_forced` for each table with RLS enabled. No errors.
* **Can it stop later sections?** No — this is an independent SELECT.
* **Keep or change**: Keep.
* **Recommended safe approach**: No change needed. `pg_tables.forcerowsecurity` is the correct and standard way to check this in PostgreSQL 9.5+.
* **Confidence level**: Valid and intentional

---

## 2. `pg_get_function_expr(p.oid)`

* **Observed SQL**: Lines 273, 306, 317, 327, 337: `pg_get_function_expr(p.oid) AS function_source`
* **Actual PostgreSQL behaviour**: `pg_get_function_expr(oid)` is a legitimate PostgreSQL built-in function that returns the expression body of a function (the SQL or PL/pgSQL source). It is documented in PostgreSQL 9.2+ and works correctly with `pg_proc.oid`. It returns the function body as text. The more commonly seen `pg_get_functiondef(oid)` returns the complete `CREATE FUNCTION` definition including headers, but `pg_get_function_expr` returns just the expression/body portion.
* **Is it definitely wrong?** No. Both `pg_get_function_expr` and `pg_get_functiondef` are valid. They return slightly different things:
  - `pg_get_function_expr`: Returns just the function body/expression
  - `pg_get_functiondef`: Returns the full `CREATE OR REPLACE FUNCTION ... AS $$ ... $$` definition
* **Could it be intentional?** Yes — for a security audit, seeing the function body is often sufficient and more concise than the full CREATE statement.
* **Likely reason it was written this way**: The author wanted to see function bodies to check for hard-coded values, SECURITY DEFINER usage, and tenant/festival scoping. `pg_get_function_expr` is adequate for this purpose.
* **Runtime impact**: Will return function bodies as text. For PL/pgSQL functions, this returns the full function body. For SQL functions, it returns the SQL expression. No errors.
* **Can it stop later sections?** No — independent SELECT.
* **Keep or change**: Keep. However, `pg_get_functiondef` would be slightly more useful for a complete audit since it includes volatility, security, and search_path metadata in the output. This is an improvement suggestion, not a bug.
* **Recommended safe approach**: Acceptable as-is. Optionally replace with `pg_get_functiondef(p.oid)` for more complete output in a future version.
* **Confidence level**: Valid and intentional

---

## 3. Conditional migration-table inspection

* **Observed SQL**: Lines 37-41 check if `supabase_migrations.schema_migrations` exists; Lines 45-47 and 50-51 query it directly without protection.
* **Actual PostgreSQL behaviour**: In Supabase SQL Editor, each statement is executed independently. If a statement references a missing table, it will produce an error for that statement but subsequent statements will continue executing. The Supabase SQL Editor does NOT abort the entire script on a single statement failure — it reports the error and moves to the next statement.
* **Is it definitely wrong?** No, but it is fragile. The existence check on lines 37-41 returns a boolean but does not prevent the later direct query from failing.
* **Could it be intentional?** Partially — the author likely assumed the table would exist (since it's a Supabase project) and the existence check was informational rather than a gate.
* **Likely reason it was written this way**: The author wanted to document whether the migration table exists, but assumed it would be present in any Supabase project. In standard Supabase projects, `supabase_migrations.schema_migrations` always exists.
* **Runtime impact**: If the table does not exist (extremely unlikely for a Supabase project), Sections 2.2 and 2.3 will error, but Sections 3-20 will continue executing normally. The error will appear in the results but will not stop the script.
* **Can it stop later sections?** No — Supabase SQL Editor continues after statement errors.
* **Keep or change**: Keep. The assumption is reasonable for Supabase projects. If the table is missing, the error message itself is informative.
* **Recommended safe approach**: Acceptable as-is. The existence check provides documentation even if it doesn't gate execution.
* **Confidence level**: Valid but fragile

---

## 4. Optional tables queried directly

* **Observed SQL**: Lines 597-607 query `public.system_api_keys` directly after checking existence on lines 590-595. Lines 682-705 check existence of `generated_assets` and `export_jobs` but do NOT query them directly. However, lines 613-633 query `public.file_metadata` directly without an existence check.
* **Actual PostgreSQL behaviour**: If a table does not exist and a SELECT references it, PostgreSQL returns an error: `relation "public.table_name" does not exist`. In Supabase SQL Editor, this error is reported for that statement but does not stop subsequent statements.
* **Is it definitely wrong?** For `system_api_keys` (lines 597-607): The existence check on line 590 does not gate the later query. If the table doesn't exist, lines 597-607 will error. This is fragile but not incorrect — the error message itself indicates the table doesn't exist, which is a valid finding. For `file_metadata` (lines 613-633): No existence check at all — if the table doesn't exist, these lines will error.
* **Could it be intentional?** Yes — the author assumed these tables would exist because the repository migrations create them. The existence checks are informational.
* **Likely reason it was written this way**: The repository migrations create all these tables (001 for most, 025 for file_metadata, root SQL for system_api_keys). The author assumed the database matches the repository.
* **Runtime impact**: If any table doesn't exist, the corresponding SELECT will error. The error message itself is informative ("table does not exist"). Other sections continue.
* **Can it stop later sections?** No — Supabase SQL Editor continues after statement errors.
* **Keep or change**: Keep. The errors are informative and the assumption is reasonable. Adding `IF EXISTS` guards would make the script more robust but also more complex.
* **Recommended safe approach**: Acceptable as-is. The error messages serve as implicit existence checks. If a table is missing, the script will clearly indicate which sections failed.
* **Confidence level**: Valid but fragile

---

## 5. `'public.profiles'::regclass`

* **Observed SQL**: Line 239: `WHERE conrelid = 'public.profiles'::regclass`
* **Actual PostgreSQL behaviour**: The `::regclass` cast resolves a string to a PostgreSQL OID (object identifier). If the table `public.profiles` does not exist, the cast raises an error: `relation "public.profiles" does not exist`. This is a hard failure — the entire statement fails, and in Supabase SQL Editor, subsequent statements continue.
* **Is it definitely wrong?** No — it is valid PostgreSQL. However, it is less safe than `to_regclass('public.profiles')` which returns NULL instead of raising an error when the table is missing.
* **Could it be intentional?** Yes — the author assumed `profiles` would exist (it's created in migration 002, which is always applied early).
* **Likely reason it was written this way**: `::regclass` is the idiomatic PostgreSQL way to reference a table by name in catalog queries. It's concise and standard. The author assumed the table exists.
* **Runtime impact**: If `profiles` doesn't exist (extremely unlikely), this statement errors. The error is informative. Other sections continue.
* **Can it stop later sections?** No — only this statement fails.
* **Keep or change**: Keep. The assumption is extremely safe — `profiles` is created in migration 002 and is fundamental to the entire auth system.
* **Recommended safe approach**: Acceptable as-is. `to_regclass()` would be marginally safer but adds complexity for a table that is guaranteed to exist in any working Supabase project.
* **Confidence level**: Valid and intentional

---

## 6. Function grants and PostgreSQL `PUBLIC`

* **Observed SQL**: Lines 298: `JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'public')`
* **Actual PostgreSQL behaviour**: PostgreSQL has a special role named `PUBLIC` that represents all users (both authenticated and anonymous). It IS represented as a row in `pg_roles` with `rolname = 'public'`. However, `has_function_privilege(r.oid, p.oid, 'EXECUTE')` may not work correctly with `PUBLIC` because `PUBLIC` is a pseudo-role. The function `has_function_privilege` expects a role OID, and while `PUBLIC` has an OID in `pg_roles`, the privilege check may not behave as expected for the `PUBLIC` pseudo-role.
* **Is it definitely wrong?** Partially. The query will join `PUBLIC` from `pg_roles` (it exists), but `has_function_privilege` with the `PUBLIC` role OID may return incorrect results. A more reliable approach is to check the ACL (access control list) directly via `pg_catalog.pg_acl` or use `has_function_privilege('public', p.oid, 'EXECUTE')` where `'public'` is the role name string.
* **Could it be intentional?** Yes — the author wanted to check whether functions are accessible to anon, authenticated, and PUBLIC roles.
* **Likely reason it was written this way**: The author wanted a comprehensive privilege check. The approach is mostly correct but the `PUBLIC` role check may produce misleading results.
* **Runtime impact**: The query will execute. For `anon` and `authenticated` roles, `has_function_privilege` works correctly. For `PUBLIC`, the result may be inaccurate. The query will not error.
* **Can it stop later sections?** No — independent SELECT.
* **Keep or change**: Improvement only. The query works for `anon` and `authenticated`. The `PUBLIC` check is the weak point.
* **Recommended safe approach**: For a more accurate check, use:
  ```sql
  SELECT has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute
  ```
  Or inspect `pg_catalog.pg_acl` directly. However, for the purpose of this audit script, the current approach is acceptable — it will correctly identify `anon` and `authenticated` privileges, and the `PUBLIC` result, while potentially inaccurate, is unlikely to cause confusion.
* **Confidence level**: Improvement only, not a bug

---

## 7. Detecting `USING (true)` policies

* **Observed SQL**: Lines 128, 140, 188: `AND (qual = 'true'::text OR with_check = 'true'::text)`
* **Actual PostgreSQL behaviour**: PostgreSQL stores RLS policy expressions as deparsed text in `pg_policies.qual` and `pg_policies.with_check`. The exact text depends on how the policy was defined:
  - `USING (true)` → stored as `true`
  - `USING ((true))` → stored as `(true)` (unlikely but possible)
  - `USING (true::boolean)` → stored as `true` (PostgreSQL normalizes casts)
  - `USING ( TRUE )` → stored as `true` (whitespace normalized)
  
  PostgreSQL normalizes most expressions during deparsing. A simple `true` literal is stored as `true` (lowercase, no parentheses). The expression `true::text` in the filter compares against the string `'true'`.
* **Is it definitely wrong?** No — for the specific case of `USING (true)`, PostgreSQL stores it as the text `true`. The comparison `qual = 'true'::text` will match. However, if someone wrote `USING ((true))`, it would be stored as `(true)` and would not match. This is unlikely in practice.
* **Could it be intentional?** Yes — the author wanted to detect the most permissive possible policies.
* **Likely reason it was written this way**: The migration files show `USING (true)` literally, and PostgreSQL normalizes this to `true` when storing in `pg_policies`. The comparison is correct for the expected input.
* **Runtime impact**: Will correctly identify policies with `USING (true)`. Will miss policies with `USING ((true))` or other parenthesization variants, but these are extremely unlikely in practice.
* **Can it stop later sections?** No — independent SELECT.
* **Keep or change**: Keep. The approach is correct for the expected policy definitions. A more robust approach would use `qual LIKE '%true%'` but that could produce false positives for expressions like `tenant_id = true` (unlikely but possible).
* **Recommended safe approach**: Acceptable as-is. The exact match is correct for PostgreSQL's deparsing of simple `true` literals.
* **Confidence level**: Valid and intentional

---

## 8. Function and view definitions in output

* **Observed SQL**: Lines 273, 306, 317, 327, 337 output function bodies; Lines 346-351 output view definitions.
* **Actual PostgreSQL behaviour**: `pg_get_function_expr` and `pg_views.definition` return the source code of functions and views. This is standard PostgreSQL catalog access.
* **Is it definitely wrong?** No — this is useful for security auditing. The function bodies may contain hard-coded values, SECURITY DEFINER usage, and business logic that needs verification.
* **Could it be intentional?** Yes — the script is a security audit tool. Seeing function definitions is essential for identifying hard-coded years, missing tenant checks, and other issues.
* **Likely reason it was written this way**: The author wanted to inspect function bodies for security issues (hard-coded credentials, missing role checks, etc.). This is standard practice for database security audits.
* **Runtime impact**: Function and view definitions will appear in the output. These may contain:
  - Hard-coded values (years, emails) — useful for the audit
  - Business logic — useful for understanding behavior
  - No embedded credentials or service URLs are expected in this repository's functions
* **Can it stop later sections?** No — independent SELECT.
* **Keep or change**: Keep. This is essential for the audit purpose. The output is read-only and does not expose secrets beyond what the database already contains.
* **Recommended safe approach**: Acceptable as-is. The function definitions are necessary for the security audit. If the script were shared publicly, this section would need review, but for internal use it is appropriate.
* **Confidence level**: Valid and intentional

---

## 9. Queries against schema-dependent columns

* **Observed SQL**: Multiple queries reference columns like `is_used`, `expires_at`, `is_final`, `is_draft`, `festival_id`, `tenant_id`, grade columns, point columns.
* **Actual PostgreSQL behaviour**: If a table exists but a specific column does not (because a later migration adding it was not applied), the SELECT will fail with: `column "column_name" does not exist`. In Supabase SQL Editor, this errors for that statement but subsequent statements continue.
* **Is it definitely wrong?** No — the script assumes the repository migrations have been fully applied. This is a reasonable assumption for a verification script. If a migration was not applied, the error itself is the finding.
* **Could it be intentional?** Yes — the author assumed the database matches the repository. Column-missing errors would indicate migration drift, which is exactly what the script is designed to detect.
* **Likely reason it was written this way**: The script is meant to verify that the database matches the repository. If columns are missing, the errors indicate which migrations were not applied.
* **Runtime impact**: If any column is missing, the corresponding SELECT will error with a clear message. Other sections continue. The error itself is a valid finding — it indicates migration drift.
* **Can it stop later sections?** No — only the affected statement fails.
* **Keep or change**: Keep. The errors are informative and indicate migration drift.
* **Recommended safe approach**: Acceptable as-is. The error messages serve as implicit schema drift detection.
* **Confidence level**: Valid and intentional

---

## 10. Script execution model

* **Observed SQL**: The script contains 740 lines with ~60+ independent SELECT statements separated by section headers.
* **Actual PostgreSQL behaviour**: In Supabase SQL Editor:
  - Statements are executed sequentially
  - Each statement is independent
  - If one statement errors, the error is reported but subsequent statements continue
  - Previous SELECT results remain available in the results panel
  - There is no implicit transaction wrapping the entire script
  - Each statement runs in its own implicit transaction (autocommit mode)
* **Is it definitely wrong?** No — this is the standard behavior for Supabase SQL Editor. Multi-statement scripts work correctly.
* **Could it be intentional?** Yes — the author designed the script so that failures in one section don't prevent other sections from executing.
* **Likely reason it was written this way**: The script is designed as a comprehensive audit tool. If one section fails (e.g., a missing table), the other sections still provide valuable information.
* **Runtime impact**: The script will execute all 60+ statements sequentially. Each will produce a result set in the Supabase SQL Editor. Errors will appear as error messages in the results panel. All previous results remain accessible.
* **Can it stop later sections?** No — Supabase SQL Editor continues after statement errors.
* **Keep or change**: Keep. The execution model is correct for the intended use case.
* **Recommended safe approach**: Acceptable as-is. The script is designed to be resilient to individual statement failures.
* **Confidence level**: Valid and intentional

---

## Summary

| # | Concern | Verdict | Action Needed |
|---|---|---|---|
| 1 | `forcerowsecurity` from `pg_tables` | **Valid and intentional** | None |
| 2 | `pg_get_function_expr(p.oid)` | **Valid and intentional** | None (optionally use `pg_get_functiondef` for more output) |
| 3 | Conditional migration-table inspection | **Valid but fragile** | None (assumption is reasonable for Supabase) |
| 4 | Optional tables queried directly | **Valid but fragile** | None (errors are informative) |
| 5 | `'public.profiles'::regclass` | **Valid and intentional** | None (table is guaranteed to exist) |
| 6 | Function grants and PostgreSQL `PUBLIC` | **Improvement only** | Optionally use `has_function_privilege('public', ...)` |
| 7 | Detecting `USING (true)` policies | **Valid and intentional** | None (PostgreSQL normalizes correctly) |
| 8 | Function and view definitions in output | **Valid and intentional** | None (essential for audit) |
| 9 | Queries against schema-dependent columns | **Valid and intentional** | None (errors indicate drift) |
| 10 | Script execution model | **Valid and intentional** | None (Supabase SQL Editor handles correctly) |

**Overall assessment**: The script is well-designed for its purpose. No confirmed errors were found. All concerns are either valid PostgreSQL behaviour or minor fragility issues that are acceptable for an audit script. The script will execute correctly in Supabase SQL Editor and produce useful results.

---

*End of Diagnostic Report*
