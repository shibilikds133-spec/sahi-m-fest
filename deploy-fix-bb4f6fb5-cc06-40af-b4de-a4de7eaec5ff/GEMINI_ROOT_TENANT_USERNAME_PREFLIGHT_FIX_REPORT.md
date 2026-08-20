# GEMINI_ROOT_TENANT_USERNAME_PREFLIGHT_FIX_REPORT.md

## Root cause

`begin_provisioning_operation` (defined in migration 100, APPLIED in production) validated
`p_username` with the username regex **unconditionally**:

```sql
-- Ensure username format
IF p_username IS NOT NULL AND p_username !~ '^[a-z0-9_]{3,40}$' THEN
  RAISE EXCEPTION 'Invalid username format';
END IF;
```

For `root_tenant` onboarding the Edge Function (`provision-admin` c2-fix-2) passes the
**admin email** into that same `p_username` parameter (that is how the email reaches the
`tenant_provisioning_operations.admin_email` column). Any valid email (contains `@` / `.`)
fails `^[a-z0-9_]{3,40}$`, so the root preflight RPC raised `'Invalid username format'`,
which the Edge surfaced as:

```json
{ "error": "PREFLIGHT_DENIED", "message": "Invalid username format", "version": "c2-fix-2" }
```

This happened for BOTH Sahithyolsav and College Fest root onboarding because the check is
operation-independent and the configuration step raised inside the shared preflight call.

**Live reproduction against production** (BEGIN/ROLLBACK, superadmin claims):
`begin_provisioning_operation('root_tenant', ..., 'shibilikds938@gmail.com')` → raised
`Invalid username format`. Confirmed at runtime, zero rows persisted.

## Files changed

| File | Change |
| --- | --- |
| `supabase/migrations/105_root_tenant_preflight_username_scope.sql` | NEW migration (draft, NOT applied, NOT deployed): redefines `begin_provisioning_operation` so the username format check runs **only** when `p_operation_type = 'child_organisation'` (and, defense-in-depth mirroring the Edge rule, rejects a child op with **no** username). All authorization, idempotency (FOR UPDATE lock), ownership, hierarchy-visibility, archived-parent and INSERT mapping logic is otherwise byte-for-byte identical to migration 100. Migration 102 is untouched. |
| `src/lib/repositories/provisioningRepository.ts` | (Already fixed in the preceding task — verified for the root path.) Reads the parsed Edge body from `FunctionsHttpError.context` and throws `context.message`, so the root UI shows the safe backend message instead of "Edge Function returned a non-2xx status code". |

## Root username validation removed

YES — username is no longer validated for the `root_tenant` operation. ✓

## Child username validation preserved

YES — `^[a-z0-9_]{3,40}$` still enforced for `child_organisation` (now also rejecting a
child request with no username, matching the Edge's own 400 rule). ✓

## Root operation contract verified

YES. Frontend chain traced end to end:
`(super)/tenants/index.tsx:401-407` (`OnboardModal.handleSave`) sends
`{ orgId, orgName, orgType, adminEmail: email.toLowerCase(), festivalTemplate }` (no username)
→ `useSuperAdmin.useProvisionRootTenant` (`useSuperAdmin.ts:60-65`)
→ `superService` untouched
→ `tenantProvisioningService.provisionRootTenant` sends `operation: 'root_tenant'`
(`operation: 'root_tenant'`, `org_id`, `org_name`, `org_type`, `admin_email`, `festival_template`)
→ `provisioningRepository.provision` → Edge c2-fix-2 → `begin_provisioning_operation` preflight
→ `finalise_tenant_provisioning` (6-arg). The request is NOT sent as `child_organisation`;
the Edge only evaluates `validateUsername` under `operation === 'child_organisation'`; and
neither finalise overload (`099` 5-arg, `102` 6-arg) references a username parameter. Root
preflight + finalisation therefore never require an email-format-vs-username collision.

## Sahithyolsav root static test

Git-verified payload (`festival_template: 'sahithyolsav'`, admin email only). Live:
`begin_provisioning_operation('root_tenant', 'root-sahithyolsav-0001', NULL, …, '<email>')`
with the fixed logic → **PASS**, op id returned, `admin_email` stored correctly.

## College Fest root static test

Git-verified payload (`festival_template: 'college_fest'`, admin email only). Live:
`begin_provisioning_operation('root_tenant', 'root-college-0001', …, '<email>')` →
**PASS** at preflight; the template allow-list (`'sahithyolsav','college_fest'`) is enforced
in the 6-arg `finalise_tenant_provisioning` (migration 102:374-376), which was NOT exercised
(runs only on real onboarding; no data creation performed, template support verified by code
and existing 102 deployment).

## Full runtime case matrix (in-transaction fixed function, ROLLBACK after)

- Root Sahithyolsav + valid email + NO username → **accepted** ✓
- Root College Fest + valid email + NO username → **accepted** ✓
- Root request with NO username → **accepted** ✓
- Child request with NO username → **rejected** (`Invalid username format`) ✓
- Child username `tes111` → **accepted** ✓
- Child INVALID username → **rejected** (`Invalid username format`) ✓
- Tenant-less / tenant admin ROOT creation → **denied** (`only superadmin can provision root tenant`) ✓
- Tenant-less CHILD creation → **denied** (`tenant access required or disabled`; hierarchy guard intact) ✓
- No Auth user created before root authorization passes: Edge creates the Auth user only AFTER a successful preflight (`provision-admin/index.ts:306` preflight → `:352` `admin.auth.createUser`); the reproduced denial returns before that line; `tenant_provisioning_operations` after all tests = **0 rows** ✓

## New TypeScript errors

**0** — `tsc --noEmit` reports no errors across the changed/verified chain
(`(super)/tenants/index.tsx`, `useSuperAdmin.ts`, `tenantProvisioningService.ts`,
`provisioningRepository.ts`, `superService.ts`). No TS file was modified in this task
(the migration is SQL; the repo error-extraction fix predates it).

## Lint result

**0 issues** on the four root-chain files (project eslint config / eslint-config-expo).

## Migration modified

YES — added `105_root_tenant_preflight_username_scope.sql` (new draft, **NOT applied**).
Migration 102 **NOT modified**. Migration 100 left as-is (applied history; fixed via the new migration).

## Deployment performed

**NO** — no `supabase db push`, no `supabase functions deploy`, no frontend release.

ROOT TENANT PREFLIGHT USERNAME BUG FIXED — NO DEPLOYMENT PERFORMED