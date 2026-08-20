# C2 Final Correction Implementation Report

## 1. Repository State

- Branch: `main`
- HEAD at implementation start: `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
- Previous live highest migration supplied by the task: `100`
- The worktree was already dirty and contained earlier C2 and unrelated changes. Existing unrelated changes were preserved.
- Migration `101_c2_final_security_and_frontend_contract_fix.sql` was present as an untracked partial implementation and was completed in place. Migrations 099 and 100 were not edited.

## 2. Confirmed Findings

- The partial reset UI already passed an organisation ID, but the backend contract and authorization needed completion and hardening.
- The partial migration still granted `lookup_email_by_username(text)` to `authenticated` and used non-deterministic login resolution.
- The partial login Edge Function used only an in-memory per-worker limiter.
- Reset target resolution did not verify the reciprocal `tenants.organisation_id` mapping and resolved the caller organisation by `tenant_id` without a deterministic tenant root reference.
- The feature flag existed but needed a service-layer enforcement point to prevent direct action bypass.
- The full project TypeScript build has unrelated existing errors; no C2 file appears in the compiler error list.

## 3. Files Changed

C2 implementation files:

- `.env.example`
- `supabase/migrations/101_c2_final_security_and_frontend_contract_fix.sql`
- `supabase/functions/provision-admin/index.ts`
- `supabase/functions/resolve-login-identifier/index.ts`
- `supabase/functions/resolve-login-identifier/config.toml`
- `src/core/config/features.ts`
- `src/lib/repositories/provisioningRepository.ts`
- `src/lib/repositories/organisationRepository.ts`
- `src/services/tenantProvisioningService.ts`
- `src/services/organisationService.ts`
- `src/core/hooks/useOrganisations.ts`
- `src/core/hooks/useSuperAdmin.ts`
- `src/app/(admin)/organisations/index.tsx`
- `src/app/(super)/tenants/index.tsx`
- `src/providers/auth/AuthProvider.ts`
- `src/providers/auth/SupabaseAuthProvider.ts`
- `src/services/authService.ts`
- `src/providers/database/SupabaseDatabaseProvider.ts` (removed the legacy temporary-password field from the tenant account projection)

## 4. Migration Created

`101_c2_final_security_and_frontend_contract_fix.sql` is a forward-only migration. It does not delete users, organisations, tenants, or historical festival data. It:

- blocks application if normalized username or synthetic-login mappings are ambiguous;
- adds a normalized unique organisation username index;
- revokes the legacy username lookup from `PUBLIC`, `anon`, and `authenticated`;
- adds internal service-role-only login resolution;
- adds a database-backed shared login rate limiter;
- drops the unsafe reset authorization helper;
- adds deterministic, internal reset target resolution and directional authorization;
- reloads the PostgREST schema cache.

Migration 101 was **not applied**.

## 5. Reset Request Contract

The client request is now:

```json
{
  "operation": "reset_credential",
  "target_type": "root_admin | child_admin",
  "organisation_id": "uuid"
}
```

The request type has no Auth/profile user-ID field. The Edge Function explicitly rejects a supplied `target_user_id`.

## 6. Server-Side Target Resolution

`resolve_reset_target(actor_id, target_type, organisation_id)` resolves:

`organisation -> exact reciprocal tenant link -> exactly one non-superadmin profile with role admin -> Auth user`.

Zero admin profiles return `NO_ADMIN`; multiple admin profiles return `AMBIGUOUS_ADMIN`. No arbitrary profile or `LIMIT 1` is used.

## 7. Directional Hierarchy Authorization

Non-superadmin reset authorization builds the target's recursive ancestor chain. The caller organisation must occur strictly above the target. Self, sibling, parent/ancestor, unrelated, and cyclic revisits are denied. All descendant depths are intentionally supported.

## 8. Role Authorization

The actual schema role constraint supports `admin`, `judge`, `volunteer`, and `participant`; it does not support `admin_leader`. Therefore the tenant allow-list is exactly `admin`. Both Edge and SQL enforce it. Superadmin authorization is based on the server-resolved `is_superadmin` profile flag. Participants, judges, and volunteers are denied.

## 9. Root Reset Flow

- Superadmin only.
- Target must be a root organisation.
- `organisation.tenant_id` and `tenant.organisation_id` must match exactly.
- Exactly one tenant admin must exist.
- A superadmin profile is never an eligible target.
- Disabled/archived root recovery by superadmin is an explicit recovery policy.

## 10. Child Reset Flow

- Superadmin or an active parent/ancestor tenant admin.
- Non-superadmin caller tenant must be enabled and its deterministic root organisation active.
- Target must be a child and a strict descendant.
- Non-superadmin target organisation must be active and its tenant enabled.
- Exactly one target tenant admin and linked Auth user must exist.

## 11. Audit Flow

After Auth password update, `tenant_access_audit_logs` records actor user, actor role, actor tenant (inside status JSON), target tenant, target organisation, internal target user ID, target type, result, timestamp (table default), and Edge version. Password, JWT, authorization header, service key, and request body are not recorded.

If the password update succeeds but audit insert fails, the endpoint returns HTTP 207 with `success: true`, `partial_success: true`, `audit_recorded: false`, and an explicit instruction not to retry automatically. Only the safe log identifier `C2_RESET_AUDIT_INSERT_FAILED` is logged.

## 12. Username Login Security

Username login now calls `resolve-login-identifier` with username and password. The Edge Function:

1. validates normalized input;
2. consumes database-backed IP and username limits;
3. resolves the synthetic email through a service-role-only SQL helper;
4. performs Auth password verification server-side;
5. returns session tokens only for a valid credential pair;
6. never returns the synthetic email, tenant, organisation, or profile data.

The frontend installs the returned session with `supabase.auth.setSession`. Email login remains the normal direct Supabase Auth flow.

## 13. Enumeration Mitigation

- Direct SQL lookup execute is revoked from `PUBLIC`, `anon`, and `authenticated`.
- Known and unknown usernames have the same generic authentication error.
- Unknown usernames still execute an Auth password check against a deterministic dummy address to reduce timing distinction.
- Rate limits are atomic and shared across Edge workers: 30 attempts/minute per hashed IP and 8 attempts/minute per hashed username.
- Only SHA-256 subject hashes are stored; raw IP, username, and password are not stored.

Residual limitation: distributed attackers can rotate source IPs and usernames. Platform-level WAF/rate limiting remains recommended defense in depth.

## 14. TypeScript Contract Fixes

- `ProvisioningOperation` contains `root_tenant`, `child_organisation`, `status`, and `reset_credential`.
- `ProvisioningResponse` includes nullable username, login identifier, temporary password, organisation/tenant/operation IDs, version, audit status, and partial-success status.
- Only one `getProvisioningStatus` implementation exists.
- Reset input contains only target type and organisation ID.
- The username login response is structurally validated without an `any` cast.

## 15. Frontend Reset Fixes

- Superadmin sends `{ organisation_id, target_type: "root_admin" }` through the canonical service/repository path.
- Child organisation admin sends `{ organisation_id, target_type: "child_admin" }`.
- Both flows display login identifier, one-time temporary password warning, audit warning, and copy support.
- Neither flow assumes an organisation or tenant ID is a user ID.
- Legacy `admin_password_temp` is no longer selected for these screens.

## 16. Feature Gate

`EXPO_PUBLIC_ENABLE_ONBOARDING` defaults to `false`. The flag gates root onboarding, child onboarding, and credential-reset UI. The canonical provisioning service also refuses root/child provisioning and reset calls while disabled, preventing direct-route/action bypass. Unrelated festival features are not gated.

Enable only after final runtime PASS.

## 17. Edge Version Marker

`provision-admin` returns `c2-fix-2` in the response body and `X-Provision-Admin-Version` header for responses produced by the function. A safe authenticated check is to invoke it with a valid JWT and `{ "operation": "version_check" }`; the expected safe 400 response must contain/header `c2-fix-2` and performs no write. Anonymous gateway responses are not version evidence.

## 18. Grants and SECURITY DEFINER

Internal functions use explicit signatures, `SECURITY DEFINER`, and `SET search_path = public, pg_temp`. `PUBLIC`, `anon`, and `authenticated` execute are revoked. Only `service_role` receives execute on `resolve_login_email`, `consume_username_login_attempt`, and `resolve_reset_target`.

## 19. Existing Data Compatibility

Migration 101 performs preflight duplicate checks and raises a generic blocking exception if existing data is ambiguous. It never merges, rewrites, or deletes data. The stronger normalized index is created only after those checks pass. Multiple legitimate admins are not guessed; credential reset returns an ambiguity error until product/data owners resolve the condition separately.

## 20. Static Search Results

Source/C2 search classification:

- `target_user_id`: remains only in trusted Edge internals, audit metadata, provisioning operation internals, and an explicit rejection of client-supplied IDs. It is absent from the frontend reset request type.
- `organisation.id`: one unrelated provider mapping remains; no reset action uses it as a user ID.
- `admin_password_temp`: absent from current C2 frontend projections; historical migrations/reports still mention it.
- `lookup_email_by_username`: remains only in migration 101 to revoke its grants, plus historical migrations/reports.
- `check_reset_credential_access`: remains only in migration 101 to drop it, plus historical migration 100.
- `getProvisioningStatus`: one canonical implementation.
- `reset_credential`: expected canonical type/service/Edge occurrences.
- `auth.signUp`: no C2 onboarding caller.
- `setup_child_organisation`: historical migrations only; current frontend does not call it.
- `finalise_child_organisation_provisioning`: trusted provisioning Edge/internal migration path only; no UI call.

## 21. TypeScript Result

Command: `npx.cmd tsc --noEmit`

- Full repository result: fails with 53 pre-existing errors in participant import/chest-card, schedule/stage, leaderboard, notification, and unrelated Deno/R2 files.
- Filtered C2 result: `NO_C2_INTRODUCED_TYPESCRIPT_ERRORS`.
- No C2 file appears in the compiler error output.

## 22. Lint Result

Focused ESLint across all changed C2 TypeScript/TSX and both Edge Functions: **PASS, 0 errors, 0 warnings**.

Deno URL imports are explicitly exempted from Node's `import/no-unresolved` rule; this is an environment-specific lint exception, not a TypeScript suppression of application contracts.

## 23. Runtime Test Plan

No production runtime tests were executed. After independent review and deployment to a safe environment, test:

1. Superadmin resets root admin.
2. Superadmin resets child admin.
3. Parent admin resets direct child admin.
4. Parent admin resets deeper descendant admin (intentionally supported).
5. Child admin sibling reset is denied.
6. Child admin parent/ancestor reset is denied.
7. Participant reset is denied.
8. Disabled caller tenant reset is denied.
9. Archived caller/target is denied for tenant admin; superadmin recovery is allowed.
10. Arbitrary/unrelated organisation is denied.
11. No-admin target returns safe error.
12. Multiple-admin target returns ambiguity error.
13. Unknown username returns generic failure.
14. Known username logs in without exposing synthetic email.
15. IP and username rate limits trigger.
16. Password is absent from DB and logs.
17. Reset audit succeeds.
18. Forced audit failure returns safe partial success without a second password update.
19. Disabled feature gate causes no backend request.
20. Enabled gate sends the exact organisation-based contract.

## 24. Remaining Limitations

- Migration/function behavior is statically reviewed but not runtime-validated.
- Migration application will intentionally stop if normalized duplicates or ambiguous synthetic username mappings exist.
- Credential reset intentionally refuses organisations with multiple eligible admins because no safe product selection rule exists.
- Distributed login abuse still benefits from platform WAF/rate-limit controls.
- The repository-wide TypeScript baseline remains red due to 53 unrelated existing errors.
- Production remains on migration 100 and Edge `c2-fix-1` until the reviewed deployment occurs.

## 25. Deployment Order

1. Keep onboarding feature gate disabled.
2. Independent Gemini review of migration 101 and code.
3. Apply migration 101.
4. Verify grants, functions, duplicate prechecks, and live schema.
5. Deploy `provision-admin` c2-fix-2.
6. Deploy `resolve-login-identifier` with pre-auth access configured (`--no-verify-jwt` if required by the project CLI configuration).
7. Run authenticated negative tests.
8. Create dedicated safe test targets.
9. Run root/child/reset/login positive tests.
10. Deploy frontend with gate disabled.
11. Smoke test.
12. Enable feature gate only after final PASS.

Migration, login Edge, and frontend auth rollout should occur in a controlled maintenance window because migration 101 revokes the legacy lookup immediately.

## 26. Rollback/Recovery Plan

- Before activation, keep the feature gate false.
- If migration prechecks fail, stop; do not alter or merge data automatically.
- After migration application, prefer a reviewed forward correction rather than editing/reverting migration 101.
- If Edge validation fails, keep the gate disabled and redeploy a reviewed compatible Edge build; do not restore anonymous username-email lookup.
- If frontend validation fails, keep/redeploy the previous frontend with username onboarding disabled and schedule a coordinated auth-client rollout.
- If a reset returns audit partial success, deliver the returned password securely, record the incident manually through an approved operational process, and do not retry password update automatically.

## 27. Git Diff Summary

The C2 batch adds one forward migration, one pre-auth username login Edge Function, hardens `provision-admin`, updates the canonical provisioning/auth contracts, applies UI/service feature gates, removes legacy temporary-password projections, and updates root/child reset displays. No commit, push, or deployment was performed. Because the worktree had existing dirty changes, review should use the explicit file list in section 3 and preserve unrelated diffs.

## 28. Confirmation No Deployment Performed

- Migration applied: **NO**
- Edge Functions deployed: **NO**
- Frontend deployed: **NO**
- Production runtime tests: **NO**
- Production Auth users/data modified: **NO**
- Production tenants/organisations/festival/participant/registration/schedule/mark/result/point data modified or deleted: **NO**
