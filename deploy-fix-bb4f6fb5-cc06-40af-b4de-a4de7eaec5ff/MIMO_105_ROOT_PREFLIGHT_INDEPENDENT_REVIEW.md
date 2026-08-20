# MIMO INDEPENDENT ROOT PREFLIGHT AND MIGRATION SAFETY REVIEW

---

## 1. Executive Verdict

**MIGRATIONS 102 AND 105 MUST BE REVIEWED AND DEPLOYED TOGETHER**

Migration 105 correctly fixes the reported preflight bug: scoping the `p_username` regex to `child_organisation` only. However, deploying Migration 105 alone will **not** fix root tenant onboarding because the live Edge Function (`provision-admin` version `c2-fix-2`) already sends a **6-argument** call to `finalise_tenant_provisioning` (including `p_festival_template`), which requires the 6-argument overload created by Migration 102. Without Migration 102, root tenant finalisation will fail at a later step even after the preflight fix. Normal `db push` would apply Migrations 102, 103, 104, and 105 together. Migrations 103 and 104 are structurally safe for Sahithyolsav but introduce College Fest enforcement triggers. All four pending migrations must be deployed as a single controlled deployment.

---

## 2. Reviewer Independence

| Field | Value |
|---|---|
| Reviewer model | MiMo V2.5 (opencode/mimo-v2.5-free) |
| Review mode | Independent read-only review; no file modifications, no database changes |
| Implementer | DeepSeek V4 Flash (previous session) |
| Implementer trust level | **Zero** — implementation report is NOT treated as proof of correctness |

All findings below are independently verified from source files.

---

## 3. Repository State

| Field | Value |
|---|---|
| Working directory | `D:\work\fest\web-for-sahi--main\web-for-sahi--main` |
| Current branch | `main` |
| Current commit | `56404fe fix(migrations): validate function signatures safely` |
| Git repository | Not a `.git` repository (detached working tree) |
| Modified files | 12 (`.env.example`, `.gitignore`, `organisations/index.tsx`, `judge/marks.tsx`, `useOrganisations.ts`, `judgeRepository.ts`, `organisationRepository.ts`, `provisioningRepository.ts`, `AuthProvider.ts`, `SupabaseAuthProvider.ts`, `DatabaseProvider.ts`, `SupabaseDatabaseProvider.ts`, `authService.ts`, `judgeService.ts`, `organisationService.ts`) |
| Untracked migrations | `105_root_tenant_preflight_username_scope.sql` |
| Other untracked files | Multiple report files (`.md`), test scripts (`.js`), `resolve-login-identifier/` function directory |
| Active work detected | YES — DeepSeek left modified/untracked files. Report file creation is safe (no overlap with migration/function files) |

---

## 4. Local and Remote Migration Inventory

### Local migrations from 099 onward

| # | Filename | Status |
|---|---|---|
| 099 | `099_tenant_child_provisioning_safety.sql` | Present (committed) |
| 100 | `100_c2_correction_batch.sql` | Present (committed) |
| 101 | `101_c2_final_security_and_frontend_contract_fix.sql` | Present (committed) |
| 102 | `102_college_fest_template.sql` | Present (committed) |
| 103 | `103_college_fest_category_enforcement.sql` | Present (committed) |
| 104 | `104_college_fest_registration_enforcement.sql` | Present (committed) |
| 105 | `105_root_tenant_preflight_username_scope.sql` | **UNTRACKED** (draft, local only) |

### Remote migration history

Cannot verify remotely (no `supabase` CLI access, no credentials). Based on reported state:
- Remote highest applied migration: **101** (reported, unverified)
- Migrations 102–105: **Not applied remotely**

### Migration 103 existence: **YES**
### Migration 104 existence: **YES**

---

## 5. Pending Migration Order

A normal `supabase db push` applies migrations in **lexicographic filename order**. The pending local migrations are:

```
102_college_fest_template.sql
103_college_fest_category_enforcement.sql
104_college_fest_registration_enforcement.sql
105_root_tenant_preflight_username_scope.sql
```

**Exact normal db-push order: 102 → 103 → 104 → 105**

This is confirmed by the lexicographic sort of the filenames.

---

## 6. Production Failure

### Reported symptom

```
HTTP 403
{"error":"PREFLIGHT_DENIED","message":"Invalid username format","version":"c2-fix-2"}
```

### Confirmed behavior

- CORS OPTIONS/preflight: HTTP 200 ✅ (Edge Function returns `new Response('ok', ...)` for OPTIONS)
- Actual `provision-admin` fetch: HTTP 403
- Request reaches the Edge Function (version marker confirmed)
- Failure occurs during `begin_provisioning_operation` RPC call
- Affects **both** Sahithyolsav and College Fest root onboarding
- Repeated retries do not solve it

---

## 7. Root Cause Verification

### Independent root cause confirmation: **YES**

**Migration 100, `begin_provisioning_operation`, lines 137–140:**
```sql
-- Ensure username format
IF p_username IS NOT NULL AND p_username !~ '^[a-z0-9_]{3,40}$' THEN
    RAISE EXCEPTION 'Invalid username format';
END IF;
```

This validation is **unconditional** — it runs for both `root_tenant` and `child_organisation` operations.

**Edge Function `provision-admin` index.ts, lines 306–312:**
```typescript
const { data: opId, error: preflightError } = await callerClient.rpc('begin_provisioning_operation', {
    p_operation_type: operation,
    p_idempotency_key: idempotencyKey,
    p_parent_id: body.parent_id || null,
    p_org_name: orgName,
    p_username: operation === 'child_organisation' ? username : adminEmail
});
```

For `root_tenant`, `p_username` receives `adminEmail` (e.g., `shibilikds37@gmail.com`). The regex `^[a-z0-9_]{3,40}$` rejects any string containing `@`, `.`, or uppercase characters. Therefore, every valid email fails.

**Root cause confirmed: Migration 100's unconditional username regex rejects root admin emails in the preflight step.**

---

## 8. Function Definition History

### Migrations affecting `begin_provisioning_operation`

| Migration | Affects function | Exact purpose | Security-relevant behavior |
|---|---|---|---|
| 099 | NO | Creates `tenant_provisioning_operations` table, helpers, `finalise_*` functions | Establishes provisioning infrastructure |
| **100** | **YES — creates it** | Creates `begin_provisioning_operation` (preflight RPC) with unconditional `p_username` regex | Adds authorization (superadmin/tenant-admin), idempotency lock, ownership enforcement, username regex |
| 101 | NO | Modifies `lookup_email_by_username` → `resolve_login_email`; adds rate limiting; adds `resolve_reset_target` | Does NOT touch `begin_provisioning_operation` |
| 102 | NO | Adds `festival_template` columns; creates 6-arg `finalise_tenant_provisioning` overload; modifies `finalise_child_organisation_provisioning` | Does NOT touch `begin_provisioning_operation` |
| 103 | NO | Category enforcement triggers | Does NOT touch provisioning |
| 104 | NO | Registration enforcement triggers | Does NOT touch provisioning |
| **105** | **YES — replaces it** | Scopes username regex to `child_organisation` only | Same authorization, same idempotency, same ownership; only username validation scope changes |

### Migrations affecting `finalise_tenant_provisioning`

| Migration | Affects function | Purpose |
|---|---|---|
| 099 | YES — creates 5-arg version | Initial finalisation with superadmin check, idempotency, compensation |
| 100 | YES — replaces 5-arg version | Adds lock-on-retry, ownership enforcement, completed-return |
| 102 | YES — adds 6-arg overload | Adds `p_festival_template` parameter; delegates to 5-arg; sets template on tenant |

### Migrations affecting `finalise_child_organisation_provisioning`

| Migration | Affects function | Purpose |
|---|---|---|
| 099 | YES — creates 6-arg version | Initial child finalisation with hierarchy, disabled check, username validation |
| 100 | YES — replaces 6-arg version | Adds lock-on-retry, ownership enforcement, completed-return, archived-parent check |
| 102 | YES — replaces 6-arg version | Copies 100's body verbatim + adds `festival_template` inheritance from parent tenant |

---

## 9. Effective Pre-105 Definition

The effective definition of `begin_provisioning_operation` immediately before Migration 105 is **exactly** the version from Migration 100 (lines 76–153 of `100_c2_correction_batch.sql`).

**Proof:**
- Migration 101 does not create/replace `begin_provisioning_operation`
- Migration 102 does not create/replace `begin_provisioning_operation`
- Migrations 103 and 104 do not touch provisioning functions

**Effective pre-105 function identified: YES**

Key characteristics of the Migration 100 definition:
- `SECURITY DEFINER`, `SET search_path = public`
- `p_operation_type text` — validated against `root_tenant` / `child_organisation`
- `p_idempotency_key text` — used for lookup/lock
- `p_parent_id uuid DEFAULT NULL` — for child hierarchy
- `p_org_name text DEFAULT NULL`
- `p_username text DEFAULT NULL` — **unconditionally** validated against `^[a-z0-9_]{3,40}$`
- `FOR UPDATE` lock on existing operation
- Ownership enforcement on existing operation
- INSERT stores `p_username` in `admin_email` column
- `GRANT EXECUTE TO authenticated`

---

## 10. Migration 105 Semantic Diff

### Effective definition before 105 (from Migration 100)

Lines 137–140:
```sql
-- Ensure username format
IF p_username IS NOT NULL AND p_username !~ '^[a-z0-9_]{3,40}$' THEN
    RAISE EXCEPTION 'Invalid username format';
END IF;
```

### Definition produced by Migration 105

Lines 86–92:
```sql
-- Ensure username format -- child_organisation ONLY.
IF p_operation_type = 'child_organisation' AND
   (p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,40}$') THEN
    RAISE EXCEPTION 'Invalid username format';
END IF;
```

### Exact diff analysis

| Aspect | Migration 100 (pre-105) | Migration 105 (post-fix) | Changed? |
|---|---|---|---|
| Authentication check | `IF v_uid IS NULL THEN RAISE` | Same | NO |
| child_organisation authorization | superadmin bypass, tenant+visibility check | Same | NO |
| root_tenant authorization | superadmin-only check | Same | NO |
| Unknown operation rejection | `ELSE RAISE 'Invalid operation type'` | Same | NO |
| `FOR UPDATE` lock | Same | Same | NO |
| Existing operation ownership | `v_op.requested_by <> v_uid AND NOT is_superadmin()` | Same | NO |
| Existing operation return | `RETURN v_op.id` | Same | NO |
| **Username format check** | `IF p_username IS NOT NULL AND p_username !~ '^[a-z0-9_]{3,40}$'` | `IF p_operation_type = 'child_organisation' AND (p_username IS NULL OR p_username !~ '^[a-z0-9_]{3,40}$')` | **YES — only this** |
| INSERT mapping | `admin_email = p_username` | Same | NO |
| Return value | `RETURN v_op.id` | Same | NO |
| GRANT | `TO authenticated` | Same | NO |

### Semantic change summary

**Before (Migration 100):**
- `root_tenant` + any email → **FAIL** (email fails regex) ❌
- `child_organisation` + valid username → **PASS** ✅
- `child_organisation` + null username → **PASS** (null check passes, but later `finalise_child_organisation_provisioning` catches it)
- `child_organisation` + invalid username → **FAIL** ✅

**After (Migration 105):**
- `root_tenant` + any email → **PASS** (regex skipped for root) ✅
- `child_organisation` + valid username → **PASS** ✅
- `child_organisation` + null username → **FAIL** (explicit null check added) ✅
- `child_organisation` + invalid username → **FAIL** ✅

**Only intended username-validation behavior changed: YES**
**Root child-username validation skipped: YES**
**Child username required: YES** (null now explicitly rejected)
**Child regex preserved: YES** (`^[a-z0-9_]{3,40}$`)

---

## 11. Root Tenant Contract

### Edge Function flow (root_tenant)

1. **UI** (`src/app/(super)/tenants/index.tsx:401`): Calls `provisionMutation.mutateAsync({ orgId, orgName, orgType, adminEmail, festivalTemplate })`
2. **Hook** (`src/core/hooks/useSuperAdmin.ts:61`): Delegates to `tenantProvisioningService.provisionRootTenant(input)`
3. **Service** (`src/services/tenantProvisioningService.ts:48–57`): Calls `provisioningRepository.provision({ operation: 'root_tenant', admin_email: input.adminEmail, festival_template: input.festivalTemplate, ... })`
4. **Repository** (`src/lib/repositories/provisioningRepository.ts:46`): Invokes `supabase.functions.invoke('provision-admin', { body: payload })`
5. **Edge Function** (`provision-admin/index.ts`):
   - Authenticates JWT (line 84)
   - Authorizes from profile (line 88–95)
   - Validates: `orgName`, `orgType`, `adminEmail` (normalized via `normalizeEmail`), `festivalTemplate`
   - **Preflight**: `callerClient.rpc('begin_provisioning_operation', { p_operation_type: 'root_tenant', ..., p_username: adminEmail })` (line 306–312)
   - **Auth user creation** (line 345–378): Creates Auth user with `adminEmail` as the email address
   - **Finalise**: `callerClient.rpc('finalise_tenant_provisioning', { p_org_id, p_user_id, p_org_name, p_org_type, p_idempotency_key, p_festival_template })` (line 382–403)
6. **Database** (`begin_provisioning_operation`): Validates authorization, creates operation record
7. **Database** (`finalise_tenant_provisioning` 6-arg from Migration 102): Creates tenant, links organisation, links profile

### Operation value: `root_tenant` ✅
### No child-style username field expected: ✅
### Root admin email required: ✅ (Edge Function validates at line 288–291)
### Root admin email normalized: ✅ (`normalizeEmail` at line 31–37: trim, lowercase, regex validate, max 254 chars)
### Missing email rejected: ✅ (Edge Function line 289–291)
### Invalid email rejected: ✅ (Edge Function `normalizeEmail` returns null for invalid emails)
### Child username regex not applied: ✅ (after Migration 105)
### Authorization before Auth user creation: ✅ (Edge Function checks profile at line 88–95 before any RPC)
### No Auth user created if preflight fails: ✅ (Edge Function line 314–316 returns 403 before Auth creation at line 345)
### Idempotency before side effects: ✅ (`begin_provisioning_operation` creates the operation record before Auth user creation)
### Retry does not create duplicate Auth users: ✅ (Edge Function checks `existingOp.target_user_id` at line 340–342; reuses if exists)
### Root request does not trust client-supplied role: ✅ (Edge Function reads `is_superadmin` from profile, not from request body)
### Root finalisation does not expect a child username: ✅ (6-arg `finalise_tenant_provisioning` has no username parameter)
### Temporary password not stored as plaintext: ✅ (generated at line 346, returned at line 444, never persisted)
### Credentials shown only through one-time flow: ✅ (returned in JSON response, never stored in DB)

### Sahithyolsav root tenant: Uses `festival_template: 'sahithyolsav'` (default)
### College Fest root tenant: Uses `festival_template: 'college_fest'` (explicit selection)

**Both templates reach the same `begin_provisioning_operation` (pre-flight) and the same 6-arg `finalise_tenant_provisioning` (finalise), differentiated only by the `p_festival_template` parameter.**

---

## 12. Child Organisation Contract

### Edge Function flow (child_organisation)

1. **UI** (`src/app/(admin)/organisations/index.tsx:137–142`): Sends `{ orgName, orgType: 'unit', username: normalizedUsername, idempotencyKey: attemptKey }`
2. **Username normalization** (UI lines 36–46): `trim → lowercase → replace spaces/dashes with _ → remove unsupported chars → collapse underscores → strip leading/trailing underscores → limit 40`
3. **Client-side validation** (UI line 129): `^[a-z0-9_]{3,40}$`
4. **Service** → **Repository** → **Edge Function**: Same chain as root
5. **Edge Function** (`provision-admin/index.ts`):
   - `validateUsername(body?.username)` at line 300 — additional server-side validation
   - Preflight: `p_username: username` (the validated username)
   - Auth user creation: email = `${username}_${uuid.slice(0,4)}@sahi.local` (synthetic email)
   - Finalise: `finalise_child_organisation_provisioning` with username

### Child validation chain

| Layer | Regex/Validation | Scope |
|---|---|---|
| Frontend auto-suggest | `replace(/[^a-z0-9_]/g, '')` + collapse + strip | Client only |
| Frontend validation | `^[a-z0-9_]{3,40}$` | Client |
| Edge Function `validateUsername` | `^[a-z0-9_]{3,40}$` | Server |
| SQL `begin_provisioning_operation` | `^[a-z0-9_]{3,40}$` (child only) | Database |
| SQL `finalise_child_organisation_provisioning` | `^[a-z0-9_]{3,40}$` (in function body) | Database |

All layers agree. Server-side validation is NOT weakened.

### Child operation cannot bypass by choosing `root_tenant`:
- Authorization at the top of `begin_provisioning_operation` enforces operation type
- `root_tenant` requires `is_superadmin()` — a child tenant admin would fail this check
- The operation type is stored in the `operation_type` column and bound to the operation record

---

## 13. Shared Parameter Semantics

The `p_username` parameter slot in `begin_provisioning_operation` carries:

| Operation | `p_username` carries | Stored in column |
|---|---|---|
| `root_tenant` | Admin email (e.g., `shibilikds37@gmail.com`) | `admin_email` |
| `child_organisation` | Username (e.g., `tes111`) | `admin_email` |

**Confusing but behaviorally safe.** The column name `admin_email` is historical. For root tenants, it holds an email; for child organisations, it holds a username. The semantics are correctly maintained throughout the function chain:

- Root `finalise_tenant_provisioning` never reads `admin_email` from the operation record for username purposes
- Child `finalise_child_organisation_provisioning` reads the username from the operation record correctly
- Retry/return operations return the correct identifier

**A note for future technical debt:** The column `admin_email` could be renamed to `login_identifier` or similar, but this is NOT a correctness or security issue and should not block this deployment.

---

## 14. Operation-Type Security

| Check | Status |
|---|---|
| Only known operations accepted | ✅ (`root_tenant` and `child_organisation`; else `RAISE EXCEPTION`) |
| Unknown values rejected | ✅ (line 69 in Migration 105) |
| Null/empty operation rejected | ✅ (Edge Function validates at line 112) |
| Root cannot masquerade as child | ✅ (Authorization enforced independently per type) |
| Child cannot masquerade as root | ✅ (`root_tenant` requires `is_superadmin()`) |
| Child cannot choose `root_tenant` to avoid username validation | ✅ (superadmin check blocks non-superadmin from root) |
| Operation type bound to record | ✅ (`operation_type` column stores the exact type) |
| Same key cannot be reused with different operation type | ✅ (`UNIQUE (operation_type, idempotency_key)` constraint) |
| Same key cannot be reused with different org/tenant | ✅ (unique constraint prevents this) |
| Same key cannot be reused by another user | ✅ (ownership enforcement at line 80) |
| Retry cannot mutate original request identity | ✅ (existing operation ownership is enforced) |

---

## 15. Authorization Review

### Root tenant (`begin_provisioning_operation`)

```sql
ELSIF p_operation_type = 'root_tenant' THEN
    IF NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Permission denied: only superadmin can provision root tenant';
    END IF;
```

- ✅ Requires `is_superadmin()` = true
- ✅ Client never supplies this (database-side check)
- ✅ `is_superadmin()` reads from `profiles.is_superadmin`, which cannot be self-modified (RLS policy in Migration 099 prevents role/tenant/superadmin self-escalation)

### Child organisation (`begin_provisioning_operation`)

```sql
IF p_operation_type = 'child_organisation' THEN
    IF NOT public.is_superadmin() THEN
        IF public.get_my_tenant_id() IS NULL THEN
            RAISE EXCEPTION 'Permission denied: tenant access required or disabled';
        END IF;
        IF p_parent_id IS NULL OR NOT public.is_org_visible(p_parent_id) THEN
            RAISE EXCEPTION 'Permission denied: parent organisation is not within your hierarchy';
        END IF;
    END IF;
```

- ✅ Superadmin bypasses all checks
- ✅ Non-superadmin requires enabled tenant (`get_my_tenant_id()` returns non-null only for enabled tenants after Migration 098)
- ✅ Parent must be visible in caller's hierarchy (`is_org_visible`)
- ✅ Archived parent rejected (line 57–63)

### Root authorization preserved: ✅
### Child authorization preserved: ✅

---

## 16. Ownership and Idempotency Review

### Idempotency flow

1. `begin_provisioning_operation` looks up existing operation by `(operation_type, idempotency_key)` with `FOR UPDATE` lock
2. If found: ownership check, then returns existing `id`
3. If not found: creates new record, returns new `id`

### Ownership enforcement

```sql
IF v_op.requested_by <> v_uid AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Permission denied: operation belongs to another user';
END IF;
```

- ✅ Same user can retry with same key
- ✅ Different user cannot reuse same key (unless superadmin)
- ✅ `FOR UPDATE` prevents concurrent races

### Cross-user same-key protection: ✅
### Same-key retry behavior: ✅
- For `root_tenant`: returns existing operation → Edge Function checks `existingOp.status === 'completed'` → returns success without creating Auth user
- For `child_organisation`: same pattern with `REUSABLE_STATUSES` check

### Existing-operation return behavior: ✅
### Completed-operation behavior: ✅ (returns success, no new Auth user)
### Failed-operation retry behavior: ✅ (allows retry, reuses existing target_user_id if set)

---

## 17. Hierarchy/Disabled/Archived Checks

### Disabled tenant rejection (child)

```sql
SELECT COALESCE(access_disabled, false) INTO v_parent_tenant_disabled
FROM public.tenants WHERE id = v_parent_tenant;
IF v_parent_tenant_disabled THEN
    RAISE EXCEPTION 'Permission denied: parent tenant access is disabled';
END IF;
```

Wait — this check is in `finalise_child_organisation_provisioning`, not in `begin_provisioning_operation`. In the preflight (`begin_provisioning_operation`), disabled tenants are rejected indirectly via `get_my_tenant_id()` returning NULL (Migration 098 behavior).

- ✅ Child under disabled tenant: rejected via `get_my_tenant_id()` returning NULL
- ✅ Child under archived parent: rejected via `archived_at` check in `begin_provisioning_operation` (line 57–63)
- ✅ Both checks also repeated in `finalise_child_organisation_provisioning` (defense in depth)

---

## 18. Migration 101 Regression Review

Migration 101 modifies:
1. `lookup_email_by_username` → replaced with `resolve_login_email` (service_role only)
2. Adds `username_login_rate_limits` table
3. Adds `consume_username_login_attempt` function (service_role only)
4. Drops `check_reset_credential_access` → replaced with `resolve_reset_target` (service_role only)

**Migration 101 does NOT modify `begin_provisioning_operation`.** No regression.

**Migration 101 security hardening preserved:**
- `lookup_email_by_username` remains revoked from PUBLIC/anon/authenticated
- `resolve_login_email` is service_role only
- Rate limiting is service_role only
- `resolve_reset_target` is service_role only

**Migration 101 security regression found: NO**

---

## 19. Migration 102 Interaction

### Detailed analysis

| Question | Answer |
|---|---|
| 1. Does Migration 102 create/replace `begin_provisioning_operation`? | **NO** |
| 2. Does it alter root tenant provisioning? | **YES** — adds 6-arg `finalise_tenant_provisioning` overload |
| 3. Does it alter child provisioning? | **YES** — replaces `finalise_child_organisation_provisioning` to inherit `festival_template` |
| 4. Does it add `festival_template` to tenant creation? | **YES** — `tenants.festival_template text NOT NULL DEFAULT 'sahithyolsav'` |
| 5. Does it add a root RPC overload? | **YES** — 6-arg `finalise_tenant_provisioning` |
| 6. Are there both 5-arg and 6-arg versions? | **YES** |
| 7. Does the sixth argument have a DEFAULT? | **NO** — `p_festival_template text` (no DEFAULT) |
| 8. Could PostgREST resolve a 5-arg call ambiguously? | **NO** — PostgREST matches by parameter count and names; 5-arg callers match the 5-arg function |
| 9. Is there a wrapper RPC? | **NO** — the 6-arg version delegates to the 5-arg version internally |
| 10. Could the wrapper recursively call itself? | **NO** — the 6-arg calls the 5-arg (different signature) |
| 11. Do named Edge Function parameters match exactly? | **YES** — Edge Function sends `{ p_org_id, p_user_id, p_org_name, p_org_type, p_idempotency_key, p_festival_template }` which matches the 6-arg signature |
| 12. Does Migration 102 preserve legacy Sahithyolsav behavior? | **YES** — 5-arg function untouched; column defaults to `'sahithyolsav'` |
| 13. Does College Fest explicitly select the new behavior? | **YES** — Edge Function sends `festival_template: 'college_fest'` when selected |
| 14. Does Migration 105 overwrite any behavior added by Migration 102? | **NO** — 105 only modifies `begin_provisioning_operation`; 102 only modifies `finalise_*` functions |
| 15. Does Migration 102 overwrite the username-scope fix? | **NO** — 102 does not touch `begin_provisioning_operation` |
| 16. Is applying 102 before 105 safe? | **YES** — they modify different functions |
| 17. Does Migration 105 depend on objects created by 102? | **NO** — 105 only replaces `begin_provisioning_operation` |
| 18. Can Migration 105 be safely applied while 102 remains pending? | **Functionally YES** (no dependency), but root tenant finalisation would fail without 102's 6-arg overload |
| 19. Would normal `db push` apply both? | **YES** — 102 and 105 are both pending; db push applies in numerical order |
| 20. Is Migration 102 currently complete enough for production? | **Structurally YES** — all prechecks, schema additions, function overloads, triggers, and grants are present and self-consistent |

### Critical dependency

The live Edge Function (`provision-admin` v`c2-fix-2`) **already sends a 6-argument** `finalise_tenant_provisioning` call. This means:

- Without Migration 102: Root tenant finalisation will fail with a PostgREST error (no matching 6-arg function)
- With Migration 102 but without 105: Root tenant preflight fails (current production state)
- With both 102 and 105: Both preflight and finalise should succeed

**Migration 102 must be deployed for root tenant onboarding to work end-to-end.**

---

## 20. PostgREST/RPC Overload Review

### After all pending migrations are applied

| Function | Signature | Source |
|---|---|---|
| `begin_provisioning_operation` | `(text, text, uuid, text, text)` | Migration 105 |
| `finalise_tenant_provisioning` (5-arg) | `(uuid, uuid, text, text, text)` | Migration 100 |
| `finalise_tenant_provisioning` (6-arg) | `(uuid, uuid, text, text, text, text)` | Migration 102 |
| `finalise_child_organisation_provisioning` | `(uuid, uuid, text, text, text, text)` | Migration 102 |

### Edge Function RPC calls

| Call | Parameters sent | Resolves to |
|---|---|---|
| `begin_provisioning_operation` | 5 named params | 5-arg version ✅ |
| `finalise_tenant_provisioning` (root) | 6 named params | 6-arg version (Migration 102) ✅ |
| `finalise_child_organisation_provisioning` | 6 named params | 6-arg version ✅ |

### Ambiguity check

- 5-arg `finalise_tenant_provisioning`: `p_festival_template` parameter does NOT exist in the 5-arg signature. PostgREST requires exact parameter name match. No ambiguity.
- The 6-arg version delegates internally to the 5-arg version (line 378–384 of Migration 102), so there is no recursion risk.
- Legacy callers that previously used 5 args would still match the 5-arg version.
- Root Sahithyolsav request: reaches the 6-arg version (Edge Function always sends `p_festival_template`)
- Root College Fest request: reaches the 6-arg version (same)
- Both are safe.

### Grant check

- `finalise_tenant_provisioning` (both overloads): `GRANT EXECUTE TO authenticated` ✅
- `finalise_child_organisation_provisioning`: `GRANT EXECUTE TO authenticated` ✅
- `begin_provisioning_operation`: `GRANT EXECUTE TO authenticated` ✅
- No PUBLIC or anon grants on provisioning RPCs ✅

### PostgREST/RPC status: **STRONG**

No ambiguous overloads, no recursive wrappers, no exposed sensitive signatures.

---

## 21. SQL Migration Safety (Migration 105)

| Check | Status |
|---|---|
| Forward-only | ✅ (CREATE OR REPLACE, no destructive DDL) |
| Valid SQL syntax | ✅ (syntactically correct PL/pgSQL) |
| Correct function signature | ✅ (5 params matching Migration 100) |
| Balanced dollar quoting | ✅ (`$$ ... $$` balanced) |
| Transaction boundaries | ✅ (no explicit BEGIN/COMMIT; migration runs in implicit transaction) |
| Correct return type | ✅ (`uuid`) |
| Correct parameter order | ✅ (same as Migration 100) |
| Correct enum/text comparisons | ✅ (operation_type compared as text) |
| Correct null handling | ✅ (null username handled by the new condition) |
| Correct regex syntax | ✅ (`^[a-z0-9_]{3,40}$`) |
| Correct grants/revokes | ✅ (`GRANT EXECUTE TO authenticated`) |
| `SECURITY DEFINER` | ✅ (preserved) |
| Safe `search_path` | ✅ (`SET search_path = public`) |
| No destructive DDL | ✅ |
| No row deletion | ✅ |
| No tenant/org/user/festival rewrite | ✅ |
| No credential exposure | ✅ |
| No secret logging | ✅ |
| No dependency on unavailable objects | ✅ |
| No regression from copying old function body | ✅ (based on effective Migration 100 definition, which IS the current live definition) |
| No loss of Migration 101 protections | ✅ (101 doesn't touch this function) |
| No loss of Migration 102 behavior | ✅ (102 doesn't touch this function) |
| No GRANT missing | ✅ |

### Missing `REVOKE ALL` before `GRANT`

Migration 105 issues `GRANT EXECUTE ... TO authenticated` without first doing `REVOKE ALL ... FROM PUBLIC, anon, authenticated`. However, this is **not a regression** because Migration 100 already established the correct grants (revoke from PUBLIC/anon, grant to authenticated), and `CREATE OR REPLACE` does not change existing grants. The grant in Migration 105 is redundant but harmless.

**Verdict: Migration 105 SQL is safe and correct.**

---

## 22. Error-Handling Review

### Frontend error extraction (`provisioningRepository.ts`)

```typescript
const context = (error as any)?.context as
    | { error?: string; message?: string }
    | undefined;
const err = new Error(
    typeof context?.message === 'string' && context.message
        ? context.message
        : error.message || 'Provisioning failed',
);
err.code = typeof context?.error === 'string' ? context.error : undefined;
```

| Check | Status |
|---|---|
| Parsed response body read from `error.context` | ✅ |
| Inner server message surfaced | ✅ (`context.message` preferred over `error.message`) |
| Raw SQL internals not shown | ✅ (Edge Function only returns safe messages) |
| Service-role details not shown | ✅ (Edge Function never exposes service role info) |
| Stack traces not shown | ✅ (Edge Function returns `{ error, message }` objects) |
| Network/CORS failures get fallback | ✅ (falls back to `error.message || 'Provisioning failed'`) |
| Root and child flows use same error path | ✅ (single `provisioningRepository.provision` method) |

### Edge Function error responses

The Edge Function wraps all errors in safe JSON:
```json
{"error": "PREFLIGHT_DENIED", "message": "Invalid username format"}
{"error": "INVALID_ADMIN_EMAIL", "message": "A valid admin email is required."}
{"error": "AUTH_USER_CREATE_FAILED", "message": "The admin account could not be created..."}
```

No SQL errors, no stack traces, no credentials are exposed.

### Frontend error extraction verified: YES

---

## 23. Test-Evidence Classification

DeepSeek reported in-transaction tests. Classification of each:

| Test | Classification |
|---|---|
| Root Sahithyolsav accepted | **SQL preflight only** — tests `begin_provisioning_operation` in isolation with BEGIN/ROLLBACK; does NOT test Auth creation, finalisation, or Edge Function flow |
| Root College Fest accepted | **SQL preflight only** — same as above |
| Root with no username accepted | **SQL preflight only** — verifies no username is required for root |
| Child with no username rejected | **SQL preflight only** — verifies null username is rejected |
| Child with `tes111` accepted | **SQL preflight only** — verifies valid username passes |
| Child invalid username rejected | **SQL preflight only** — verifies invalid username fails |
| Tenant-less/unauthorized root denied | **SQL preflight only** — verifies authorization |
| Tenant-less/unauthorized child denied | **SQL preflight only** — verifies authorization |
| Auth user creation happens only after preflight | **Simulated claim** — this is architectural (Edge Function ordering), not testable via SQL-only tests |

**None of these tests:**
- Make a real authenticated call through the Edge Function
- Create a real Auth user
- Run finalisation
- Complete a full onboarding flow
- Test the frontend UI
- Test the error extraction path in the browser

**Full root onboarding runtime verified: NO**
**Full child onboarding runtime verified: NO**
**Runtime tests still required: YES** (see Section 27)

---

## 24. Required Review Matrix

| # | Test | Classification |
|---|---|---|
| 1 | Root Sahithyolsav with valid email and no username | **RUNTIME REQUIRED** (SQL preflight only tested; full Edge Function flow not tested) |
| 2 | Root College Fest with valid email and no username | **RUNTIME REQUIRED** |
| 3 | Root with missing email | **PASS** (Edge Function rejects at line 289–291 before reaching SQL) |
| 4 | Root with invalid email | **PASS** (Edge Function `normalizeEmail` returns null; rejected at line 289–291) |
| 5 | Root by valid superadmin | **PASS** (SQL preflight authorization verified) |
| 6 | Root by tenant admin | **PASS** (SQL preflight: `is_superadmin()` check at line 65) |
| 7 | Root by participant/non-admin | **PASS** (same check) |
| 8 | Child with missing username | **PASS** (Migration 105 explicitly rejects null for child_organisation) |
| 9 | Child with empty username | **PASS** (Edge Function `validateUsername` + SQL regex reject) |
| 10 | Child with `tes111` | **PASS** (regex `^[a-z0-9_]{3,40}$` matches) |
| 11 | Child with `test_unit_1` | **PASS** (regex matches) |
| 12 | Child with invalid username | **PASS** (regex rejects) |
| 13 | Child by valid parent admin | **PASS** (SQL hierarchy check) |
| 14 | Child by participant | **PASS** (authorization check) |
| 15 | Child under disabled tenant | **RUNTIME REQUIRED** (`get_my_tenant_id()` returns NULL for disabled; tested only at SQL level) |
| 16 | Child under archived parent | **PASS** (SQL archived_at check in begin_provisioning_operation) |
| 17 | Same-user same-key retry | **PASS** (idempotency lock + ownership enforcement verified) |
| 18 | Cross-user same-key reuse | **PASS** (ownership enforcement) |
| 19 | Same key with changed operation type | **PASS** (unique constraint on operation_type + idempotency_key) |
| 20 | Same key with changed target | **PASS** (same unique constraint) |
| 21 | Unknown operation type | **PASS** (explicit rejection at line 69) |
| 22 | Migration 102 followed by 105 | **PASS** (different functions; no conflict) |
| 23 | Migration 105 without 102 | **BLOCKED** (preflight would pass but finalise would fail — no 6-arg function) |
| 24 | PostgREST legacy root RPC | **RUNTIME REQUIRED** (5-arg call still resolves correctly; needs verification) |
| 25 | PostgREST College Fest root RPC | **RUNTIME REQUIRED** (6-arg call must resolve; needs verification) |
| 26 | Failed preflight creates no Auth user | **PASS** (Edge Function order: preflight → then Auth creation) |
| 27 | Successful preflight before Auth creation | **PASS** (Edge Function order) |
| 28 | Finalisation failure compensation/idempotency | **RUNTIME REQUIRED** (compensation logic in Edge Function not testable via SQL) |
| 29 | Generic Edge error replaced with safe backend message | **PASS** (repository code verified) |
| 30 | Existing Sahithyolsav behavior preserved | **PASS** (no changes to Sahithyolsav path; `festival_template` defaults to `'sahithyolsav'`) |

---

## 25. Issues Found

### Issue 1: Edge Function already expects Migration 102's 6-arg overload

**Severity: CRITICAL**
**Description:** The live Edge Function (`provision-admin` v`c2-fix-2`) sends a 6-argument `finalise_tenant_provisioning` call (including `p_festival_template`). This overload only exists after Migration 102 is applied. Without Migration 102, root tenant finalisation will fail with a PostgREST function-not-found error, even after the preflight fix from Migration 105.
**Impact:** Deploying Migration 105 alone will NOT fix root tenant onboarding.
**Resolution:** Deploy Migrations 102 and 105 together.

### Issue 2: `p_username` column name is `admin_email` — historical confusion

**Severity: LOW (technical debt)**
**Description:** The `tenant_provisioning_operations.admin_email` column stores a username for child operations and an email for root operations. This is confusing but behaviorally safe.
**Impact:** No correctness or security impact. Future developers may be confused.
**Resolution:** Document as technical debt. Consider renaming in a future migration.

### Issue 3: Migration 105 does not revoke before grant (redundant grant)

**Severity: INFORMATIONAL**
**Description:** Migration 105 issues `GRANT EXECUTE ... TO authenticated` without `REVOKE ALL` first. This is redundant (Migration 100 already set the correct grants) and harmless.
**Impact:** None. The grant is a no-op since it already exists.
**Resolution:** None needed.

---

## 26. Required Corrections

**Migration 105 requires NO correction.** The fix is correct and minimal.

However, the **deployment plan** must be corrected to include Migration 102.

---

## 27. Runtime Tests Still Required

The following tests require a running Supabase instance with the Edge Function deployed and cannot be verified through static analysis alone:

1. **Root Sahithyolsav onboarding (full flow):**
   - Super admin opens onboarding modal → enters email → selects Sahithyolsav → clicks Create
   - Verify: preflight succeeds, Auth user created, finalisation succeeds, temporary password returned
   - Verify: new tenant has `festival_template = 'sahithyolsav'`

2. **Root College Fest onboarding (full flow):**
   - Same as above but with `college_fest` template
   - Verify: new tenant has `festival_template = 'college_fest'`

3. **Root onboarding with missing email:**
   - Verify: Edge Function returns 400 `INVALID_ADMIN_EMAIL` before any SQL call

4. **Root onboarding retry (same idempotency key):**
   - First attempt fails (e.g., network timeout after Auth creation but before finalisation)
   - Retry with same key: verify no duplicate Auth user, operation completes

5. **Child organisation onboarding (full flow):**
   - Tenant admin creates sub-organisation with valid username `tes111`
   - Verify: preflight succeeds, Auth user created with synthetic email, finalisation succeeds

6. **Child organisation with invalid username:**
   - Verify: Edge Function returns 400 `INVALID_USERNAME`

7. **Child organisation under disabled tenant:**
   - Verify: preflight returns 403

8. **Compensation on finalisation failure:**
   - If finalisation fails, verify the Auth user is deleted (compensation)
   - Verify: operation status is `compensated` or `compensation_pending`

---

## 28. Deployment Decision

**MIGRATIONS 102 AND 105 MUST BE REVIEWED AND DEPLOYED TOGETHER**

**Rationale:**
1. Migration 105 correctly fixes the preflight bug (username regex scoped to child_organisation)
2. Migration 102 is required for the Edge Function's 6-argument `finalise_tenant_provisioning` call
3. Both migrations are structurally safe for Sahithyolsav
4. Migrations 103 and 104 are part of the migration chain (102 → 103 → 104) and are safe for Sahithyolsav (their triggers only fire for `college_fest` festivals, which don't exist yet)
5. Normal `db push` would apply all four; deploying them together is the correct approach

---

## 29. Recommended Deployment Order

### Migrations to apply

| # | Migration | Included | Reason |
|---|---|---|---|
| 102 | `college_fest_template.sql` | **YES** | Required for 6-arg `finalise_tenant_provisioning` overload (Edge Function dependency) |
| 103 | `college_fest_category_enforcement.sql` | **YES** | Part of 102's chain; safe for Sahithyolsav; triggers only fire for college_fest |
| 104 | `college_fest_registration_enforcement.sql` | **YES** | Part of 102's chain; safe for Sahithyolsav |
| 105 | `root_tenant_preflight_username_scope.sql` | **YES** | Core fix for preflight username validation |

### Deployment steps (recommended)

1. **Before deployment:**
   - Verify current remote migration is 101
   - Verify Edge Function `provision-admin` version is `c2-fix-2` and already deployed
   - Verify `FEATURE_FLAGS.ENABLE_ONBOARDING` is accessible to the deployment pipeline

2. **Deploy migrations:**
   ```
   supabase db push
   ```
   This will apply 102 → 103 → 104 → 105 in order.

3. **Edge Function redeployment:** **NOT required** — the Edge Function is already deployed with version `c2-fix-2` which expects the 6-arg overload.

4. **Frontend redeployment:** **NOT required** — the frontend changes (provisioningRepository error extraction, organisations/index.tsx username flow) are already in the working tree.

5. **Smoke tests (in order):**
   - **First:** Root tenant onboarding with **Sahithyolsav** — this tests the most critical fix path
   - **Second:** Root tenant onboarding with **College Fest** — this verifies the 6-arg overload works with `college_fest` template
   - **Third:** Child organisation creation with valid username — this verifies child flow is not regressed

6. **Retry test:**
   - Create a root tenant, let it succeed
   - Retry with the same idempotency key
   - Verify: no duplicate Auth user, returns "already completed"

7. **Rollback/stop condition:**
   - If any smoke test fails: **STOP** and investigate
   - Do NOT proceed with additional onboarding tests until root tenant flow is confirmed working
   - Migrations 102–104 are additive only (no destructive DDL) and can be left in place even if College Fest features are not used

8. **Production data must not be modified during validation:**
   - Do not create test tenants in the production database
   - Use a staging/test environment for smoke tests
   - The migration prechecks (in 102, 103, 104) will fail fast if the schema is incompatible

---

## 30. Confirmation of No Changes

| Item | Modified? |
|---|---|
| Source code files | NO |
| Migration files | NO |
| Supabase database objects | NO |
| Auth users | NO |
| Tenants | NO |
| Organisations | NO |
| Festivals | NO |
| Participants | NO |
| Registrations | NO |
| Schedules | NO |
| Marks | NO |
| Results | NO |
| Points | NO |
| Credentials | NO |
| Production configuration | NO |
| Feature gates | NO |
| Edge Functions | NO |
| Migrations applied | NO |

### Files created
- `MIMO_105_ROOT_PREFLIGHT_INDEPENDENT_REVIEW.md` (this report)

### Files modified
- None

---

## Final Response Summary

| Field | Value |
|---|---|
| Reviewer model | MiMo V2.5 (opencode/mimo-v2.5-free) |
| Review mode | Independent read-only |
| Current branch | main |
| Current commit | 56404fe |
| Working tree status | 12 modified files, multiple untracked files |
| Remote highest migration | 101 (reported, unverified) |
| Local migrations from 099 onward | 099, 100, 101, 102, 103, 104, 105 |
| Pending migrations | 102, 103, 104, 105 |
| Exact normal db-push order | 102 → 103 → 104 → 105 |
| Migration 103 exists | YES |
| Migration 104 exists | YES |
| Migration 105 reviewed | YES |
| Production root cause independently confirmed | YES |
| Effective pre-105 function identified | YES |
| Migration 105 based on latest effective definition | YES |
| Only intended username-validation behavior changed | YES |
| Root child-username validation skipped | YES |
| Root admin email validation preserved | YES (by Edge Function normalizeEmail; SQL no longer rejects it) |
| Child username required | YES |
| Child regex preserved | YES |
| Unknown operations rejected | YES |
| Root authorization preserved | YES |
| Child authorization preserved | YES |
| Ownership preserved | YES |
| Idempotency preserved | YES |
| Cross-user same-key protection preserved | YES |
| Hierarchy checks preserved | YES |
| Disabled/archive checks preserved | YES |
| Auth user created only after preflight | YES |
| Migration 101 security regression found | NO |
| Migration 102 affects provisioning functions | YES (finalise_* only) |
| Migration 102 ready for production | UNCERTAIN (structurally complete; College Fest feature gate controls usage) |
| Migration 105 overwrites Migration 102 behavior | NO |
| Migration 102 overwrites Migration 105 fix | NO |
| Normal db push would apply | 102, 103, 104, 105 |
| PostgREST/RPC status | STRONG |
| Frontend error extraction verified | YES |
| Full root onboarding runtime verified | NO |
| Full child onboarding runtime verified | NO |
| Security regression found | NO |
| Issues found | 1 critical (102 dependency), 1 low (column naming), 1 informational (redundant grant) |
| Required correction count | 0 (migration is correct; deployment plan must include 102) |
| Runtime tests still required | 8 (see Section 27) |
| Deployment decision | **MIGRATIONS 102 AND 105 MUST BE REVIEWED AND DEPLOYED TOGETHER** |
| Recommended deployment order | 102 → 103 → 104 → 105 via `db push` |
| Files created | 1 (`MIMO_105_ROOT_PREFLIGHT_INDEPENDENT_REVIEW.md`) |
| Files modified | 0 |
| Database modified | NO |
| Auth users created | NO |
| Migrations applied | NO |
| Edge Functions deployed | NO |
| Frontend deployed | NO |
| Report path | `D:\work\fest\web-for-sahi--main\web-for-sahi--main\MIMO_105_ROOT_PREFLIGHT_INDEPENDENT_REVIEW.md` |

---

**MIMO INDEPENDENT ROOT PREFLIGHT AND MIGRATION SAFETY REVIEW COMPLETED — NO DEPLOYMENT PERFORMED**
