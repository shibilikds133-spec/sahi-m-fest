# OPEN CODE — Read-Only Analysis: Tenant Onboarding, Import RPC and Revoke Security

**Type:** Read-only parallel analysis (no files edited).
**Branch:** `main` | **Commit:** `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
**Date:** 2026-08-03

---

## 1. Repository State

- **Current branch:** `main`
- **Current commit:** `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
- **git status (modified, tracked):**
  - `src/app/judge/marks.tsx`
  - `src/lib/repositories/judgeRepository.ts`
  - `src/providers/database/DatabaseProvider.ts`
  - `src/providers/database/SupabaseDatabaseProvider.ts`
  - `src/services/judgeService.ts`
- **git diff --stat:** 5 files changed, +132 / −39 (all judge-task files above).
- **Untracked files:**
  - `supabase/migrations/093_secure_token_bound_judge_marks.sql`
  - `GEMINI_093_JUDGE_MARK_SECURITY_CROSS_CHECK.md`
  - `GEMINI_SCHEDULE_VENUE_RESULT_ACCESS_ANALYSIS.md`
  - `OPEN_CODE_JUDGE_MARK_SECURITY_IMPLEMENTATION_REPORT.md`
  - `UPDATED_PROJECT_REVALIDATION_REPORT.md`
  - `check-db2.js` (untracked scratch; not executed)
  - `openapi.json` (untracked scratch; not executed)
- **Highest migration number:** `093_secure_token_bound_judge_marks.sql` (untracked, parallel judge task). Highest *committed* migration: `092`.
- **Duplicate migration numbers present:** `082_judge_token_regeneration.sql` and `082_update_generate_token_rpc.sql` (pre-existing).

**Scope files overlap check:** No file in the assigned scope (tenant onboarding, imports, revoke, org setup, auth/username lookup) is modified or untracked. Judge-related changes belong to the parallel task. Result: **no overlap detected within assigned scope.**

## 2. Scope and Exclusions

**Analysed:** tenant onboarding (`setup_tenant_records`), superadmin tenant creation UI, child organisation creation (`setup_child_organisation`), tenant access revoke/delete (`revoke_tenant_access`, `delete_child_organisation`), username lookup/login (`lookup_email_by_username`, `authService`), participant/schedule import RPCs (`execute_*_import_chunk`), bulk unit assignment RPCs (`preview_/execute_/rollback_unit_assignment`), SECURITY DEFINER grants and caller validation, orphan auth-user risk.

**Excluded (per brief):** judge workflow, marks, schedules/venues/results RLS, festival calendar, points config, advancement, points attribution, any-festival, UI redesign.

## 3. Parallel Work Detected

Migration `093` and the judge portal/service/provider changes (section 1) belong to a concurrent judge-mark security task (Gemini/OPEN_CODE). They were not reviewed, not modified, and not treated as part of this analysis.

## 4. Tenant Creation Flow

```
Superadmin OnboardModal ((super)/tenants/index.tsx OnboardModal)
  └─ payload { p_org_id, p_org_name, p_org_type, p_admin_email, p_admin_pass }
  └─ superService.setupTenantRecords()  (src/services/superService.ts)
       ├─ isolated supabase client (persistSession:false)
       ├─ auth.signUp({ email: p_admin_email, password: p_admin_pass,
       │              options.data.full_name })           ← STEP 1: AUTH USER CREATED
       └─ superRepository.setupTenantRecords({...payload, p_user_id: signUp.user.id})
            └─ databaseProvider.setupTenantRecords(payload)
                 └─ supabase.rpc('setup_tenant_records', payload)   ← STEP 2: RPC
                      → 009_tenant_management_funcs.sql
                          1. reject if organisations[org_id].tenant_id IS NOT NULL
                          2. INSERT tenants(name=org_name, org_type) → v_tenant_id
                          3. UPDATE organisations SET tenant_id = v_tenant_id WHERE id = p_org_id
                          4. UPSERT profiles(id=p_user_id, role='admin', tenant_id=v_tenant_id)
                          5. RETURN success / EXCEPTION → success=false
```

**Effective RPC signature (`009`):** `setup_tenant_records(p_org_id uuid, p_user_id uuid, p_org_name text, p_org_type text)` — `SECURITY DEFINER`, `SET search_path = public`, no caller check, no `REVOKE`/`GRANT`.

**Result:** Step 1 always succeeds (auth user + `on_auth_user_created` profile row with `tenant_id NULL`). Step 2 fails because the payload contains `p_admin_email` and `p_admin_pass`, which are not parameters of the RPC; PostgREST returns a "function not found / parameter mismatch" error. **Tenant onboarding does not complete in the current code.** The frontend shows the raw error in an alert; the orphaned auth user remains (section 6).

## 5. Tenant RPC Parameter Comparison

| Frontend parameter (payload) | RPC parameter (009) | Type match | Required | Status |
| ---------------------------- | ------------------- | ---------- | -------- | ------ |
| `p_org_id` (org.id) | `p_org_id uuid` | uuid ↔ uuid (string) | yes | CONFIRMED (matches) |
| `p_org_name` (org.name) | `p_org_name text` | text | yes | CONFIRMED (matches) |
| `p_org_type` (org.org_type) | `p_org_type text` | text | yes | CONFIRMED (matches) |
| `p_user_id` (signup user id, added in service) | `p_user_id uuid` | uuid ↔ uuid | yes | CONFIRMED (matches) |
| `p_admin_email` | — (not a parameter) | n/a | n/a | CONFIRMED MISMATCH — extra param breaks PostgREST resolution |
| `p_admin_pass` | — (not a parameter) | n/a | n/a | CONFIRMED MISMATCH — extra param breaks PostgREST resolution |

Classification: **CONFIRMED** — the frontend does not exactly match the effective RPC signature; two extra parameters are passed. Auth signup uses `p_admin_email`/`p_admin_pass` correctly, but the subsequent RPC call fails.

## 6. Orphan Auth User Analysis

**What happens when auth signup succeeds but `setup_tenant_records` fails:**

- The `on_auth_user_created` trigger (migration `002`, `handle_new_user`) inserts `profiles(id=new.id, full_name, role='admin')` with `tenant_id = NULL` for every new auth user. So an orphaned, **active** login account is created.
- `superService.setupTenantRecords` does **not** delete or disable the user on RPC failure; it only throws, and the UI shows the alert.
- Result: **orphan auth user with no tenant.** The account can log in; `authService.getRequiredProfile` succeeds (profile exists), so login yields `tenant_id: null`, `role: 'admin'`, and the user lands in the portal with no tenant-scoped data and no ability to be onboarded again (the org has no tenant, so a retry would still hit the same RPC mismatch).
- There is **no retry-safe compensation** (no `auth.admin.deleteUser`, no disable flag, no transactional rollback of the signup).

**Safe remediation design (not implemented):**
1. Fix the RPC/frontend contract (see C2) so a failure is much less likely.
2. In the service, on RPC failure, attempt `supabase.auth.admin.deleteUser(signUpData.user.id)` (service-role) or call a new `cleanup_failed_onboarding(user_id)` RPC; wrap the whole flow so a partial-profile row is also removed.
3. Make the RPC `SECURITY DEFINER` + a strict-superadmin guard so it can be retried idempotently, and return a structured `{ success, error_code }` instead of raw `SQLERRM`.

## 7. Child Organisation Flow

```
Admin "Sub-Organisations" screen ((admin)/organisations/index.tsx)
  └─ useOrganisations.createOrganisation({orgName, orgType:'unit'})
  └─ organisationService.createSubOrganisation(parentId=myOrg.id, ...)
       ├─ generateCredentials(name) → username + pass (e.g. "unit_x" / "x2026")
       ├─ internalEmail = `${username}_${suffix}@sahi.local`
       ├─ signUpNewOrganisationUser(internalEmail, pass)   ← AUTH USER CREATED (isolated client)
       └─ setupChildOrganisation({
            parentId, newUserId, orgName, orgType, username, internalEmail, passwordTemp })
            └─ organisationRepository.setupChildOrganisation → rpc('setup_child_organisation', {
                 p_parent_id, p_new_user_id, p_org_name, p_org_type, p_username,
                 p_internal_email,          ← NOT a parameter
                 p_password_temp })
                 → 029_hybrid_participant_management.sql (overload of 013):
                    1. guard: is_superadmin() OR parent.tenant_id = get_my_tenant_id()
                    2. INSERT tenants (name, org_type, 'active')
                    3. INSERT organisations (tenant_id=new, parent_id=p_parent_id,
                       admin_email=p_username, admin_password_temp=p_password_temp)
                    4. UPDATE tenants SET organisation_id = new_org
                    5. UPSERT profiles(id=new_user_id, role='admin', tenant_id=new)
```

**Effective RPC signature (029, supersedes 013):** `setup_child_organisation(p_parent_id uuid, p_new_user_id uuid, p_org_name text, p_org_type text, p_username text, p_password_temp text)`.

**Result:** the frontend sends `p_internal_email`, which is not in the signature → PostgREST rejects → child onboarding fails after auth signup → **same orphan-user risk as tenant onboarding.** The UI's "Unit created securely..." success path never runs; the delete path calls a non-existent RPC (section 9).

**Duplicate-child protection:** none. No unique constraint on `(parent_id, name)`; creating the same child name twice yields two tenants/orgs. (P2.)

**Sibling/unrelated-parent protection:** `parent.tenant_id = get_my_tenant_id()` restricts children to orgs whose tenant equals the caller's tenant, so an unrelated tenant admin cannot create under another parent. However the check does **not** enforce `role='admin'` (any authenticated user whose profile shares the tenant can create children), and superadmin can create anywhere by design.

## 8. Child RPC Parameter Comparison

| Frontend parameter | RPC parameter (029) | Type match | Required | Status |
| ------------------ | ------------------- | ---------- | -------- | ------ |
| `p_parent_id` (parentId) | `p_parent_id uuid` | uuid | yes | CONFIRMED (matches) |
| `p_new_user_id` (newUserId) | `p_new_user_id uuid` | uuid | yes | CONFIRMED (matches) |
| `p_org_name` (orgName) | `p_org_name text` | text | yes | CONFIRMED (matches) |
| `p_org_type` (orgType) | `p_org_type text` | text | yes | CONFIRMED (matches) |
| `p_username` (username) | `p_username text` | text | yes | CONFIRMED (matches) |
| `p_password_temp` (passwordTemp) | `p_password_temp text` | text | yes | CONFIRMED (matches) |
| `p_internal_email` (internalEmail) | — (not a parameter) | n/a | n/a | CONFIRMED MISMATCH — extra param breaks PostgREST resolution |

Classification: **CONFIRMED** — one extra parameter (`p_internal_email`) breaks the call. (The `internalEmail` value is used only for the auth signup email; the RPC never needed it.)

## 9. Delete and Revoke Flow

Frontend actions and the RPCs they invoke:

| Action | Frontend call | RPC called | Exists? | SECURITY DEFINER | Caller check | Deletes auth identity? | Hard delete? | Reversible? |
| ------ | ------------- | ---------- | ------- | ---------------- | ------------ | ---------------------- | ------------ | ----------- |
| Superadmin revoke (tenants screen) | `superService.revokeTenantAccess(orgId)` → `rpc('revoke_tenant_access', {p_org_id})` | `revoke_tenant_access` (`010`) | **YES** | yes | **NO** | **YES** (`auth.identities`, `auth.users`) | **YES** (tenant record; org unlinked first) | **NO** |
| Delete child org (organisations screen) | `deleteOrganisation(orgId)` → `rpc('delete_child_organisation', {p_org_id})` | `delete_child_organisation` | **NO — not defined in any migration or function** | n/a | n/a | n/a | n/a | n/a |

**`revoke_tenant_access(p_org_id uuid)` details (010):**
- No superadmin/tenant check; no `REVOKE`/`GRANT` → default **PUBLIC EXECUTE** (anon included).
- Step order: (1) `UPDATE organisations SET tenant_id=NULL, admin_email=NULL, admin_password_temp=NULL`; (2) `DELETE auth.identities` + `DELETE auth.users` (cascades to profiles); (3) `DELETE tenants`.
- **Partial-failure hazard:** the function is not wrapped in a dedicated transaction; the `EXCEPTION WHEN OTHERS` handler swallows errors and returns `success=false`, but only the failing statement (usually the tenant `DELETE` when dependent festival data exists) is rolled back. The org unlink and the auth-user deletion performed earlier are **kept**. Outcome: admin login deleted, org disabled, but tenant row orphaned → inconsistent, irreversible state. The migration comment even acknowledges dependent data may block the tenant delete.
- No `delete`/`disable` distinction: revoke = hard-delete login + (attempt) delete tenant + unlink org. Festival data for the tenant is **not** deleted (tenant delete is blocked by FK when data exists), so the UI copy "and all associated tenant data permanently" is inaccurate — the data remains orphaned rather than deleted.

**Separation of concepts (per code, not unified):**
- Disable access: not offered (only hard revoke).
- Revoke login: performed via auth user deletion (irreversible).
- Delete organisation: only soft-unlink (tenant_id=NULL); org row remains.
- Delete tenant: attempted; usually fails silently on dependent data.
- Delete auth identity: performed.
- Delete festival data: **not** performed.

**`delete_child_organisation`:** the frontend `useOrganisations.deleteOrganisation` and `organisationService.deleteChildOrganisation` call `rpc('delete_child_organisation', {p_org_id})`, but no SQL file defines it. Delete always errors. (P1 functionality.)

## 10. Username Lookup Status

- Frontend: `SupabaseAuthProvider.lookupEmailByUsername` → `rpc('lookup_email_by_username', {p_username})`.
- `authService.resolveLoginEmail(input)`: if the identifier contains `@`, it is used as the email; otherwise it calls `lookup_email_by_username`. On RPC error it throws; on success-with-null it falls back to `${username}@sahi.local`.
- **RPC does not exist** in any migration or function. Therefore any username-only login throws the raw PGRST error.
- **Fallback:** full email login (`@`) works (child-org users get `${username}_${suffix}@sahi.local`; the `suffix` means the `username@sahi.local` fallback would not resolve them anyway).
- **Enumeration risk if it is ever added:** an RPC that maps username→email must be restricted (superadmin/own-context only), otherwise it leaks account emails.
- **Classification:** **P2 / NOT REQUIRED for current festival use** (email login is the working path; username login is a convenience the code attempts but never wired server-side).

## 11. Import RPC Inventory

| RPC | Migration | SECURITY DEFINER | PUBLIC execute (default, no REVOKE/GRANT) | Accepts tenant ID | Accepts festival ID | Caller verified | Reference ownership verified |
| --- | :-------: | :--------------: | :----------------------------------------: | :---------------: | :-----------------: | :-------------: | :--------------------------: |
| `execute_junior_import_chunk` | 058 | yes | yes | `p_tenant_id` | `p_festival_id` | no | no |
| `execute_senior_import_chunk` | 059 | yes | yes | `p_tenant_id` | `p_festival_id` | no | partial (item category SENIOR/SR/GN) |
| `execute_upper_primary_import_chunk` | 070 | yes | yes | `p_tenant_id` | `p_festival_id` | no | partial (item category UP/GN) |
| `execute_lp_import_chunk` | 071 | yes | yes | `p_tenant_id` | `p_festival_id` | no | partial (item by tenant+code only) |
| `execute_hs_import_chunk` | 071 | yes | yes | `p_tenant_id` | `p_festival_id` | no | partial (item by tenant+code only) |
| `execute_hss_import_chunk` | 071 | yes | yes | `p_tenant_id` | `p_festival_id` | no | partial (item by tenant+code only) |
| `execute_general_import_chunk` | 072 | yes | yes | `p_tenant_id` | `p_festival_id` | no | **no** (reuses client-supplied `participant_id` unchecked) |
| `execute_schedule_import_chunk` | 061 | yes | yes | `p_tenant_id` | `p_festival_id` | no | partial (item+venue scoped to festival, not tenant) |
| `preview_bulk_unit_assignment` | 056 | yes | yes | `p_tenant_id` | — | yes (`is_superadmin` OR `is_org_visible`) | partial |
| `execute_bulk_unit_assignment` | 056 | yes | yes | `p_tenant_id` | — | yes | partial |
| `rollback_unit_assignment` | 056 | yes | yes | — | — | **no** (batch ownership not checked) | partial |

## 12. Import Caller Authorization

For each import RPC, does it verify: `auth.uid()` exists · caller is superadmin · caller belongs to target tenant · festival belongs to tenant · org in permitted hierarchy · item belongs to festival · category belongs to festival · participant refs valid?

| RPC | uid | superadmin | tenant member | festival⊆tenant | org hierarchy | item⊆festival | category⊆festival | participant refs | Verdict |
| --- | :-: | :--------: | :-----------: | :-------------: | :-----------: | :-----------: | :---------------: | :--------------: | ------- |
| `execute_junior_import_chunk` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ (no category filter despite error text) | n/a (creates) | **UNSAFE** |
| `execute_senior_import_chunk` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | n/a | **UNSAFE** |
| `execute_upper_primary_import_chunk` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | n/a | **UNSAFE** |
| `execute_lp/hs/hss_import_chunk` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (item by tenant+code only) | ✗ | n/a | **UNSAFE** |
| `execute_general_import_chunk` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ (tenant+code) | ✗ | **✗ (reuses foreign participant_id)** | **UNSAFE** |
| `execute_schedule_import_chunk` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ (festival) | partial (GENERAL wildcard) | n/a | **UNSAFE** |
| `preview_bulk_unit_assignment` | uses `auth.uid()` | ✓ | ✓ (via `is_org_visible`) | n/a | ✓ | n/a | n/a | partial | **PARTIALLY SAFE** |
| `execute_bulk_unit_assignment` | ✓ | ✓ | ✓ | n/a | ✓ | n/a | n/a | partial | **PARTIALLY SAFE** |
| `rollback_unit_assignment` | ✓ | ✗ | ✗ (no batch ownership) | n/a | ✗ | n/a | n/a | n/a | **PARTIALLY SAFE** |
| `setup_tenant_records` | ✗ | ✗ | n/a | n/a | n/a | n/a | n/a | ✗ (trusts `p_user_id`) | **UNSAFE** |
| `revoke_tenant_access` | ✗ | ✗ | n/a | n/a | n/a | n/a | n/a | n/a | **UNSAFE** |
| `setup_child_organisation` | uses `get_my_tenant_id` | ✓/✓ | ✓ (parent tenant) | n/a | partial | n/a | n/a | n/a | **PARTIALLY SAFE** |

Key evidence: the `execute_*_import_chunk` bodies contain **no `auth.uid()`, no `is_superadmin()`, no `get_my_tenant_id()`** — they trust the client-supplied `p_tenant_id`/`p_festival_id` completely. The task's "do not accept `p_tenant_id` passed from client as sufficient" rule is violated.

## 13. SECURITY DEFINER Review (function-level findings)

| Function | SECURITY DEFINER | Explicit safe `search_path` | Schema-qualified refs | PUBLIC execute revoked | Caller identity/tenant/superadmin checked | Referenced entity relationships validated | Credential/tenant leakage |
| -------- | :--------------: | :-------------------------: | :--------------------: | :--------------------: | :---------------------------------------: | :---------------------------------------: | :-----------------------: |
| `setup_tenant_records` (009) | yes | `public` (not `''`) | mixed (profiles qualified; organisations/tenants not) | **no** | **no** | no | returns generic `SQLERRM` |
| `revoke_tenant_access` (010) | yes | `public` | mixed | **no** | **no** | no | n/a |
| `setup_child_organisation` (013/029) | yes | `public` | mixed | **no** | parent-tenant only; role not enforced | no dup-child guard; no org-type rule | returns generic `SQLERRM` |
| `execute_junior_import_chunk` (058) | yes | **none set** | yes (public.*) | **no** | **no** | item⊆festival only | returns row data incl. names of other tenants |
| `execute_senior_import_chunk` (059) | yes | **none set** | yes | **no** | **no** | item category partial | same |
| `execute_upper_primary_import_chunk` (070) | yes | **none set** | yes | **no** | **no** | item category partial | same |
| `execute_lp/hs/hss_import_chunk` (071) | yes | **none set** | yes | **no** | **no** | item by tenant+code (no festival) | same |
| `execute_general_import_chunk` (072) | yes | **none set** | yes | **no** | **no** | participant reuse unchecked | same |
| `execute_schedule_import_chunk` (061) | yes | **none set** | yes | **no** | **no** | item+venue⊆festival; not tenant | returns item names |
| `preview_bulk_unit_assignment` (056) | yes | `public` | yes | **no** | yes | partial | n/a |
| `execute_bulk_unit_assignment` (056) | yes | `public` | yes | **no** | yes | partial | n/a |
| `rollback_unit_assignment` (056) | yes | `public` | yes | **no** | **batch ownership not checked** | partial | n/a |
| `get_my_tenant_id` / `is_superadmin` (011/017) | yes | **none set** | yes | n/a (helpers) | n/a | n/a | returns caller-only data |

Notes:
- Import functions with **no `SET search_path`** rely on the caller's `search_path`. Table/function references are `public.`-qualified (lower risk), but a shared-schema hijack (e.g. `hashtext`, `jsonb_build_object` resolution) is not fully hardened. `SET search_path = ''` (fully qualified) is the recommended posture used elsewhere in the codebase (e.g. migration 093).
- Default `PUBLIC EXECUTE` is retained on every privileged function above because none of the defining migrations issue `REVOKE ALL ... FROM PUBLIC` + explicit `GRANT`.
- Error messages leak `SQLERRM` (may include constraint/FK details) to callers; the general import already logs per-row `SQLERRM` into `v_errors` returned to the client.

## 14. Repository vs Live Supabase Status

- **Live catalog access:** not used. No Supabase CLI/psql, no credentials consumed. The untracked `check-db2.js` / `openapi.json` scratch artifacts were not executed or inspected for secrets.
- **Classification:** **UNABLE TO VERIFY** (no live catalog access). Prior repo docs (`DATABASE_RUNTIME_VERIFICATION_REPORT.md`) also mark `setup_tenant_records`, `revoke_tenant_access`, `setup_child_organisation` as **Unverified** against the live DB. Treat repository definitions as authoritative only until a live `information_schema`/`pg_proc` diff is run.

## 15. Confirmed Functional Problems

1. **Tenant onboarding broken** — `setup_tenant_records` frontend/RPC parameter mismatch (two extra params). Onboarding fails after auth signup. (P1)
2. **Child org creation broken** — `setup_child_organisation` frontend/RPC mismatch (one extra param). (P1)
3. **Delete child org always fails** — `delete_child_organisation` RPC is not defined anywhere. (P1)
4. **Username login broken** — `lookup_email_by_username` RPC is not defined anywhere; username-only login throws. Email login works. (P2)
5. **Hardcoded tenant/festival IDs in the app** — import screens fall back to `tenant_id = authTenantId || '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'`; `import.tsx` hardcodes `festivalId = '550e8400-e29b-41d4-a716-446655440000'`; `DevConfig.tenant_id` repeats the same UUID. Data can be written under the wrong tenant if the session tenant is missing. (P2)
6. **`revoke_tenant_access` partial-failure state** — org unlink + auth-user deletion persist even when the tenant delete fails, leaving an orphaned tenant row. (P1)
7. **Junior import category validation gap** — the item query has no JUNIOR category filter although the error message claims one. (P2)

## 16. Confirmed Security Problems

1. **`revoke_tenant_access` — PUBLIC-executable destructive wipe (P0).** No caller check, default PUBLIC execute. Any caller (including anonymous) who knows an `org_id` can delete that org's admin auth user, unlink the org, and attempt tenant deletion. Irreversible.
2. **`setup_tenant_records` — PUBLIC-executable privilege linking (P0).** Any caller can create a tenant, attach any org (`p_org_id`) and promote any user id (`p_user_id`) to admin of that tenant (org-takeover / account-promotion vector).
3. **All eight `execute_*_import_chunk` RPCs — PUBLIC-executable cross-tenant writes (P0).** No caller/tenant/festival verification; client-controlled `p_tenant_id`/`p_festival_id`; injects participants/registrations/schedules into arbitrary tenants; `execute_general_import_chunk` also reuses arbitrary `participant_id` values (foreign reference contamination).
4. **`rollback_unit_assignment` — cross-tenant rollback (P1).** Batch ownership is never verified; any caller with a batch id can revert another tenant's reassignment (participants/registrations rewritten to old units).
5. **Hardcoded superadmin credentials in migration 008 (P1).** Plaintext email `shibilikds938@gmail.com` + password `m1o2n3u4` are committed; if applied to a live DB the "Ultimate Admin" account uses a known password.
6. **Plaintext temporary passwords stored and displayed (P1/P2).** `organisations.admin_password_temp` is stored in plaintext, selected by `listTenantAccounts` and `getChildOrganisations`, and shown/copied in the superadmin detail modal and the child-org table (RLS limits who can read, but exposure to the client and `SQLERRM`-style leakage remain).
7. **`profiles` has a PUBLIC SELECT policy (P1).** Migration 002 "Public profiles are viewable by everyone" lets anonymous callers enumerate all profiles (full_name, role, tenant_id).
8. **Import/setup/revoke PUBLIC execute retained (P1).** No `REVOKE`/`GRANT` anywhere for these functions; defense-in-depth requires authenticated-only + superadmin/tenant checks inside.
9. **`setup_child_organisation` role not enforced; duplicate children allowed (P2).** Any authenticated user sharing the parent's tenant can create children (role check absent); no unique `(parent_id, name)` guard.
10. **`get_my_tenant_id` / `is_superadmin` lack `SET search_path` (P2).** Hardening gap (bodies are qualified, low risk).
11. **Superadmin route group has no guard (P2).** `(super)/_layout.tsx` is a bare Stack; access relies on client navigation and (currently open) RPCs.

## 17. Product Decisions Required

1. Onboarding contract: keep the "client signup → RPC links records" pattern (then fix parameters + add orphan compensation), or move to a server-side onboarding RPC that creates auth users via `auth.admin` (cleaner, but changes flow).
2. Revoke semantics: hard-delete (current) vs soft-disable (recommended). Confirm whether festival data should ever be deleted.
3. Whether username login is required at all for the 2026 festival; if not, remove the code path and surface email login.
4. Whether import must be restricted to the logged-in tenant admin only, or whether superadmin bulk-import across tenants must remain.
5. Whether `admin_password_temp` should be stored hashed or replaced by a one-time set-password link.
6. Acceptable handling of the legacy hardcoded superadmin account (rotate immediately if the migration ran on a live DB).

## 18. C1 — Import RPC Authorization

- **Objective:** make all `execute_*_import_chunk` RPCs caller-authorised: `auth.uid()` must exist, caller must be superadmin or a member of `p_tenant_id` (via `get_my_tenant_id()`/`get_my_org_id()`), `p_festival_id` must belong to `p_tenant_id`, items/categories/venues must belong to the festival, and reused participant ids must belong to the tenant/festival. Add `SET search_path = ''` (schema-qualified) and `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`.
- **Likely files:** `supabase/migrations/058/059/061/070/071/072` (new hardening migration replacing these functions), plus `src/providers/database/SupabaseDatabaseProvider.ts` only if signatures change (prefer unchanged signatures).
- **Dependencies:** none at DB level; depends on the frontend continuing to pass its own `tenant_id`.
- **Risks:** superadmin cross-tenant bulk import must be explicitly allowed; tenant admin imports into child-unit tenants (`targetOrg.tenant_id`) must be covered by the hierarchy check (`get_visible_organisations`), not just strict equality.
- **Required tests:** #10, #11, #12, #13, #14, #15.
- **Independent:** yes.

## 19. C2 — Tenant and Child Onboarding Consistency

- **Objective:** fix the frontend/RPC parameter mismatches (`setup_tenant_records`, `setup_child_organisation`), add orphan-user compensation (delete/disable the signup user and any partial profile on RPC failure), enforce `role='admin'` on child creation, and add a duplicate-child-name guard.
- **Likely files:** `src/services/superService.ts`, `src/services/organisationService.ts`, `src/lib/repositories/organisationRepository.ts`, `src/providers/database/SupabaseDatabaseProvider.ts`, plus a new migration hardening the two RPCs (superadmin guard for `setup_tenant_records`) and optionally an `onboarding_cleanup` RPC.
- **Dependencies:** product decision #1; depends on C1 only in that both touch `supabase/migrations`.
- **Risks:** removing the extra frontend params changes only the RPC call; ensure auth signup still uses `p_admin_email`/`p_admin_pass` (they must stay on the service call, not the RPC payload).
- **Required tests:** #1, #2, #3, #4, #5, #6, #18.
- **Independent:** yes.

## 20. C3 — Revoke/Delete Safety

- **Objective:** add a superadmin-only guard to `revoke_tenant_access`, wrap the operation in a transaction (or compensate in `EXCEPTION`), decide hard-delete vs disable (default: disable login + unlink org; leave festival data intact; optional soft-delete flag), and either implement `delete_child_organisation` (scoped to superadmin or parent-tenant admin, transactional, non-destructive by default) or remove the frontend call and hide the button.
- **Likely files:** `supabase/migrations` (new hardening/implementation migration), `src/app/(super)/tenants/index.tsx`, `src/app/(admin)/organisations/index.tsx`, `src/lib/repositories/organisationRepository.ts`.
- **Dependencies:** product decision #2.
- **Risks:** existing orphaned tenants need reconciliation; deleting auth users is irreversible, so prefer disable-first.
- **Required tests:** #7, #8, #9, #15.
- **Independent:** yes.

## 21. C4 — Username Lookup (only if still needed)

- **Objective:** if username login is kept, add `lookup_email_by_username(p_username text)` as a SECURITY DEFINER, `authenticated`-only (or superadmin), returning the email only when the caller's tenant matches the user's profile tenant, or for superadmin; do not expose it to anon (enumeration risk). If dropped, remove `resolveLoginEmail`'s RPC branch and surface email-only login.
- **Likely files:** new migration + `src/providers/auth/SupabaseAuthProvider.ts`, `src/services/authService.ts`.
- **Dependencies:** product decision #3.
- **Risks:** account-enumeration via username→email; avoid any PUBLIC grant.
- **Required tests:** enumeration-negative test (foreign username returns no email), #15.
- **Independent:** yes.

## 22. Required Tests

1. Superadmin can create a tenant (end-to-end, incl. param contract).
2. Normal tenant admin cannot create an unrelated tenant (`setup_tenant_records` guard).
3. Failed tenant setup does not leave an active orphan user (compensation check).
4. Parent admin can create a valid child organisation.
5. Sibling admin cannot create under another parent (negative).
6. Child setup parameter names match the RPC.
7. Missing child-delete RPC is clearly handled (or implemented, then exercised).
8. Revoke cannot be called by unrelated tenant users (or anon).
9. Revoke does not accidentally delete festival data.
10. Import rejects a foreign tenant ID (caller not member of `p_tenant_id`).
11. Import rejects a foreign festival ID (festival not in caller tenant).
12. Import rejects foreign item/category/organisation/participant IDs.
13. Valid own-tenant import succeeds.
14. Superadmin import behavior is explicit (documented + tested).
15. PUBLIC cannot execute privileged import/setup/revoke RPCs (`EXECUTE` matrix test).
16. Live RPC definitions match repository migrations (catalog diff).
17. No plaintext credentials logged or committed (static scan incl. migrations, UI labels).
18. Failed multi-step onboarding is safely compensated (rollback profile + auth user).

## 23. Recommended Implementation Order

1. **C1 — Import RPC authorization** (largest P0 surface, self-contained). Restrict execute to `authenticated`, add caller/tenant/festival/reference checks. Do this before any new imports go live.
2. **C3 — Revoke/delete safety** (P0 destructive + P1 partial-failure). Superadmin guard + transactional + disable-first. Implement or remove `delete_child_organisation`.
3. **C2 — Onboarding consistency + orphan prevention** (P1 functionality + P0 orphan). Fix parameters, add compensation, enforce admin role.
4. **C4 — Username lookup** (P2) only if product keeps username login; otherwise remove the code path.
5. Rotate the hardcoded superadmin account and stop storing/displaying plaintext temp passwords as part of C2/C3 cleanup.

## 24. Confirmation of No Changes

- No source, migration, database, or configuration changes were made.
- No `setup_*`, `revoke_*`, `delete_*`, `execute_*`, `lookup_*` function was created or altered.
- No migration number was assigned; no SQL was written.
- No formatter, package install, git operation, or credential access occurred.
- Untracked artifacts (`check-db2.js`, `openapi.json`, the parallel judge-task migration/reports) were left untouched.
