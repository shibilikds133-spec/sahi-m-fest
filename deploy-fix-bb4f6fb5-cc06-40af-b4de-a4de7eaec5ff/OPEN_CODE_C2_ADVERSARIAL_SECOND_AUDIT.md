# OPEN CODE ADVERSARIAL SECOND AUDIT — C2 ONBOARDING IMPLEMENTATION, DEPLOYMENT AND GEMINI RUNTIME REPORT

**Auditor:** opencode (adversarial second audit)
**Date:** 2026-08-03
**Mode:** Strict read-only. No source, migration, Edge Function, database, Auth user, tenant, organisation or configuration changes performed. No files created except this report. Live probes were anonymous and non-mutating (401/404/empty-result responses; a single `lookup_email_by_username` lookup of a non-existent username which returned NULL and created nothing).

---

## 1. Repository State

- Branch `main`, commit `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc` (`feat: modernize admin, scheduling, and judging workflows`) — unchanged.
- `git status`: 15 modified files, 1 deleted (`082`), many untracked (migrations `093`–`099`, `provision-admin/`, C1/C2/C3 reports, check/test scripts, `migration_archive/`, `openapi.json`).
- C2 changed files (confirmed): `src/app/(super)/tenants/index.tsx`, `src/app/(admin)/organisations/index.tsx`, `src/core/hooks/useSuperAdmin.ts`, `useOrganisations.ts`, `src/lib/repositories/{superRepository,organisationRepository,provisioningRepository}.ts`, `src/services/{superService,organisationService,tenantProvisioningService}.ts`, `src/providers/database/{DatabaseProvider,SupabaseDatabaseProvider}.ts`, plus new `supabase/migrations/099_tenant_child_provisioning_safety.sql`, `supabase/functions/provision-admin/index.ts`.
- Pre-existing unrelated changes: judge-mark batch, `authService.ts`, `.env.example`, `082` deletion, `093`–`098` (other agents).
- Local migration inventory: `001`–`099`; highest `099`. `097`/`098` untouched by C2.
- `openapi.json` in the repo is 0 bytes — it provides **no** live-schema evidence.

## 2. Live Deployment State (probed read-only on 2026-08-03)

| Probe | Result |
|---|---|
| POST `functions/v1/provision-admin` (anon, no header) | **401** `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}` — function ACTIVE |
| POST `functions/v1/provision-admin` (anon + malformed JWT) | **401** (edge-rejected) |
| POST `/rest/v1/rpc/lookup_email_by_username` (anon) | **HTTP 200, body `null`** — function EXISTS live and is anon-executable |
| POST `/rest/v1/rpc/finalise_tenant_provisioning` (anon, `{}`) | **HTTP 404** (PGRST202 schema-cache miss) — matches Gemini's "anon closed" |
| GET `tenant_provisioning_operations` (anon) | empty result (RLS denies) |
| UPDATE `profiles.role='superadmin'` (anon, nonexistent id) | 0 rows — trivially denied (see §26) |

- Migration `099`: reported LIVE (Gemini §4; remote history `098`→`099`).
- `provision-admin`: ACTIVE but the live error contract **differs from repo source** — see §5. Marked **UNCERTAIN** for internal-branch equivalence.

## 3. Scope and Method

- Reviewed: migration `099` in full (713 lines); `provision-admin/index.ts` (336 lines); provisioning service/repository; hooks; both onboarding screens; `organisationService`/`organisationRepository`; `superService`; `authService` + `SupabaseAuthProvider`; `login.tsx`; migrations `002`, `007`, `009`, `011`, `013`, `029`, `098`, `099`; Gemini cross-check; Gemini deployment report; `test-c2.js`; `test-c2-rls.js`; prior analysis reports (`OPEN_CODE_TENANT_IMPORT_REVOKE_ANALYSIS.md`, `UPDATED_PROJECT_REVALIDATION_REPORT.md`).
- Performed limited anonymous live probes (§2) to verify drift and schema presence.
- Not performed (read-only constraints): authenticated-context tests, positive provisioning, concurrency tests, live catalog dump of function bodies/grants/policies.

## 4. Gemini Audit Evidence Review

| Gemini conclusion | Evidence provided | Independently verified | Overstated | Missing test |
|---|---|---|---|---:|---|
| Anonymous access denied | Runtime 401 (no header / invalid JWT) | Yes (probe §2) | No | — |
| Invalid JWT denied | Runtime 401 | Yes | No | — |
| Direct RPC bypass closed | Anon `rpc()` → PGRST202 | Partially: anon is closed (404 live); **authenticated direct calls were never tested** | Yes — anon-only evidence | Authenticated direct RPC (`setup_child_organisation` 5-param is granted to authenticated and calls finalise directly) |
| Profile escalation closed | Anon UPDATE → 0 rows | Partially: SQL in `099` is sound; **anon 0-rows proves nothing about the authenticated self-update policy** (anon had no UPDATE policy even before 099) | Yes | Authenticated self-update attempt |
| Pre-existing user deletion impossible | Code reasoning (`createUser` fails on duplicate email) | Yes — structurally sound | No | — |
| Temporary password not persisted | Code review | Yes (SQL + edge reviewed; no write path) | No | Log review (Gemini admits UNCERTAIN) |
| Service-role isolated | Code review | Yes (Deno.env only; no key in repo except publishable key in test scripts) | No | Log scan (UNCERTAIN) |
| Backend verified with documented limitation | Negative anon tests only | **No** — see findings F1/F2/F3: untested positive flow contains at least one guaranteed failure (missing `username` in the UI→edge contract) and one unverifiable login path | **Yes — materially** | Positive root/child provisioning; child login; authenticated hierarchy isolation |
| Idempotency PARTIAL | Static reasoning | Yes — no row locks, no org/username unique constraints (§12/§13) | No | — |
| Critical auth-user ownership STRONG | Code reasoning | Only true for *compensation scope*. **Not true for the DB layer**: finalise RPCs/wrappers accept an arbitrary `p_user_id` and the edge reuses `target_user_id` without caller-ownership check (§10) | **Yes** | Ownership-conflict runtime test |

## 5. Repository/Live Drift

**DRIFT PROVEN — live edge ≠ repo source.**
- Repo `provision-admin/index.ts:85` returns `json(401, { error: 'UNAUTHORIZED', message: 'Authentication required.' })` (fields `error`/`message`).
- Live edge returns `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}` (fields `code`/`message`, different text).
- Therefore the deployed function (Gemini "Version 2") is **not** byte-identical to the reviewed repository file. The reviewed security reasoning (authz branches, compensation) cannot be assumed to hold for the live artifact.
- **Additional drift:** `lookup_email_by_username` is live (anon, HTTP 200) but **defined in no migration** in the repo. It is an unversioned live object. Its implementation is unknown; anonymous executability is an email-enumeration surface if it returns real emails for existing usernames.
- No migration `100+` exists. Older function overloads: live removal of the 6-param child overload is corroborated only by Gemini's catalog check (cannot be re-verified read-only without a live catalog dump); repo SQL is unambiguous.
- Gemini's "NO DRIFT" statement: **disproved for the edge function and the unversioned RPC; unproven for function bodies/grants live** (no `information_schema`/`pg_proc` diff artifact exists in the repo).

## 6. Edge Function Authentication

- `Authorization` header required; strict `Bearer\s+` prefix strip; token validated with `admin.auth.getUser(token)` (real JWT verification via Supabase Auth, not decoding) — **sound**.
- Identity, role, `is_superadmin`, `tenant_id` all resolved server-side from `profiles` via the service-role client — **sound**.
- Disabled-tenant enforcement: the edge only checks `profile.tenant_id` presence; the DB finalise gate uses corrected `get_my_tenant_id()` (NULL when disabled, per `098`) — enforcement is DB-side, **after user creation** (§8).
- Anon key cannot substitute: anon → 401 (probed). Service-role client is used only for `getUser`/profile read/`createUser`/`deleteUser`/`record_provisioning_event`; the finalisation RPC runs on the **caller-scoped** client so `auth.uid()` = actor — **sound**.
- CORS: `*` origin, methods POST/GET/OPTIONS, no credentialed execution; preflight cannot trigger logic (OPTIONS returns before body parse).
- Error responses: generic, no enumeration oracles (404/401/403/500 texts are static). **Weakness:** child `AUTH_USER_CREATE_FAILED (409)` message discloses "email may already be registered" for root emails — a mild existence oracle against *synthetic* addresses, low risk.
- **Confused-deputy check:** every privileged branch (root create, child create, status, compensation) is reached only after JWT+profile resolution; root create additionally gated by `isSuperadmin`. The one gap: **child authorization checks tenant-presence but not role** (§9/F3), and `status` reuse of ops lacks caller-ownership (§10/F4).

## 7. Request Trust Boundaries

| Field | Classification |
|---|---|
| `operation` | Client-controlled but validated against an allow-list |
| `idempotency_key` | Client-controlled, length-bounded; server-generated if absent. **Ownership is not bound to the caller** (F4) |
| `org_id` (root) | Client-controlled; DB validates existence; superadmin gated. Org must be tenant-less (else rejected) |
| `parent_id` (child) | Client-controlled; DB validates via `is_org_visible` (hierarchy) — but only **after** user creation (F3/F8) |
| `org_name` | Client-controlled; 2–120 length; no uniqueness (F7) |
| `org_type` | Client-controlled; allow-list |
| `admin_email` (root) | Client-controlled; normalized regex, ≤254; not checked for existing account until `createUser` |
| `username` (child) | Client-controlled; regex-validated. **Never sent by the current UI (F1)** |
| `role`, `tenant_id`, `target_user_id`, `caller_role`, `access_disabled` | Not accepted as body fields — derived server-side / DB-side. **Sound** |
| `operation_type` (status) | Client-controlled but only selects the lookup key; scoping enforced after fetch |

Cannot do: assign superadmin (role hard-coded `'admin'` at link; superadmin never assignable), select arbitrary tenant (tenant always created fresh or resumed from op), link an existing unrelated user **through the edge** (edge user id comes from `createUser` or op record — but op record ownership is not caller-checked, F4), force service-role behavior (no switch), override actor (audit uses `auth.uid()`), override status (statuses only written by edge/finalise; **no DB state-machine guard**, §18).

## 8. Auth User Creation Order

Root flow: validate → `isSuperadmin` check → op lookup → `createUser` → finalise. **Superadmin check occurs before user creation** — SAFE ORDER for root.
Child flow: validate → tenant-presence check (`!isSuperadmin && !callerTenantId` → 403) → op lookup → `createUser` → finalise (hierarchy + disabled-tenant checks **inside finalise only**).
→ **SAFE WITH COMPENSATION DEPENDENCY.** An attacker/member can create a temporary Auth user before the DB rejects an invalid hierarchy (F3 also means a *valid* hierarchy is never role-rejected).
- Compensation is deterministic for the created user (hard `deleteUser`, 404 treated success, op marked `compensated`/`compensation_pending`). Residual orphan windows: (a) process death between `createUser` and finalise → op stays `auth_user_created` with the user id; retry resumes, but if nobody retries an enabled-but-credential-less account remains; (b) `compensation_pending` retry **reuses the user without re-returning a password** (F9) — the account is then `completed` and permanently credential-less (no SMTP reset). Abuse of the child path with invalid parents creates repeated create/compensate churn but no lasting orphans when compensation succeeds.

## 9. Preflight Database Authorization

- **No DB-side authorization/reservation RPC exists before user creation.** The op-status lookup (edge) proves nothing about hierarchy/eligibility — it only reads an existing op row; a fresh key has no row.
- What is deferred to finalise: superadmin (root), hierarchy visibility, parent tenant existence/enabled, username uniqueness, org-type/name rules, org-tenant conflict.
- What is NOT enforced anywhere: **caller role** (F3). A `participant` with a tenant_id satisfies both the edge gate (`callerTenantId`) and the DB gate (`get_my_tenant_id() IS NOT NULL` + `is_org_visible(parent)`). Any member of any org can therefore create child organisations under any org in their visible tree and assign an arbitrary existing user id (via the legacy wrapper path) as the child 'admin'. **This is an authorization gap, not just a missing preflight.** A preflight RPC (authorize+reserve op before `createUser`) is required.

## 10. Auth User Ownership Proof

- `createUser` returns `user.id` → stored locally → `record_provisioning_event('auth_user_created', target_user_id)` → finalise. The user id is also passed to the DB and COALESCE-locked in the op row (`_provisioning_upsert_op` never overwrites an existing `target_user_id`).
- **Gaps found:**
  1. The edge reuse branch (`REUSABLE_STATUSES` + `existingOp.target_user_id`) **never checks `existingOp.requested_by === user.id`**. Any authenticated user who knows (or guesses) an operation_type + idempotency_key of another caller can claim that op's recorded user: their invocation reuses the victim's `target_user_id`; if their own hierarchy contains the parent, finalise links the victim-created user to the attacker's org, and the attacker's op write pins the user to the attacker's op. Idempotency keys are partially predictable (`root-${orgId}`, `child-${parentId}` service default), so this is a realistic confused-deputy/key-squatting vector. Root keys are superadmin-gated (lower risk); child keys are not.
  2. The DB finalise RPCs and the legacy 5-param `setup_child_organisation` wrapper **accept any `p_user_id`** with no proof that the user belongs to the operation or was created by the caller. The wrapper is granted to `authenticated` → a direct, edge-bypassing link of an arbitrary existing Auth user (F3/F17).
- Ownership state machine: No user → Created by this invocation (edge memory) → Stored in op (COALESCE-pinned) → Completed / Failed / Compensated. **Ambiguous transitions:** (i) `completed` op + different caller same key → edge returns stored result without proving the requester is the actor who may receive it (acceptable: no secret returned, but confirms existence — enumeration of org/tenant ids for key holders); (ii) `compensation_pending` → retry → `completed` **without password delivery** (F9); (iii) `failed` op without `target_user_id` + same key → new user created — safe.
- Pre-existing user deletion: structurally impossible — `createUser` errors on duplicate email, so the edge never captures a pre-existing user; compensation targets only the user created by this invocation/op. **Confirmed.**

## 11. Idempotency Guarantees

- DB guarantee: `UNIQUE(operation_type, idempotency_key)` on `tenant_provisioning_operations`; all writes via `_provisioning_upsert_op` with `ON CONFLICT DO UPDATE` (COALESCE-preserving) — single-row uniqueness is **database-backed**.
- What is NOT database-backed: uniqueness of tenant creation (no unique on `tenants.organisation_id` or `organisations.tenant_id`), org creation (no unique on `(parent_id, name)`), username (`organisations.admin_email` not unique), auth user (Auth API email unique — atomic, API-level).
- Scenario matrix:
  1. Same key, same caller → replay/resume; safe (with F9 caveat for compensation_pending resume).
  2. Same key, different caller → **owner-unchecked reuse (F4)**.
  3. Same key, different type → separate op rows (type in the key) — safe.
  4. Same email, different keys → both call `createUser`; one wins, loser 409 + `failed` op; loser never deletes winner's user — **safe at Auth-API level**, runtime-unverified.
  5. Same org, different keys → org-tenant conflict raises in finalise (second caller); no overwrite; safe non-concurrently.
  6. Same username, different keys → **TOCTOU**: both pass the `admin_email` collision check, both create orgs with the same `admin_email` (no constraint) → duplicate child orgs (Gemini's PARTIAL, confirmed).
  7. Two Edge instances, same key → both may pass op lookup before either writes; `ON CONFLICT` upsert serializes the op row but **not** the tenant/org/profile writes → duplicate tenants, last-writer-wins org link, orphan tenant possible (F7).
  8. Timeout after user creation → resume via op row; safe if retried.
  9. Timeout after finalise commit → retry hits `completed` replay; safe.
  10. Retry after compensation_pending → reuses user; finalise likely succeeds; **password lost** (F9).
- Classification: **PARTIAL BUT ACCEPTABLE** for security; **insufficient for strict duplicate-org prevention**.

## 12. Same-Email Concurrency

- Supabase Auth enforces unique identities atomically at `createUser`. Two concurrent calls → one success, one 409. Loser writes a `failed` op (no user) and returns 409 — never treats the winner's user as its own, never compensates the winner. The op table adds a second, independent guard on top (key-scoped).
- Cannot be fully proven without runtime testing, but the failure modes are benign (409 + retry with another email). The dangerous variant (loser finalises with winner's user) is prevented by the loser aborting on 409.
- Residual risk: **email existence oracle** and UX confusion only. Marked **PARTIAL** (runtime confirmation required for release confidence).

## 13. Same-Organisation Concurrency

- Org name: **not unique, not scoped by parent** (no constraint anywhere). Duplicate display names are structurally possible even single-threaded — that is a product-quality issue, not a security issue.
- Duplicate logical org: two concurrent same-key finalise runs can each `INSERT INTO tenants` and `INSERT INTO organisations` before the other commits (no `FOR UPDATE`, no unique constraints on `organisations.tenant_id` / `tenants.organisation_id`) → two tenants, two orgs, last-writer-wins `organisations.tenant_id` link, one org/tenant effectively orphaned. Profile link is COALESCE-idempotent per row; the second profile update is a no-op (tenant already set) or last-writer on `role`/`full_name`.
- Duplicate admin account: two same-key edge invocations both pass the empty op lookup; both call `createUser` with the *same synthetic email* → second gets 409 → aborts. So duplicate *accounts* are blocked by Auth; duplicate *orgs* are not.
- Classification: **PARTIAL** — no security breach, but orphan-row creation under concurrency is real; needs `SELECT ... FOR UPDATE` on the org row and/or unique constraints + advisory lock keyed on `(operation_type, idempotency_key)`.

## 14. Root Finalisation RPC

- Superadmin check first (`auth.uid()` + `is_superadmin()`) — yes, before any write.
- Org eligibility: `_provisioning_get_org` existence + "already linked to a tenant" conflict rejection; resume reuses op's tenant. Tenant creation deterministic (fresh uuid) and idempotent only via op resume — race window in §13.
- Profile: `_provisioning_link_profile` refuses superadmin targets, refuses tenant moves, fills only `tenant_id IS NULL` rows — sound.
- Existing Auth user linkage: only via op ownership (edge) — but the RPC itself cannot prove ownership (F10.2); a superadmin calling the wrapper directly can intentionally link any user id (Gemini acknowledges; it's a trusted-operator edge case, acceptable).
- Role: hard-coded `'admin'`, `is_superadmin false` — never parameterizable.
- Ordering: op upsert `completed` is last; all DB writes in one transaction — any raise rolls back everything including the op upsert (except the exception-handler `failed` upsert, which is intentionally outside the aborted transaction — note: that upsert runs in the same transaction? The `EXCEPTION WHEN OTHERS` block inside the function still executes within the same transaction as the failed statement — the failed statement is rolled back but the handler's upsert commits with the rest of the outer transaction. Since the exception handler writes the `failed` op before `RAISE`, and the caller (`callerClient.rpc`) sees an error, the whole transaction (including the `failed` op write) rolls back unless the caller committed... PostgREST wraps the RPC in a single statement; the function's exception block runs inside the same transaction, so the `failed` op write is **rolled back** on RAISE. Net: on finalise failure the op row is NOT written by the DB — it is written later by the edge's `recordEvent('compensated'|'compensation_pending')` (service role). Consistent, but the DB's `failed` handling is effectively inert. Minor design note; the edge compensation path covers it.
- Result contains no secrets (op jsonb, no password fields). `completed` can only be written after all links exist (single statement) — yes.

## 15. Child Finalisation RPC

- Disabled caller tenant: denied via `get_my_tenant_id() IS NULL` + explicit parent-tenant `access_disabled` check — yes (depends on 098 live; 098 reported live).
- Caller role: **not verified** (F3) — `participant` passes.
- Superadmin branch explicit (`IF NOT is_superadmin()`); superadmin still must pass parent existence/tenant checks.
- Hierarchy: `is_org_visible(p_parent_id)` (own tree or descendant, incl. transitive children — flexible by design). Siblings/above/unrelated denied. **Direct-child-only not enforced** (by design).
- Parent active/archived: **archived not checked** (F8) — `archived_at` is ignored by `is_org_visible` and by finalise; only tenant disable blocks. Provisioning under an archived-but-enabled parent is possible.
- Child type under parent type: no rule (unit under state etc. allowed) — matches existing flexible design; noted.
- Client cannot choose tenant: tenant always created fresh (or resumed from op). Profile receives the new child tenant only; parent org untouched (no update to parent except none). Existing child org cannot be stolen: `v_new_org_id` created only when absent; resume reuses op's own org.
- Username uniqueness: `EXISTS(organisations WHERE admin_email = p_username)` — only when creating a new org; **TOCTOU** + duplicate-usernames possible concurrently (F7).
- Synthetic email ↔ user determinism: email is derived in the edge from username+uuid — deterministic given (username, op); the DB never derives it. `organisations.admin_email` = username (not the email) — so the DB cannot map username → synthetic email; only the op row (service-side) holds both. **This is the root of F2.**

## 16. Archived/Disabled Hierarchy Handling

- Disabled tenant: covered (098 + 099 gates). Re-enable without admin account is reported by `enable_tenant_access` (TENANT_ENABLED_BUT_ADMIN_ACCOUNT_MISSING).
- Archived org: **NOT covered.** `archive_child_organisation` only sets `archived_at`; it does not disable the tenant; `is_org_visible`/`get_visible_organisations` do not filter `archived_at`; child finalise does not check it. C3's known limitation persists inside the C2 gate. Also: `_assert_organisation_hierarchy_access` (098) does not check archived status, so archiving is repeatable for archived orgs via `delete_child_organisation`? (out of C2 scope, but the same gap). Impact: new child orgs can be created under archived parents; parent list UI hides archived rows so this needs a crafted/API call — medium severity.

## 17. Legacy Wrapper Bypass Review

- Live (per Gemini + repo): `setup_tenant_records(uuid,uuid,text,text)` (authenticated) and `setup_child_organisation(uuid,uuid,text,text,text)` (authenticated) exist; the 6-param plaintext overload is dropped.
- `setup_tenant_records` → finalise root → **is_superadmin enforced inside** — no bypass.
- `setup_child_organisation` 5-param → finalise child → the same **role-less** gate. Any authenticated user with an enabled tenant and a visible parent can call it **directly, with an arbitrary `p_new_user_id`**, bypassing the edge entirely: no op ownership, no compensation, no Auth-side creation, no password (it links an *existing* account). This is **exactly the bypass class the audit brief calls a security issue even with role checks**; here there is no role check (F3). Severity: high-ish administrative escalation — a participant can promote any existing auth user (their own second account, another member, a leaked id) to 'admin' of a newly created child org/tenant.
- Conclusion: **legacy wrapper bypass is possible (YES)** for child provisioning; root is safe.

## 18. Provisioning Event Security

- `record_provisioning_event` and all `_provisioning_*` helpers: revoked from PUBLIC/anon/authenticated in SQL; live anon 404 probe for finalise corroborates the pattern. Service-role execution confirmed by design.
- It cannot be called by clients; cannot change `requested_by` (upsert COALESCE pins it); cannot replace `target_user_id` after first write (COALESCE); cannot attach arbitrary users except via its own parameters (service-role boundary).
- **No DB-enforced state machine:** statuses are validated against the CHECK list but transitions are not. A compromised/buggy edge could write `completed → failed` or `failed → completed` via `record_provisioning_event` (upsert allows any status swap). The edge code paths are benign; the DB does not defend this (defense-in-depth gap, low severity given the trust boundary).
- Sanitization: no free-text error stored in the op (`failure_code` only); no credentials ever passed to these functions — confirmed.

## 19. Profile Trigger and RLS

- `099` redefines `handle_new_user()`: new users get `role='participant'`, `is_superadmin=false`. No trigger path assigns `admin`; `admin` is assigned only by finalise `_provisioning_link_profile`.
- INSERT policy for own profile: dropped — new profiles come only from the trigger (SECURITY DEFINER, service context). **Note:** `handle_new_user` in 099 has **no `SET search_path`** (002's did not either; all identifiers are schema-qualified `public.profiles`, `auth.uid()`-free — risk minimal but the pattern is a hardening miss).
- UPDATE policy: own row, WITH CHECK locks `role`, `tenant_id`, `is_superadmin` to their current values via correlated subselects — sound against self-escalation, including via UPDATE ... RETURNING or full-row payloads (RLS WITH CHECK applies to the final row).
- Column privileges: none defined; RLS is the only gate — fine.
- No other later migration (093–098) creates profile policies; only `002` (public SELECT) and `011` (superadmin SELECT) remain alongside 099 — no broad override.
- Superadmin/provisioning RPCs: SECURITY DEFINER owner context — unaffected by RLS (bypass owner). Legit.
- Profile-edit UI (settings) updates `full_name`, `phone`, etc. — allowed by the policy; no repo client updates `role`/`tenant_id`/`is_superadmin` (verified: no `profiles.update` in `src/`).
- Live policy state: **not independently verified** (no authed runtime test); SQL-level verified.

## 20. Temporary Password Lifecycle

- Generation: `crypto.getRandomValues` 14 bytes over a 57-char alphabet (≈ 14×log2(57) ≈ 82 bits) — adequate.
- Transport: sent to Auth Admin `createUser`; held only in request-local memory; returned once on success when `createdUserInThisRequest`; not logged (console.error calls print only event names/messages, never password); not persisted (no column receives it).
- Frontend: stored in modal state (`tempPassword`) and in the React Query mutation cache/result (memory only); displayed once; modal reset on close/reopen. No clipboard auto-copy, no persistent storage, no crash-reporting integration found.
- **Breaks in:**
  1. Response loss after DB commit → account exists, password never delivered → **permanent lockout** (no SMTP, no reset UI, no admin reset tool in repo).
  2. Retry after `compensation_pending` → user reused, `createdUserInThisRequest=false` → `temporary_password: null` → success UI shows "account was created previously" with **no credentials** (tenants screen) — the account is real but nobody has the password.
  3. Mutation retry / browser refresh after success → key reused → `completed` replay → no password (correct, safe).
- Classification: **PARTIAL** (acceptable interim for happy path; the compensation_pending-resume case is a functional hole and lockout risk is real).

## 21. Internal Email and Child Login

- Live probe: `lookup_email_by_username` **exists** in the live DB (HTTP 200, `null` for an unknown username) but is **not defined in any migration** (unversioned; anon-executable — enumeration surface if it resolves real usernames).
- Login flow (`authService.resolveLoginEmail`): identifier without `@` → RPC lookup → on error throw; on `null` fall back to `` `${username}@sahi.local` ``.
- Actual child auth email is `` `${username}_${4-hex}@sahi.local` `` — **the fallback email can never match it** (uuid fragment). Correct login depends entirely on the live lookup RPC returning the *exact synthetic email* for an existing username. That requires the live function to map username → synthetic email (via `organisations.admin_email` → profile → ... but the synthetic email exists only in `auth.users.email` and op rows; `organisations.admin_email` stores the username only). Whether the live function implements that mapping is **unverifiable read-only and unsupported by repo evidence**.
- Even if the mapping exists: the child admin is never told their username or synthetic email by any UI (success alert shows only the temp password; the org table shows the username under "User ID" — visible to the parent admin, relayable).
- `.local` domain: syntactically accepted by Supabase Auth; un-routable — password reset impossible.
- **Classification: FUNCTIONAL BLOCKER risk (high likelihood) — child admins cannot reliably log in.** Gemini's "PRODUCT LIMITATION" is understated.

## 22. Root Admin Recovery

- Root onboarding: superadmin provides a real email; edge creates user with `email_confirm: true` + temp password; no SMTP invite. If the email belongs to someone else (mistype or deliberate), that person gains tenant-admin credentials — the "actor is authoritative" interim model; acceptable with superadmin trust, but no verification of email control.
- First-login password change: **not enforced** (no reset UI, no `expire password` flag). Temp password remains valid indefinitely unless rotated by an operator (no rotation tool found).
- Lost credentials → **no recovery path** in repo (no forgot-password UI; `SupabaseAuthProvider` has no `resetPasswordForEmail` usage; no admin reset tool). This mirrors the C1-era documented limitation; for root it is a product risk (superadmin can re-provision? No — root flow is keyed `root-${orgId}`; replay returns `completed` without a new password → **superadmin cannot recover the tenant admin's password either**; the only recovery is an out-of-band manual Auth admin reset).
- Classification: **PRODUCT RISK** (recovery impossible in-band; interim acceptable but must be documented to operators).

## 23. Frontend Service-Layer Flow

- One canonical adapter exists (`provisioningRepository.provision` → `functions.invoke('provision-admin')`); no direct privileged `auth.signUp` remains in `src/` (grep clean); no direct finalisation RPC calls from UI; old RPC payloads gone.
- Double-click: buttons disabled while pending (`disabled={isCreating}` / phase gates) — yes.
- Idempotency key lifecycle: root `root-${orgId}` stable; child per-form `child-${timestamp}-${random}` generated at modal open, reused on retry (mutation is `mutateAsync` with the same payload on Retry — but note the tenants screen Retry re-invokes `handleSave`, which re-sends the same email/key — correct; the admin screen has no explicit Retry button, only modal reopen → **new attemptKey** → new op — safe).
- Success not shown before DB completion: edge returns success only after finalise; UI claims success from the edge result — yes.
- Invalidation: `['childOrganisations', parentId]` and `['superadmin','tenants']` invalidated on success — yes.
- Temp password caching: only in mutation state (memory). Error mapping preserves `.message`; `operation_id` is available on the thrown error (`.operationId`) but **no UI surfaces it** for status lookup — minor.
- **Contract failure (F1):** the admin screen sends NO `username` for child ops; the edge rejects with 400 `INVALID_USERNAME`. The positive child flow can never complete from this UI.

## 24. Frontend Release Compatibility

- Migration 099 is **live**; old 6/7-key RPC payloads and the 6-param child overload are gone. Any currently deployed production build still calling `setup_tenant_records` (6 keys) or `setup_child_organisation` (7 keys) will fail **immediately** (PostgREST signature mismatch / function missing).
- No evidence in the repo of the deployed frontend build version; no deployment artifacts; Gemini states the new frontend was not deployed. Therefore, unless onboarding was already broken in the deployed build (it was broken pre-099 too — signature mismatches existed), the live window is: **old UI = broken onboarding**, **new UI = not yet shipped**.
- Recommendation: either ship the new frontend immediately or disable onboarding entry points (feature-flag) until release; do not leave a live DB change in a state where production UI hits guaranteed errors.

## 25. Secrets and Logs

- Service-role key: only `Deno.env` in the edge (repo); `.env.example` additions are placeholders (verified content: placeholder values, no real keys).
- **Hardcoded live credential in repo test scripts:** `test-c2.js` and `test-c2-rls.js` embed the project URL and an API key (`sb_publishable_...`). Publishable keys are public-by-design (not a secret requiring rotation), but embedding the live project ref in unversioned scripts is poor hygiene; flagged LOW.
- No DB password or JWT in test files (invalid-JWT string only). No temp passwords in code/logs. `console.error` prints event names and error messages only.
- Edge function logs: not reviewed (dashboard access unavailable) — Gemini marked UNCERTAIN; **still UNCERTAIN**.
- Prior session leaks: the brief states database credentials were previously exposed in commands; no values are repeated here. **Required action:** rotate any credential that appeared in shell history/transcripts (service-role key, DB password, anon JWT) — the publishable key alone is not sufficient reason for rotation, but the service-role key and any full anon JWT shown in past command transcripts should be rotated as a precaution.

## 26. Gemini Test Script Review

- `test-c2.js`: anon edge 401 (no header; invalid JWT) — **STRONG** for "anon denied" but the 401 for invalid JWT is produced by the edge's own `getUser` error branch (platform-verified token rejection — genuine).
- Direct RPC tests (anon, `{}` args): any argument mismatch yields PGRST202 **regardless of grants** — proves anon revocation, proves nothing about authenticated grants. Gemini's claim "confirming all execution grants restricted to authenticated" is an **overstatement** (authenticated grants exist and are callable — F3).
- Profile escalation test: anon UPDATE on a nonexistent uuid → 0 rows — **trivially true pre-099**; proves nothing about the authenticated self-update policy (the actual fix). **MISLEADING as evidence** for "profile escalation closed."
- Table select: anon → empty — consistent with RLS, harmless.
- `test-c2-rls.js`: repeats the two anon probes; no added value.
- Classification per claim: anonymous denied = STRONG; invalid JWT = STRONG; direct-RPC bypass = LIMITED (anon-only); profile escalation = MISLEADING; pre-existing user deletion = STRONG (code); password non-persistence = STRONG (code); positive flows = UNSUPPORTED.

## 27. Provisioning Status Security

- `status` op: ownership-checked (`op.requested_by !== user.id && !isSuperadmin` → 403) — sound.
- Leaks: returns `admin_email` (root: real email; child: synthetic email) and ids to the requester/superadmin only. For child ops the requester is the parent admin — synthetic email disclosure to the parent admin is by-design-consistent (they are the one who must relay credentials) but **no UI consumes it**.
- Temp password: never returned from status — yes.
- Enumeration: a requester can probe keys belonging to others → 403 vs 200-not-found differ — mild oracle for key ownership, requires guessing keys; LOW.
- `operation_type` for status comes from the body — scoped lookup, harmless.

## 28. Untested Positive Flow Risk

| Untested flow | Static confidence | Runtime dependency | Impact if broken | Release blocker |
|---|---|---|---:|---:|
| Root provisioning (superadmin) | High (order + gates sound) | Edge env, createUser, RLS | Onboarding fails or orphan | **Yes** (positive test required) |
| Child provisioning (UI) | **Guaranteed failure (F1)** | n/a | Feature non-functional | **Yes** |
| Child admin login (F2) | Low / unverifiable | Live unversioned RPC; synthetic email | Users locked out | **Yes** |
| Idempotency replay/resume | Medium | op table, upsert semantics | Duplicate/credential loss (F9) | Yes (for resume paths) |
| Concurrency (same key/email/org) | Medium | Auth API, PG isolation | Duplicate orgs/orphans | Yes |
| Compensation | Medium-high | Edge env, deleteUser | Orphan/blocked accounts | Yes |
| Disabled tenant provisioning | High (098 + gate) | 098 live | Access leak | No (static strong) |
| Hierarchy isolation with real roles | **Low (F3)** | live policies/grants | Org-chart tampering | **Yes** |
| Profile escalation (authenticated) | High (SQL) | live RLS | Privilege escalation | No (static strong) |
| Archived-parent provisioning (F8) | High (gap) | none | Inconsistent hierarchy | **Yes** (correction required) |

## 29. Issues Found

- **F1 (CRITICAL, functional):** child onboarding UI → edge contract omits `username`; edge returns 400 `INVALID_USERNAME`; the feature can never complete from the shipped UI.
- **F2 (CRITICAL, functional):** child admin login path unverifiable/broken — synthetic email never surfaced anywhere; repo defines no `lookup_email_by_username` (live unversioned copy exists, anon-executable); fallback email can never match the synthetic email.
- **F3 (HIGH, security):** no role check anywhere in child provisioning (edge + DB + legacy wrapper); any authenticated member with an enabled tenant can create child orgs and link arbitrary existing users as admins via the 5-param `setup_child_organisation` wrapper (edge-bypass).
- **F4 (MEDIUM, security):** idempotency-key ownership gap — edge reuses `target_user_id` without verifying the requester owns the op; predictable keys (`root-${orgId}`, `child-${parentId}`) enable key-squatting to redirect a victim org's admin account.
- **F5 (MEDIUM, security hygiene):** `organisations.admin_password_temp` column and legacy plaintext rows remain; both admin screens render/copy them.
- **F6 (MEDIUM, drift):** live edge function differs from reviewed repo source (error contract); `lookup_email_by_username` live-but-unversioned; no live catalog diff artifact exists.
- **F7 (MEDIUM, correctness):** no row locks/unique constraints for tenant/org creation; same-key concurrency can create duplicate tenants/orgs; duplicate child names and usernames possible (TOCTOU).
- **F8 (MEDIUM, correctness):** child provisioning permitted under archived-but-enabled parents.
- **F9 (MEDIUM, functional):** temp password delivery is not guaranteed — response-loss lockout; `compensation_pending` retry completes with no credentials; no recovery path (root and child).
- **F10 (LOW):** test scripts embed live project URL + API key; openapi.json empty; stray artifacts unversioned.
- **F11 (LOW, hardening):** `handle_new_user` SECURITY DEFINER without `SET search_path`; no DB-enforced op state-machine transitions.

## 30. Required Corrections

1. **F1:** add a `username` field to the child create modal (validated) and pass it through `provisionChildOrganisation`; or derive a deterministic username server-side from `org_name` and return it in the response for display.
2. **F2:** surface the synthetic email + username in the child success alert; add a versioned `lookup_email_by_username` migration (authenticated-only, same-tenant-scoped, with the correct mapping to the synthetic email) or switch child login to email-only with displayed email.
3. **F3:** enforce `role IN ('admin','admin_leader')` (or an explicit allow-list) in the edge gate AND in `finalise_child_organisation_provisioning`; restrict or drop the 5-param `setup_child_organisation` wrapper (authenticated direct finalise with arbitrary user ids); add op-ownership validation (`p_user_id` must equal the op's `target_user_id` and the caller must be the op's `requested_by`) inside finalise.
4. **F4:** in the edge, treat an existing op as reusable only when `existingOp.requested_by === user.id` (or superadmin); make child idempotency keys unguessable (server-side keys stored on the org) and validate them server-side.
5. **F5:** drop `admin_password_temp` display paths and NULL-out/remove the column in a reviewed migration (data-sanitisation step).
6. **F6:** redeploy the edge from the reviewed source; add a version marker; add the missing `lookup_email_by_username` migration or remove the unversioned live function; produce a live `pg_proc`/`information_schema` diff artifact.
7. **F7:** add `SELECT ... FOR UPDATE` on the parent/org row and/or an advisory lock keyed on `(operation_type, idempotency_key)`; add `UNIQUE (parent_id, name)` and unique `organisations.admin_email` where business-appropriate.
8. **F8:** reject provisioning under `archived_at IS NOT NULL` parents in `finalise_child_organisation_provisioning` (and align `_assert_organisation_hierarchy_access`).
9. **F9:** on resume of a `compensation_pending` op, either force password re-issuance (`updateUserById` with a new temp password, returned once) or mark the op invalid; document and provide an operator reset path (admin-only tool, reviewed).
10. **F10:** remove live credentials from test scripts (or use env-injected values); delete empty `openapi.json` or regenerate it.
11. **F11:** add `SET search_path = public` (or `''` with fully-qualified refs) to `handle_new_user`; consider a DB-side transition guard in `record_provisioning_event`/upsert (e.g., forbid `completed` → non-completed).
12. **Release window (F6/F20):** gate onboarding buttons until the corrected frontend is deployed; do not leave live DB 099 ahead of a UI that matches it.

## 31. Product Risks

- Permanent credential lockout (no SMTP, no reset UI, no admin reset tool) for both root and child admins; single point of failure is the one-time password display.
- Identity assumption: superadmin typing an email grants admin to whoever controls that mailbox; no verification.
- Duplicate/archived-parent provisioning creates confusing org charts that operators must clean manually.
- Synthetic `@sahi.local` accounts accumulate with no lifecycle/cleanup tooling.

## 32. Safe Positive-Test Plan (design only — not executed)

- **Targets:** dedicated test superadmin + one test parent tenant/admin + one normal member + one deliberately disabled test tenant; all inside a dedicated `TEST-` named org tree, with a unique domain suffix (e.g., `audit-<buildid>@<test-domain>`) and prefixed org names so records are identifiable and never touch real festivals.
- **Sequences:** (1) root: superadmin → onboard test org → assert user created, org/tenant/profile linked, op `completed`, audit row present, temp password delivered; verify sign-in with temp password; (2) child (after F1 fix): parent admin → create child → assert child admin can log in with username and with synthetic email; (3) idempotency: repeat identical payload → `completed` replay, auth-user count unchanged; (4) compensation: force finalise failure (e.g., pre-link the org to a tenant) → assert user deleted, op `compensated`; (5) same-key concurrency: two parallel identical requests → exactly one tenant/org/user; (6) same-email concurrency: two different keys, same email → one user, one 409; (7) disabled tenant: member of disabled tenant attempts child create → 403; (8) role test (after F3 fix): participant attempts child create → denied; (9) hierarchy: unrelated tenant attempts parent in another tree → denied; (10) archived parent (after F8 fix) → denied.
- **Verification:** auth-user counts via service-role query before/after; op rows via ops table; password non-persistence by SELECT of `organisations.*`, ops rows, profiles for any password-ish column.
- **Cleanup:** a **new, separately reviewed admin-only tool** (e.g., service-role script that deletes only rows tagged with the test marker) — not manual SQL deletes. Cleanup deletes test auth users (hard), their profiles, test orgs/tenants, and op rows with the test marker.

## 33. Frontend Release Decision

**FRONTEND RELEASE BLOCKED.**

- Child onboarding is guaranteed to fail (F1); child login is unverifiable/broken (F2); child provisioning lacks role authorization and the legacy wrapper bypasses the edge (F3); live edge drifts from reviewed source (F6); temp-password recovery holes exist (F9); archived-parent provisioning allowed (F8). The approval criteria "Child admins can actually log in", "Edge Function authorization occurs before dangerous side effects or compensation is sufficiently safe", and "Legacy wrappers cannot bypass the Edge Function" are **not met**.
- Root onboarding is structurally sound but cannot be validated without positive runtime tests and a matching live edge.
- Restriction would be insufficient at this state; corrections (§30) + the positive-test plan (§32) are prerequisites.

## 34. Final Verdict

**FAIL — BOTH SECURITY AND FUNCTIONALITY.**

- Security: role-less child authorization (F3), legacy wrapper bypass (F3), idempotency-key ownership gap (F4), live/repo edge drift (F6), archived-parent provisioning (F8).
- Functionality: child provisioning cannot complete from the UI (F1); child admins have no reliable login path (F2); credential recovery holes (F9); release-window breakage (F24).
- Gemini's verdict PASS (cross-check) and "BACKEND VERIFIED WITH DOCUMENTED LIMITATION" (deployment) are **not accepted**; the runtime evidence is anon-only, and its profile-escalation claim is misleading (§26).

## 35. Confirmation of No Changes

- No source file, migration, Edge Function, database object, Auth user, tenant, organisation, configuration, secret or script was created, edited, deployed, applied or deleted during this audit.
- The only writes performed: this report file. Live probes were anonymous, non-mutating HTTP requests returning 401/404/empty results (no rows created; `lookup_email_by_username` probe queried a non-existent username and returned NULL).
- `git status` at audit start and end are identical.

---

**ADVERSARIAL C2 SECOND AUDIT COMPLETED — NO IMPLEMENTATION OR DEPLOYMENT CHANGES PERFORMED**
