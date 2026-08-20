# GEMINI 098 TENANT DISABLE ARCHIVE CROSS CHECK

## 1. Repository State
- Current branch: `main`
- Current commit: `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
- `098` is the only migration created for C3.
- Untracked files include `098_tenant_access_disable_archive.sql`.
- Migration `097` remains unchanged.
- Migration `010` was not edited.

## 2. Diff Scope
- `supabase/migrations/098_tenant_access_disable_archive.sql` was added.
- Frontend modifications occurred in `authService.ts`, `tenants/index.tsx`, `organisations/index.tsx`, `organisationRepository.ts`, `organisationService.ts`.
- No unrelated source files were changed, no secrets introduced.

## 3. Open Code Claims Verified
- Disable first; never hard-delete: Verified.
- Legacy `revoke_tenant_access` replaced by safe disable: Verified.
- Legacy `delete_child_organisation` replaced by safe archive: Verified.

## 4. Migration Safety
- Forward-only, transaction-wrapped correctly.
- No destructive deletes (no `DELETE FROM auth.users`, no `DELETE FROM tenants`).
- PostgREST schema reload included.

## 5. Legacy Revoke Closure
- `revoke_tenant_access` safely wraps `disable_tenant_access`.
- Does not delete identities, users, tenants, or unlink organisations.
- Anonymous/normal users denied. Superadmin allowed.

## 6. Disable Authorization
- `disable_tenant_access` enforced with `_assert_superadmin_access`.
- Only superadmin can disable.
- Idempotent and safely audited.

## 7. Re-enable Authorization
- `enable_tenant_access` safely re-enables tenant.
- Superadmin only.

## 8. Disabled-Tenant Enforcement
- New field `access_disabled` added to `tenants`.
- Evaluated in `authService.ts` to log out blocked tenants.
- **GAP FOUND:** Enforcement relies on client-side API checks or specific management RPCs. RLS policies and other shared RPCs (like imports) DO NOT check `access_disabled`, meaning an existing valid session token could bypass the block via direct API calls.

## 9. Existing Session Risk
- Existing sessions are NOT securely blocked server-side because `get_my_tenant_id()` was not updated to reflect `access_disabled`.
- A malicious/compromised user can extract their JWT and continue privileged RLS/RPC operations until token expiry.

## 10. Shared Server-Side Enforcement Options
- **Option A (Recommended):** Update `get_my_tenant_id()` to return `tenant_id` only if `access_disabled = false`. This is the smallest reliable server-side design to globally lock out disabled tenants from all RLS and import RPCs without breaking superadmin views.

## 11. Child Archive Authorization
- `archive_child_organisation` sets `archived_at = now()`.
- Superadmin allowed. Parent admin allowed for descendants. Sibling/unrelated/normal members denied.

## 12. Hierarchy Direction
- `_assert_organisation_hierarchy_access` strictly walks down (descendants only). Validated securely.

## 13. Archive Effectiveness
- **PARTIALLY EFFECTIVE:** Archived organisations are hidden from `getChildOrganisations` in the UI, but new data (participants/schedules) can still technically be imported against them because server-side RLS/imports do not filter out `archived_at IS NOT NULL` for writes.

## 14. Organisations RLS After Policy Removal
- `Admins full access to organisations` was dropped.
- Superadmins retain full control.
- Parent hierarchy read remains intact.
- **Note:** Normal admins can no longer UPDATE their own organisation directly. There is no frontend feature doing this, so it is a partial functionality preservation rather than an active breakage.

## 15. Audit Table Security
- `tenant_access_audit_logs` correctly logs all actions securely inside `SECURITY DEFINER` functions.
- RLS prevents public/normal-user reads.

## 16. Auth Service Review
- Checks `access_disabled` securely on login and session restoration, cleanly signing out blocked users.

## 17. Superadmin Tenant UI Review
- Frontend correctly uses disable/enable RPCs instead of legacy revoke.

## 18. Child Organisation UI Review
- Archive workflow correctly implemented. Restoring is supported.

## 19. Data Preservation
- SQL evidence confirms no data is ever deleted.

## 20. Effective Access Matrix
- Superadmin: Full access, can disable/archive.
- Normal User: No privileged access.
- Tenant Admin (Enabled): Normal operation, can archive child.
- Tenant Admin (Disabled): UI blocked, but API remains vulnerable.

## 21. Negative Test Analysis
- Legacy revoke by anon: PASS (Blocked by DB).
- Direct DB access by disabled session: FAIL (API remains open).

## 22. Positive Regression Analysis
- Superadmin disables tenant: PASS.
- Superadmin restores tenant: PASS.

## 23. Issues Found
- **SECURITY ISSUE:** `get_my_tenant_id()` does not factor in `access_disabled = true`, leaving RLS and RPCs exposed to existing sessions.

## 24. Required Corrections
- **1 Correction:** Update `get_my_tenant_id()` to return `NULL` for disabled tenants (Option A).

## 25. Remaining Limitations
- Archive is UI-only enforcement; RLS/RPCs do not actively reject writes to archived organisations.

## 26. Deployment Readiness
- Not ready for deployment until the server-side enforcement gap is closed.

## 27. Final Verdict
- FAIL — SECURITY ISSUE

## 28. Confirmation of No Changes
- Verified read-only execution. No source, migration, or DB changes performed.
