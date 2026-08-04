# Resolve Festival Template Permission Fix Report

## 1. Executive Summary

The `42501 permission denied for function resolve_festival_template` failure is caused by trigger validators running as SECURITY INVOKER while their internal resolver is intentionally execute-revoked from authenticated clients. Migration 107 applies the least-privilege correction: only the three fixed-table outer trigger validators become SECURITY DEFINER with a fixed search path and controlled owner. All helpers and validators remain non-callable by PUBLIC, anon, and authenticated. Migration 107 was subsequently applied to production with explicit user approval.

## 2. Exact Failing Operation

The reported participant/College category failure is a participant INSERT (and would also affect a participant UPDATE that fires `trg_validate_participant_category`). A plain `festival_categories` SELECT does not call the resolver. The same permission defect is latent in College item INSERT/UPDATE and registration INSERT/UPDATE.

## 3. Function Call Chain

Participant: authenticated PostgREST INSERT → `participants` → `trg_validate_participant_category` → `validate_participant_category()` (SECURITY INVOKER before 107) → `resolve_festival_template(uuid)` → 42501.

Item: authenticated write → `trg_validate_item_categories_for_template` → invoker validator → execute-revoked resolver.

Registration: authenticated write → `trg_validate_registration_category_compatibility` → invoker validator → `resolve_festival_template`, `resolve_participant_category`, and `resolve_item_categories`, all execute-revoked.

## 4. Effective Function Metadata

- `public.resolve_festival_template(p_festival_id uuid) RETURNS text`: STABLE, SECURITY DEFINER, fixed `public, pg_temp` search path from migration 103; direct client execution revoked.
- `public.resolve_participant_category(p_participant_id uuid) RETURNS text`: STABLE, SECURITY DEFINER, fixed search path; direct execution revoked.
- `public.resolve_item_categories(p_item_id uuid) RETURNS text[]`: STABLE, SECURITY DEFINER, fixed search path; direct execution revoked.
- The three outer zero-argument trigger functions were SECURITY INVOKER before migration 107.

Repository search found no frontend `.rpc('resolve_festival_template', ...)` or other direct client use. The resolver is internal-only and is not used by RLS policies, constraints, or generated columns.

## 5. Existing Grants

Migration 103 revokes resolver execution from PUBLIC, anon, and authenticated. Migrations 103/104/106 revoke direct execution of the trigger functions and related resolvers. Migration 107 preserves and reasserts all exact revokes. It contains no GRANT statement.

## 6. Root Cause

PostgreSQL checks EXECUTE permission when one SECURITY INVOKER function calls another function. Trigger attachment does not confer permission. Therefore an authenticated table write entered an invoker validator and could not call the deliberately private resolver.

## 7. Chosen Least-Privilege Design

Do not expose the resolver. Elevate only the three outer functions attached to fixed tables. Their bodies accept no client arguments, use only `NEW`/`OLD`, resolve schema-qualified fixed objects, enforce the template/category contracts, and return the trigger row. Direct execution remains revoked.

## 8. Forward Migration

Created `107_fix_internal_template_resolver_permissions.sql`. Pre-apply remote history was 106 and dry-run confirmed 107 as the only pending migration. Post-apply remote history is 107. The migration has defensive signature/return-type/trigger-attachment prechecks, changes only function security metadata/search paths/owners/ACLs/comments, and modifies no rows.

## 9. SECURITY DEFINER Review

- `validate_participant_category()`: elevation required to call the private template resolver and read the owning festival category; migration 106 validates festival, tenant, category, and active/historical state.
- `validate_item_categories_for_template()`: elevation required for the same private resolution; migration 106 validates tenant/festival ownership and each active code.
- `validate_registration_category_compatibility()`: elevation required to call three private resolvers; migration 104 performs exact participant/item category membership and preserves the hybrid-tenant contract.

No other function is converted.

## 10. Search Path Review

All three outer functions are set to `pg_catalog, public, pg_temp`. Sensitive tables/functions are already schema-qualified where required. No dynamic SQL or user-controlled object name exists.

## 11. Tenant Isolation

Migration 107 does not change RLS or table grants. Participant and item validation from migration 106 continues to require category tenant/festival ownership. The elevated functions disclose no row contents; they return `NEW` or a controlled validation exception.

## 12. Participant Validation

The effective migration 106 body is preserved byte-for-byte because migration 107 uses ALTER FUNCTION metadata changes rather than CREATE OR REPLACE. College custom-category validation and Sahithyolsav inference behavior remain unchanged.

## 13. Registration Validation

The migration 104 body and trigger attachment are preserved. The outer validator can now reach all three internal resolvers without granting them to authenticated clients.

## 14. Sahithyolsav Regression Review

No function body, trigger event, RLS policy, table grant, or Sahithyolsav rule changes. Only execution context and fixed search path of the existing outer validators change.

## 15. Test Matrix

Static trace/prechecks cover exact signatures, trigger attachments, no frontend RPC use, no broad grants, and safe search paths. Migration dry-run passed with only 107 pending; post-apply history confirms 107.

Post-apply anon direct RPC verification returned `42501 permission denied`, confirming the resolver is not anonymously exposed. A service-role direct call succeeded, which is expected for the trusted Supabase backend role and is not a frontend grant.

Runtime participant/item/registration, cross-tenant, archived-category, Sahithyolsav, and authenticated direct-call tests are NOT RUN because local Docker/Postgres is unavailable and no production test rows were authorized. Static inspection is not reported as runtime success.

## 16. Files Changed

- `supabase/migrations/107_fix_internal_template_resolver_permissions.sql`
- `CODEX_RESOLVE_FESTIVAL_TEMPLATE_PERMISSION_FIX_REPORT.md`

All pre-existing dirty worktree files were preserved.

## 17. Static Check Results

- Supabase migration dry-run: PASS, only migration 107 was pending.
- Production apply: PASS; remote highest migration is 107.
- Anon direct resolver execution: DENIED with 42501.
- Trusted service-role direct resolver execution: available as expected.
- Production DB lint: no Migration 107 errors; four unrelated pre-existing function errors remain.
- SQL balance: one BEGIN, one COMMIT, one DO block pair.
- Permission scan: zero GRANT statements; six exact REVOKEs.
- Changed-file `git diff --check`: PASS.
- `npx tsc --noEmit`: exit 2 with 53 pre-existing unrelated errors; no TypeScript file changed by this fix.
- Focused ESLint: not required because no TS/TSX file changed.

## 18. Security Risks

SECURITY DEFINER increases the importance of preserving the fixed bodies and direct-execution revokes. Future changes to these functions must not add dynamic SQL, arbitrary identifiers, or data-returning behavior. Runtime role/RLS tests remain mandatory before production.

## 19. Deployment Requirements

Execute the remaining transaction test matrix as authenticated/cross-tenant roles and verify the original participant operation no longer returns 42501. No frontend or Edge deployment is required for this database permission correction.

## 20. Confirmation No Deployment

Migration 107 was applied to production after explicit user approval. It changed function security metadata/ACLs only and modified no application rows. No frontend or Edge Function was deployed. No commit or push was performed.
