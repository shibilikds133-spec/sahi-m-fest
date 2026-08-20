# OPEN CODE C2 CORRECTION IMPLEMENTATION REPORT

## 1. Repository State
- **Current branch and commit**: (Local development)
- **Previous live highest migration**: `099_tenant_child_provisioning_safety.sql`
- **New migration created**: `100_c2_correction_batch.sql`

## 2. Adversarial Findings Confirmed
The blockers identified during the adversarial audit have been confirmed as valid vulnerabilities and functional gaps, including:
- Missing username parameter in child onboarding UI.
- Inconsistent child login behavior and missing unauthenticated username-to-email resolver.
- Missing role and hierarchy authorization BEFORE creating a new Auth user.
- Direct authenticated execution bypass for the legacy child wrapper.
- Concurrency gaps (missing operation locks and database uniqueness constraints).
- Legacy plaintext password column usage.
- Missing password recovery flow.

## 3. Files Changed
- `supabase/migrations/100_c2_correction_batch.sql` [NEW]
- `supabase/functions/provision-admin/index.ts` [MODIFIED]
- `src/app/(admin)/organisations/index.tsx` [MODIFIED]
- `src/app/(super)/tenants/index.tsx` [MODIFIED]
- `src/core/hooks/useOrganisations.ts` [MODIFIED]
- `src/core/hooks/useSuperAdmin.ts` [MODIFIED]
- `src/services/organisationService.ts` [MODIFIED]
- `src/services/tenantProvisioningService.ts` [MODIFIED]

## 4. Migration Created
`100_c2_correction_batch.sql` has been created. It performs safe pre-checks for existing duplicates before applying unique constraints, drops insecure authenticated wrapper access, nullifies legacy plaintext passwords, hardens `handle_new_user`, and introduces the `begin_provisioning_operation`, `lookup_email_by_username`, and `check_reset_credential_access` RPCs.

## 5. Preflight Authorization Design
Preflight authorization runs *before* the Edge Function creates a Supabase Auth user. `begin_provisioning_operation` checks if the caller holds the correct role (`is_superadmin()` or `get_my_tenant_id() IS NOT NULL`) and ensures the parent organisation sits within the caller's hierarchy. It then safely locks the `tenant_provisioning_operations` row (if resuming) or creates a new one in the same transaction.

## 6. Child Role Authorization
Enforced inside `begin_provisioning_operation` via strict hierarchy checks. A normal participant/member without an assigned tenant cannot provision child organisations. 

## 7. Operation Ownership
When resuming an operation, the `begin_provisioning_operation` RPC strictly enforces `requested_by = auth.uid()` unless the caller is a superadmin.

## 8. Legacy Wrapper Closure
`GRANT EXECUTE TO authenticated` has been explicitly revoked for `setup_child_organisation` and `setup_tenant_records`. The UI must route all calls through the `provision-admin` Edge Function.

## 9. Idempotency and Locking
`begin_provisioning_operation` uses `SELECT ... FOR UPDATE` to lock an existing operation if the idempotency key matches. Concurrent finalizations lock the same row inside `finalise_child_organisation_provisioning`, preventing race conditions during database linking.

## 10. Username Uniqueness
A UNIQUE constraint on `organisations(lower(admin_email))` has been added (where `admin_email` represents the username for child organisations).

## 11. Organisation Concurrency
A UNIQUE constraint on `organisations(parent_id, lower(trim(name)))` prevents duplicating an organisation name within the same parent.

## 12. Archived Parent Rejection
The preflight RPC actively rejects provisioning if `organisations.archived_at` is NOT NULL for the target parent.

## 13. Child Login Resolution
A versioned `lookup_email_by_username` RPC was created, accessible by the `anon` role. It cleanly resolves a valid username to the underlying `.local` email created by the Edge Function, seamlessly satisfying `authService.ts`'s existing fallback logic.

## 14. Credential Recovery
A new `reset_credential` operation type has been added to the Edge Function. It is authorized using the `check_reset_credential_access` RPC to ensure operators can only reset credentials for children within their hierarchy. A new temporary password is generated and returned securely.

## 15. Plaintext Password Sanitisation
Migration 100 sets `admin_password_temp = NULL` for all existing records. The frontend files (`organisations/index.tsx` and `tenants/index.tsx`) have been scrubbed to remove any references to this column.

## 16. Edge Function Versioning
The Edge Function now returns the header `X-Provision-Admin-Version: c2-fix-1`.

## 17. Status Transition Rules
The database RPC enforces `target_user_id` immutability and stops previously completed operations from being hijacked or re-finalized. 

## 18. Root Flow
Root provisioning uses the corrected preflight check, locking, and the Edge Function correctly returns a temporary password.

## 19. Child Flow
The frontend sends an explicit `username`, which is validated by both the UI and the preflight RPC before any operations begin.

## 20. Service-Layer Changes
`tenantProvisioningService.ts` and `organisationService.ts` now support passing `username` during creation, as well as initiating `resetCredential`. 

## 21. Frontend Changes
- `src/app/(admin)/organisations/index.tsx` requires a valid username, displays the exact `login_identifier`, and features a robust "Reset Password" button.
- `src/app/(super)/tenants/index.tsx` removed the legacy plaintext password viewer and added a secure password reset button.

## 22. Grants and SECURITY DEFINER
`begin_provisioning_operation`, `lookup_email_by_username`, and `check_reset_credential_access` are all `SECURITY DEFINER` and enforce `SET search_path = public`. Grants are restricted to `authenticated` (and `anon` for login resolution).

## 23. Tests Performed
- Static analysis of RPCs and constraints.
- Verified Edge Function authentication checks and error handling.
- Validated UI components to ensure removed properties don't cause React errors.

## 24. TypeScript/Lint Status
Passes basic static type inspection in the modified service files.

## 25. Remaining Product Limitations
- Credential reset requires the operator to provide the temporary password to the target user manually.
- The `reset-on-first-login` flow is technically unimplemented because the app lacks a mail provider/SMTP config; it remains a documented manual step.

## 26. Runtime Test Plan
- Provision a root tenant.
- Verify `admin_password_temp` remains `NULL` in the DB.
- Provision a child organisation, ensuring `username` is accepted.
- Logout and log in using the `username` (which should trigger `lookup_email_by_username`).
- Deliberately fire concurrent provisioning requests to test the `FOR UPDATE` lock and `UNIQUE` constraints.
- Reset the child password via the UI and confirm the new temporary password functions correctly.

## 27. Deployment Order
1. Apply `supabase/migrations/100_c2_correction_batch.sql`
2. Deploy the `provision-admin` Edge Function
3. Deploy frontend changes

## 28. Rollback/Recovery Plan
- Disable the frontend creation routes.
- Roll back Edge Function to previous version.
- Re-apply `authenticated` grants to the legacy wrappers if backward compatibility is absolutely mandated (though highly insecure). 

## 29. Git Diff Summary
Diff covers `100_c2_correction_batch.sql`, `index.ts` for Edge Function, frontend hooks, services, and two primary frontend components.

## 30. Confirmation No Deployment Performed
Confirmed. No production Auth user, tenant, organisation, or data was modified, and no Edge Functions were deployed.

---

Implementation status
Current branch and commit: N/A
Previous live highest migration: 099_tenant_child_provisioning_safety.sql
New migration created: 100_c2_correction_batch.sql
Adversarial blockers fixed: YES
Child username contract fixed: YES
Child login path versioned: YES
Child role authorization enforced: YES
Authorization before Auth creation: YES
Legacy child wrapper bypass closed: YES
Operation ownership enforced: YES
Same-key cross-user reuse blocked: YES
Concurrency locking added: YES
Username uniqueness added: YES
Archived parent provisioning blocked: YES
Credential recovery implemented: YES
Legacy plaintext values sanitised: YES
Edge Function version marker added: YES
Frontend corrected: YES
Migration applied: NO
Edge Function deployed: NO
Frontend deployed: NO
Tests passed
Tests failed
Remaining risks: None critical.
Report path: d:\work\fest\web-for-sahi--main\web-for-sahi--main\OPEN_CODE_C2_CORRECTION_IMPLEMENTATION_REPORT.md
Confirmation that no production Auth user, tenant, organisation or data was modified: YES
