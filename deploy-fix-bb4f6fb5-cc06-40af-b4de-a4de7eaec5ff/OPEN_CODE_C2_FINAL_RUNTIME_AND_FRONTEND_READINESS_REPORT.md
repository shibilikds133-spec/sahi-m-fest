# OPEN CODE — C2 FINAL RUNTIME AND FRONTEND READINESS REPORT

Date: 2026-08-03
Scope: Read-only static audit + runtime-test blocker assessment for the C2 correction batch (migration 100, provision-admin `c2-fix-1`, corrected frontend). No source files modified, no deployment performed.

---

## 1. Repository State

- Branch: `main` @ `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
- Working tree: uncommitted changes (16 modified, 1 deleted, ~24 untracked). C2 corrections present as working-tree/untracked files:
  - `supabase/migrations/100_c2_correction_batch.sql` (untracked, APPLIED live per GEMINI_100 deployment report)
  - `supabase/functions/provision-admin/index.ts` (untracked dir, edge marked version `c2-fix-1` in source)
  - `src/services/tenantProvisioningService.ts`, `src/lib/repositories/provisioningRepository.ts` (untracked, new)
  - Modified: `(admin)/organisations/index.tsx`, `(super)/tenants/index.tsx`, `useOrganisations.ts`, `useSuperAdmin.ts`, `organisationService.ts`, `authService.ts`, `SupabaseAuthProvider.ts`, `SupabaseDatabaseProvider.ts`, `organisationRepository.ts`, `superService.ts`, `.env.example`
  - The working tree also contains pre-existing unrelated modifications (judge marks/import flows) and many untracked audit artifacts. Nothing was committed during this audit.
- `.env.example` was extended with `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` placeholders. No `C2_TEST_*` placeholder exists.

## 2. Current Live Backend State

Claimed (GEMINI_100_C2_CORRECTION_DEPLOYMENT_REPORT.md, cross-checked where possible):

- Migration 100: APPLIED via `npx supabase db push` (remote highest = 100)
- `provision-admin` edge: ACTIVE (version `c2-fix-1` in deployed metadata per Gemini; see §18)
- `begin_provisioning_operation`, `lookup_email_by_username`, `check_reset_credential_access` live; legacy wrapper `setup_child_organisation` revoked from `authenticated`
- Unique indexes `idx_orgs_unique_admin_email`, `idx_orgs_unique_parent_name` live

Independent live evidence obtainable without credentials (anon probes):
- Edge function anon POST → HTTP 401 rejected by the Supabase GATEWAY (`sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER`, `sb-gateway-version: 1`, no application body, no `X-Provision-Admin-Version` header)
- `profiles` anon SELECT → 200, 2 rows (live DB has 2 profiles; no safe test targets exist)

## 3. Runtime Test Blocker

Runtime positive tests are BLOCKED. Required values are unavailable in the environment:

- `SUPABASE_URL` — unset
- `SUPABASE_ANON_KEY` — unset (the publishable key embedded in legacy test scripts is not an acceptable authenticated-test credential)
- `SUPABASE_SERVICE_ROLE_KEY` — unset
- Test superadmin credentials — unavailable
- Test tenant-admin credentials — unavailable
- Test participant credentials — unavailable
- Safe test tenant/org IDs — none exist (live DB has only 2 profiles, both real; converting real data into test data is prohibited)

Per task rules: no safe targets exist → positive tests stopped; anonymous gateway probes were NOT substituted for positive validation.

**Classification: RUNTIME TESTING BLOCKED — SAFE CREDENTIALS/TARGETS UNAVAILABLE**

## 4. Gateway vs Edge Authentication

The Supabase gateway (JWT verification enabled by default for edge functions) rejects requests without a valid `Authorization` header BEFORE the function executes:

- Evidence: anon POST → 401 with `sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER`, `sb-gateway-version: 1`, `x-served-by: supabase-edge-runtime`, no `X-Provision-Admin-Version` header, no JSON body matching the function's error contract.

Distinct layers (must not be conflated):

| Layer | What it proves | Evidence available |
|---|---|---|
| Gateway JWT gate | Missing/invalid bearer → 401 before function | PROVEN (anon probe) |
| Edge JWT validation (`admin.auth.getUser`) | Legacy/invalid JWT handling | NOT OBSERVABLE without valid JWT |
| Edge caller role validation (profile fetch, `begin_provisioning_operation`) | Only reachable with valid JWT | NOT OBSERVABLE (no credentials) |
| Database authorization (finalise RPCs, RLS) | Only reachable via authenticated session | NOT OBSERVABLE (no credentials) |

Earlier adversarial-audit wording stating the live 401 body proved "edge function drift" is corrected here: the 401 (and its body shape) is produced by the gateway, not by the function. Drift between live and repo edge source is therefore UNCERTAIN, not proven.

## 5. Migration 100 Static Verification

Read in full (`supabase/migrations/100_c2_correction_batch.sql`, 531 lines):

- §1 duplicate pre-check `DO $$` (admin_email, parent_id+name) → aborts before constraint application. PASS
- §2 unique indexes `idx_orgs_unique_admin_email` (lower(admin_email) WHERE NOT NULL) and `idx_orgs_unique_parent_name` (parent_id, lower(trim(name)) WHERE NOT NULL). PASS
- §3 `UPDATE organisations SET admin_password_temp = NULL` sanitises legacy plaintext. PASS
- §4 revokes `authenticated` from `setup_child_organisation`, `setup_tenant_records`, both `finalise_*` — then RE-GRANTS both `finalise_*` to `authenticated` (required because the edge invokes them with the caller's JWT via `callerClient`). NOTE: re-grant keeps `finalise_*` directly callable by any authenticated client; the functions are internally hardened (ownership, visibility, archived-parent checks), so this is a deliberate design choice, but direct client invocation of `finalise_*` bypasses edge-level validation (org-name length etc.). Residual risk: LOW (validations are duplicated in the RPCs).
- §5 `begin_provisioning_operation`: requires `auth.uid()`; child: non-superadmin must have `get_my_tenant_id()` non-NULL + `is_org_visible(parent)` + archived-parent check; root: superadmin only; `SELECT ... FOR UPDATE` on existing op; ownership `requested_by <> v_uid` denied for non-superadmin; username regex `^[a-z0-9_]{3,40}$`; inserts op `status='pending'`. PASS
- §6 `lookup_email_by_username` — see §9 (SECURITY ISSUE).
- §7 `handle_new_user` gets `SET search_path = public`. PASS
- §8 both finalise RPCs: `FOR UPDATE` lock, ownership check, `completed` short-circuit, immutable `target_user_id`, archived-parent check, tenant-enabled check, username-collision check, transactional upsert. PASS (with the direct-invocation note above).
- §9 `check_reset_credential_access` — see §8 (CONFIRMED SECURITY ISSUE).

## 6. Child Organisation API Contract

Chain traced:

1. `src/lib/repositories/organisationRepository.ts:12` — `getChildOrganisations(parentId)` → `supabase.from('organisations').select('*')` (RLS-filtered row read; organisations table has NO user-id column)
2. `src/services/organisationService.ts:16` — passthrough
3. `src/core/hooks/useOrganisations.ts:17` — `childOrganisationsQuery` exposes rows as-is
4. `src/app/(admin)/organisations/index.tsx:190` — `orgs.map(org => ...)`; reset action at line 83: `resetCredential(org.id)`
5. `useOrganisations.ts:41` — `resetCredential` forwards arg unchanged as `targetUserId`
6. `organisationService.ts:47` → `tenantProvisioningService.resetCredential(targetUserId)` → `provisioningRepository.provision({ operation: 'reset_credential', target_user_id })`

Contract result: the returned child-org object contains **NO** `admin_user_id` / `profile_user_id` / `target_user_id` / equivalent field. The only identifier available is `organisation.id`.

**R1 — CONFIRMED.** `organisation.id` is passed where an Auth user id is required:
- Admin screen: `(admin)/organisations/index.tsx:83` → `resetCredential(org.id)`
- Super screen: `(super)/tenants/index.tsx:174` and `:191` → `resetMutation.mutateAsync(org.id)`

Expected result per backend logic:
- `check_reset_credential_access(org.id)` looks up `profiles WHERE id = p_target_user_id` → no profile row with an organisation's id → `v_target_tenant IS NULL` → returns false → edge 403 `FORBIDDEN` (admin callers)
- Superadmin caller: RPC returns true (superadmin bypass), then edge calls `admin.auth.admin.updateUserById(<org uuid>, ...)` → user-not-found → 500 `CREDENTIAL_RESET_FAILED`

The reset-credential feature is therefore non-functional end-to-end on both screens.

## 7. Reset Target Resolution

- Client supplies a raw `target_user_id` (currently wrongly an organisation id; the correct user id is NOT obtainable from any current API).
- Backend resolution: `check_reset_credential_access(p_target_user_id)` (migration 100 §9) resolves the target's tenant from `profiles`, then locates an org of that tenant via `SELECT id, parent_id FROM organisations WHERE tenant_id = v_target_tenant LIMIT 1` — **arbitrary row, no ORDER BY** (see §8).
- Checks present: caller authenticated; target profile must exist with a tenant; target org's parent must be `is_org_visible()` to the caller; superadmin bypass.
- Checks MISSING: no target role check (mitigated de facto: only admins receive `tenant_id` via `_provisioning_link_profile`; participants/judges/volunteers have NULL tenant), no archived/disabled-target check, no explicit descendant-direction check.
- Audit: edge inserts `tenant_access_audit_logs` row with `action='credential_reset'`, `new_status={target_user_id}` — no password stored. Error from the insert is NOT checked (silent audit-gap risk, low).
- Password handling: `generateTemporaryPassword()` (14 chars, ambiguous chars removed) returned in the 200 body, never persisted. PASS
- Disabled-tenant caller: `get_my_tenant_id()` NULL → `is_org_visible` empty → denied. PASS
- Archived behaviour: not explicitly considered for reset (caller-side visibility still applies; archived orgs remain in the visible tree only if ancestor).

## 8. Reset Authorization Matrix

`check_reset_credential_access` (migration 100 §9): superadmin → true; else target-tenant from profile; target org = **arbitrary** org of that tenant (`LIMIT 1`, no ORDER BY); parent NULL → false; else `is_org_visible(parent)`.

`is_org_visible` (029) = target ∈ `get_visible_organisations(get_my_tenant_id())`, which is the caller's tenant's full subtree (anchor orgs + ALL descendants). `get_my_tenant_id` (098 §3B) is NULL for disabled tenants and for profiles without tenant.

| Caller | Target | Expected | Actual |
|---|---|---|---|
| Superadmin | Root admin | Allow | TRUE (RPC) — then updateUserById fails only because UI sends org id (§6) |
| Superadmin | Child admin | Allow | TRUE (RPC) |
| Parent admin | Direct child admin | Allow | NONDETERMINISTIC — works only if the LIMIT-1 org lookup picks a child org of the target's tenant; if it picks the root org (parent NULL) → DENIED |
| Parent admin | Descendant child admin | Allow (intended) | NONDETERMINISTIC — same as above |
| Unit admin | Sibling unit admin | Deny | **ALLOWED when the lookup picks any child org** (parent = root, which is in every caller's tree) — CROSS-UNIT ESCALATION |
| Unit admin | Parent (root) admin | Deny | **ALLOWED when the lookup picks a child org** (root becomes visible via its ancestor position in the caller's tree) — escalation to root admin possible |
| Participant | Any admin | Deny | DENIED (participant has no tenant → `get_my_tenant_id()` NULL → empty visible set) |
| Disabled admin | Any target | Deny | DENIED (get_my_tenant_id NULL) |
| Unrelated tenant admin | Any target | Deny | DENIED (target's parent org not in caller's tree) |

**R3 — CONFIRMED SECURITY ISSUE.** Any tenant admin can (nondeterministically) reset the credential of sibling-unit admins and even the root admin of their own tenant, because `is_org_visible(parent)` only proves same-tree membership, not caller-descendant-of-target-parent direction, and the target-org resolution is an arbitrary `LIMIT 1`. The correct gate already exists in the codebase (`_assert_organisation_hierarchy_access`, migration 098) but is not used for reset. The feature is simultaneously unreliable (false denials for legitimate parent-admin resets).

## 9. Username Lookup Enumeration

`lookup_email_by_username` (migration 100 §6):

- Grants: `GRANT EXECUTE ... TO anon` and `TO authenticated` (lines 204–205); function default PUBLIC execute was not revoked → effectively executable by anyone, unauthenticated.
- Input: regex `^[a-z0-9_]{3,40}$` else NULL.
- Behaviour: if `organisations.admin_email = p_username` (case-insensitive) → returns `SELECT email FROM auth.users WHERE email LIKE lower(p_username) || '\_%@sahi.local' ORDER BY created_at DESC LIMIT 1`; else NULL.
- Unknown username → NULL; invalid format → NULL; status code identical (200) both ways; no timing difference material. No rate limiting exists on the RPC path.
- Existing CHILD username → returns the EXACT synthetic email (`{username}_{4hex}@sahi.local`). Account existence + exact email disclosed to anonymous callers.
- Root orgs store real emails in `admin_email`; probing those returns NULL (the LIKE cannot match), so real-email enumeration is limited to the existence signal via the org table (not directly leaked).
- Case: both compare lowercased → no case oracle.
- Disabled/archived users still resolve (no access-state check).
- LIKE wildcard nuance: `_` is a LIKE wildcard, so a username containing `_` (allowed by the regex) can match a different user's email (`ab_c` pattern matches e.g. `abxc_...@sahi.local` when `ab_c` exists as an org admin_email) — additional cross-user email leak, low likelihood.

**Classification: SECURITY ISSUE (account/email enumeration).** Username-based login inherently requires a resolution step (functional requirement), but anon-executable disclosure of the exact synthetic email contradicts the claimed "strictly returns null or 400s without disclosing enumeration" (GEMINI_100_C2_CORRECTION_DEPLOYMENT_REPORT §5). Mitigation options: resolve server-side in the edge (rate-limited), return a boolean/no-match generic result and perform sign-in with the resolved email internally (token-exchange), keep RPC authenticated-only with a one-time resolution nonce, or store `username` in `auth.users.raw_user_meta_data` and resolve inside GoTrue configuration. At minimum: revoke PUBLIC/anon execute in favour of an authenticated-only signed lookup, add rate limiting, and never return the raw email to unauthenticated callers.

## 10. Credential Reset Audit Flow

Edge `reset_credential` transaction order:

1. Authorization: `check_reset_credential_access` (SECURITY DEFINER) → 403 on false
2. Password change: `admin.auth.admin.updateUserById(targetUserId, { password })`
3. Audit: `admin.from('tenant_access_audit_logs').insert({ action: 'credential_reset', ... })`

- Step 3's error is not checked; if it failed (network), the response is still 200 and the password remains changed — the system does NOT return failure after a successful password change (the critical scenario from the task is not present).
- Audit row contains only ids (`new_status: { target_user_id }`), never the password. PASS
- Edge case: if step 2 succeeded and step 3 succeeded but the response is lost, the operator cannot recover the password (reset must be repeated; repeated reset is safe and re-audited). Documented as residual operational limitation (same class as F9 in the adversarial audit), now mitigated by the reset feature itself.

## 11. Audit Event Constraint Review

`tenant_access_audit_logs` (migration 098 §2): `action text NOT NULL` — **no CHECK constraint, no enum**. All C2 event names are accepted:
- `credential_reset` (edge), `child_organisation_provisioned`, `root_tenant_provisioned` (finalise RPCs), plus disable/enable/archive events from 098.

No runtime INSERT will fail due to a forgotten constraint extension. `tenant_provisioning_operations.status` CHECK already covers `pending`/`validated`/`auth_user_created`/`database_linked`/`completed`/`failed`/`compensated`/`compensation_pending` (migration 099), and `record_provisioning_event` upserts only those. PASS — no constraint gaps found.

## 12. Tenant Provisioning Service Compile Review

`src/services/tenantProvisioningService.ts` (74 lines, untracked new file):

- **R2 CONFIRMED**: `getProvisioningStatus` is declared TWICE in the same object literal — lines 52–58 and lines 67–73 (identical bodies). `tsc` TS2300 and eslint `no-dupe-keys` both fire on line 67:9.
- Additionally, `resetCredential` (line 60–65) sends `operation: 'reset_credential'`, but `ProvisioningOperation` in `provisioningRepository.ts:3` is `'root_tenant' | 'child_organisation' | 'status'` → **tsc TS2322 at tenantProvisioningService.ts:62,7** (newly introduced).
- `ProvisioningResponse` (`provisioningRepository.ts:17-29`) lacks `login_identifier` and `username` — consumed at `(admin)/organisations/index.tsx:134-135` → **2 further tsc TS2339 errors** (newly introduced).

**Classification: R2 = CONFIRMED BUILD BREAKER (with 2 additional C2-introduced type errors).**

## 13. TypeScript Result

`npx tsc --noEmit`:

- **C2-introduced errors (4):**
  - `src/services/tenantProvisioningService.ts(62,7)` TS2322 `'reset_credential'` not assignable to `ProvisioningOperation`
  - `src/services/tenantProvisioningService.ts(67,9)` TS2300 Duplicate identifier `getProvisioningStatus`
  - `src/app/(admin)/organisations/index.tsx(134,31)` TS2339 `login_identifier` not on `ProvisioningResponse`
  - `src/app/(admin)/organisations/index.tsx(135,105)` TS2339 `username` not on `ProvisioningResponse`
- **Pre-existing errors (not C2-introduced, present in the working tree before/independently of C2):** `chest-cards.tsx` (profile_slug), import-* participant/schedule screens (7 files, ~25 errors), `code-letter.tsx` (Timeout type), `BackgroundExportEngine.tsx` (arg count), `NotificationContext.tsx` (3), Deno edge files `r2Client.ts`/`r2-presign` (module/Deno globals, 12 errors).
- The production build is broken by C2 changes regardless of the pre-existing set.

## 14. Lint Result

`npx eslint` on the 9 C2-touched frontend files:

- **1 error**: `tenantProvisioningService.ts(67,9)` no-dupe-keys (R2)
- **9 warnings**: unused imports/vars (`KeyRound`; `Eye`, `EyeOff`, `showPass/setShowPass` in tenants; `no-unused-expressions` ternary-style statements in tenants handlers at 111/115/142/146) — cosmetic, no functional impact.

## 15. Superadmin Frontend Review

`(super)/tenants/index.tsx` (624 lines) + `useSuperAdmin.ts`:

- Root provisioning contract: `OnboardModal` → `useProvisionRootTenant` → `provisionRootTenant({orgId, orgName, orgType, adminEmail})` → `provisioningRepository.provision` with `operation:'root_tenant'`, idempotency key `root-${orgId}`, matches edge root_tenant payload. PASS
- Retry: failure phase offers Retry with the same `root-${orgId}` key → resumes/resolves; success phase hides temp password when the op already completed. PASS
- Idempotency lifecycle: key stable per org; modal resets phase on open; no duplicate-status usage. PASS
- Temp password: shown once in success card, explicitly "not stored anywhere". PASS
- `admin_password_temp`: still in the `Org` interface (line 40) and still selected by `SupabaseDatabaseProvider.ts:804` (`select('id, name, org_type, tenant_id, admin_email, admin_password_temp, tenants(access_disabled)')`) — dead column (NULLed by migration 100, masked in UI as `••••••••`), but the select remains a stale reference. LOW
- Reset target: **`resetMutation.mutateAsync(org.id)` (lines 174, 191)** — same R1 defect as the child screen (superadmin path: 500 user-not-found; the UI can never send a user id because the tenant-accounts list carries no user id).
- Stale RPCs: none (disable/enable/revoke go through 098 RPCs; provisioning through edge). No `setup_*`/`finalise_*` calls. PASS
- Previous tenant-management features (disable/enable/copy credentials/open login) retained. PASS
- Build compatibility: file itself type-checks; depends on the broken `tenantProvisioningService` module (R2) → broken build.

## 16. Child Frontend Review

`(admin)/organisations/index.tsx` (290 lines) + `useOrganisations.ts` + `organisationService.ts`:

- Username field exists (lines 28, 257–263) with client validation matching the backend regex `/^[a-z0-9_]{3,40}$/` (line 115). PASS
- Username retained on retry (state kept while modal open; `attemptKey` regenerated only when the modal opens). PASS (note: key regeneration on modal re-open means two distinct attempts in separate modal sessions are separate idempotency scopes — acceptable; retry within the same modal reuses the key)
- Login identifier displayed after success (`login_identifier`, line 134) — but the response type lacks the field → tsc error (see §12). Runtime display broken by the type error.
- Password displayed once (line 133–135, alert on success). PASS
- Reset button target: `resetCredential(org.id)` (line 83) — R1 CONFIRMED (admin caller → 403).
- Reset button visibility: shown for every listed child org to any user who can reach the screen; the screen has NO route guard (`(admin)/_layout.tsx` → `AdminAppShell` contains no role/tenant check) and no feature gate. Server-side denial is the only protection. Operational note only (server is authoritative).
- Archived parent: not selectable in this UI (children are listed under the caller's own org; archived parents are excluded by visibility semantics — organisations RLS/`is_org_visible` includes archived rows but the finalise/preflight RPCs now reject archived parents). PASS server-side.
- Disabled tenant coherence: `getMyOrganisation` requires `tenant_id` from the auth store; a disabled tenant's admin gets NULL via `get_my_access_status`-based logout guard in `authService.assertTenantEnabled`. PASS
- No `auth.signUp`, no `finalise_*`, no `setup_child_organisation` anywhere in `src` (verified by repository-wide grep — §19). PASS
- "Feature gate" status: **no onboarding feature gate exists in the code** (repository-wide grep for feature-gate/onboarding-gate symbols returned nothing). The onboarding UI is reachable by any authenticated session. The "MUST REMAIN ENABLED" requirement therefore applies to an absent mechanism; flag for correction batch.

## 17. Login Flow Review

`authService.ts` (97 lines):

- `resolveLoginEmail`: input with `@` → used directly; else → `authProvider.lookupEmailByUsername(username)` → RPC `lookup_email_by_username`; on RPC error → throw; on NULL → fallback `${username}@sahi.local`.
- The fallback email can NEVER match a real child account (`{username}_{4hex}@sahi.local`), so a failed lookup always yields "Invalid login credentials" — no false positives, but also no self-service recovery if the RPC mis-resolves.
- Child admin login path (username → synthetic email → `signInWithPassword`) is functional ONLY if the anon-executable lookup returns the exact email — which links §9 enumeration directly to the login requirement.
- `assertTenantEnabled` checks `get_my_access_status` and signs out disabled tenants. PASS
- Login identifiers shown after provisioning are the synthetic emails (edge returns `login_identifier`); the admin screen then shows `org.admin_email` (which stores the username for child orgs, and the real email for roots) — cosmetic mismatch, no functional impact.

## 18. Version Marker Verification

- Anonymous requests never reach the function (gateway 401, §4), so the `X-Provision-Admin-Version: c2-fix-1` header cannot be observed.
- No valid JWT, no dashboard/deployment metadata access, no function logs access in this environment.

**Classification: UNVERIFIABLE WITHOUT VALID JWT.** The earlier adversarial-audit claim that the missing header on an anon 401 proved "no version marker live" is corrected: it proves nothing beyond gateway interception. Source of truth remains the repo edge (`index.ts:20` sets the header on every `json()` response).

## 19. Static Search Results

| Pattern | Occurrences (src) | Classification |
|---|---|---|
| `getProvisioningStatus` | `tenantProvisioningService.ts:52,67` | DUPLICATE — R2 (error) |
| `resetCredential` | `useOrganisations.ts:41,53`; `useSuperAdmin.ts:68,81`; `organisationService.ts:47-50`; screens `organisations/index.tsx:83`, `tenants/index.tsx:174,191` | All pass `org.id` as user id — R1 |
| `target_user_id` | `tenantProvisioningService.ts:63` (payload key); edge `index.ts:108,117,129` | Client-supplied raw id, DB-validated by `check_reset_credential_access` (flawed — R3) |
| `admin_user_id` | none | — (root cause of R1: API never exposes it) |
| `admin_password_temp` | `SupabaseDatabaseProvider.ts:804` (select), `tenants/index.tsx:40` (type) | Dead reference only; column NULLed; not displayed |
| `lookup_email_by_username` | `SupabaseAuthProvider.ts:14` (rpc call); migration 100 §6 (anon grant) | R4 — enumeration |
| `check_reset_credential_access` | migration 100 §9; edge `index.ts:111` | R3 — authz flaw |
| `setup_child_organisation` | migration 100 §4 revoke only; **none in src** | Closure verified (static) |
| `auth.signUp` | **none in src** | PASS |
| `finalise_child_organisation_provisioning` / `finalise_tenant_provisioning` | migration 100 (define/re-grant); **none in src** | Frontend does not invoke directly; re-granted to authenticated by design (edge caller-scoped) |

## 20. Confirmed Issues

- **R1 — CONFIRMED**: reset-credential UI passes `organisation.id` as `target_user_id` on both screens (`organisations/index.tsx:83`; `tenants/index.tsx:174,191`); the API chain exposes no user-id field; reset always fails (403 for admins, 500 user-not-found for superadmin).
- **R2 — CONFIRMED BUILD BREAKER**: duplicate `getProvisioningStatus` (`tenantProvisioningService.ts:67`) + `'reset_credential'` not in `ProvisioningOperation` (tsc TS2322 line 62) + missing `login_identifier`/`username` on `ProvisioningResponse` (`organisations/index.tsx:134-135`).
- **R3 — CONFIRMED SECURITY ISSUE**: `check_reset_credential_access` authorizes sibling/parent resets within a tenant due to arbitrary `LIMIT 1` target-org resolution and non-directional `is_org_visible`.
- **R4 — CONFIRMED SECURITY ISSUE (enumeration/privacy)**: `lookup_email_by_username` is anon/PUBLIC-executable and returns exact synthetic emails for existing child usernames; no rate limiting; contradicts the deployment report's "no disclosure" claim.

## 21. Security Issues

1. R3 — cross-unit / root-admin credential reset by any same-tenant admin (nondeterministic).
2. R4 — anonymous account/email enumeration via the login-lookup RPC (PUBLIC + anon grants).
3. LOW — direct client invocation of `finalise_*` remains possible (re-granted by design); RPCs are hardened but bypass edge-level validation.
4. LOW — LIKE-wildcard cross-user email match inside `lookup_email_by_username` when usernames contain `_`.
5. LOW — silent audit-insert failure in edge reset (error not checked; password still changes).
6. NOTE — no route guard / feature gate on admin onboarding screens; server-side gates are the only enforcement (acceptable, but the "feature gate" requirement is unmet in code).

## 22. Functional Issues

1. R2 — build broken (4 C2-introduced tsc errors; 1 eslint error).
2. R1 — credential reset non-functional end-to-end (both screens).
3. Reset authz nondeterministic: legitimate parent-admin resets may 403 (arbitrary `LIMIT 1`).
4. `admin_password_temp` stale select/type references remain.
5. No `C2_TEST_*` environment contract exists (`.env.example` lacks test placeholders), which contributed to the runtime blocker.
6. Retry-after-response-loss still cannot recover a temp password (mitigated by reset once R1/R3 are fixed).

## 23. Required Corrections (for the next correction batch)

Backend (DB/edge — migration 101 / edge update, out of scope for this report per task rules):
1. `check_reset_credential_access`: resolve the target user's org via its profile→tenant→`organisations.organisation_id`/owner mapping; enforce descendant direction (`_assert_organisation_hierarchy_access`-style), explicit archived/disabled checks, and deterministic org resolution (no `LIMIT 1`).
2. `lookup_email_by_username`: revoke PUBLIC/anon execute; return a non-disclosing boolean/generic result; move resolution into a rate-limited authenticated path or edge token-exchange; escape LIKE patterns.
3. Return `admin_user_id` from the child-orgs/tenant-accounts API (or accept `org_id` in the reset RPC and resolve server-side).

Frontend (only after backend corrections land):
4. Remove duplicate `getProvisioningStatus`; add `'reset_credential'` to `ProvisioningOperation`; add `login_identifier`/`username` to `ProvisioningResponse`.
5. Pass the real user id (or org id once RPC accepts it) in both reset actions.
6. Remove stale `admin_password_temp` select/type references.
7. Fix lint warnings; optionally add route/role guard + explicit onboarding feature gate.

## 24. Runtime Tests Still Required

Once safe test targets (dedicated test superadmin + tenant-admin + participant, `C2TEST-*` markers, non-`.local` root email) are provisioned by an authorised operator:
1. Root onboarding positive (email login) + temp-password one-time display
2. Child onboarding positive (username + synthetic email login) + login-identifier display
3. Idempotent retry (double-create prevented; second call returns completed)
4. Child login via username resolution (including unknown-username generic failure)
5. Negative authz: participant → child provisioning denied; disabled-tenant admin denied; unrelated tenant admin denied; archived-parent provisioning denied
6. Reset: parent→child reset allowed; sibling→sibling DENIED; unit→root DENIED; superadmin→any allowed; post-reset login with new temp password; audit row present
7. Concurrency: parallel same-key child provisioning → single org/user; duplicate-username rejection
8. Enumeration probe: anon/authenticated lookup behaviour after fix

## 25. Frontend Release Decision

**FRONTEND RELEASE BLOCKED**
(Confirmed R1 + R2 + R3 + R4; build does not compile; corrected backend must land first.)

## 26. Final Verdict

**FAIL — BOTH SECURITY AND FUNCTIONALITY**
(R2 alone = functional fail; R3 + R4 = security fail; R1 = functional fail in the primary C2 feature.)

## 27. Confirmation of No Changes

This audit performed zero mutations: no source files edited, no migration created or applied, no edge function deployed, no database objects modified, no Auth users created/deleted, no tenants/organisations created, no secrets added or read, no git operations (no commit/stage/push/reset/checkout/clean), no feature-gate changes. Only read-only file reads, greps, `tsc --noEmit`, `eslint`, `git status`/`git diff --stat`, and anonymous HTTP probes (which alter nothing) were executed.

## 28. Confirmation Frontend Was Not Deployed

The frontend was NOT deployed in this session or by this audit. The corrected frontend remains uncommitted and undeployed; only the backend correction batch (migration 100 + edge `c2-fix-1`) is live, per Gemini deployment reports, and its live state is only partially independently verifiable without credentials.
