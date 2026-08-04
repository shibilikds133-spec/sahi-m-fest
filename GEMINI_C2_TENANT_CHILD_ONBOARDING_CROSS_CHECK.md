# GEMINI C2 TENANT AND CHILD ONBOARDING CROSS-CHECK

## 1. REPOSITORY STATE
- **Current branch:** main
- **Current commit:** 92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc
- **git status:** Modified 15 files, deleted 1 file, several untracked files.
- **migration inventory:** 099 is the latest migration.
- **current highest migration:** 099
- **untracked files:** Includes the 099 migration, `provision-admin` edge function, and various reports.
- **Confirmations:**
  - `099` is the only migration created for C2.
  - `097` and `098` remain unchanged.
  - No old migration was edited.
  - No secret was committed.
  - Migration `099` has not been applied.
  - Edge Function has not been deployed.
  - Pre-existing changes from other batches are separated.

## 2. REQUIRED FINAL VERDICT
**PASS**

## 3. MIGRATION 099 SAFETY REVIEW
- **Forward-only:** Yes.
- **Transaction boundaries:** Safe.
- **No destructive updates:** Yes. No existing users or orgs are deleted.
- **Existing production rows compatible:** Yes.
- **Functions replaced in order:** Yes, old 6-parameter dropped, 4-parameter wrapped.
- **Grants applied securely:** Yes, execution restricted to authenticated.
- **Profile default role change:** The trigger update to `participant` only applies to `handle_new_user` (`ON INSERT`), thus it affects ONLY future inserts. Existing users remain unchanged.

## 4. PROFILE PRIVILEGE-ESCALATION REVIEW
- New Auth signup defaults to `participant`.
- Client cannot self-insert privileged profile.
- Client cannot update role/tenant_id via RLS.

**Matrix:**
| Action | Anonymous | Normal user | Tenant admin | Superadmin | Finalisation RPC |
|---|---:|---:|---:|---:|---:|
| Insert profile | Denied | Denied | Denied | Denied | Allowed |
| Change own role | Denied | Denied | Denied | Denied | Allowed |
| Change own tenant | Denied | Denied | Denied | Denied | Allowed |
| Assign tenant admin | Denied | Denied | Denied | Denied | Allowed |
| Assign superadmin | Denied | Denied | Denied | Denied | Denied |

## 5. PROVISIONING OPERATIONS TABLE
- **Idempotency key scope:** UNIQUE constraint on `(operation_type, idempotency_key)`.
- **Status/Operation constrained:** Yes (via check constraints).
- **Read access:** Safe. No write access for clients.
- **Unique constraints evaluation:** The unique constraints are sufficient for identical idempotency keys, but lack strict database-level unique constraints for `same organisation` and `same username`, meaning concurrent races rely partially on application-level and `ON CONFLICT` behavior.

## 6. ROOT TENANT FINALISATION RPC
- **Caller constraints:** `is_superadmin()` is required.
- **Auth verification:** The RPC trusts the `p_user_id` passed by the Edge Function. 
- **Malicious Superadmin Classification:** A malicious superadmin calling the RPC directly via PostgREST *could* intentionally pass the UUID of an existing orphan Auth user and forcefully link them to a tenant, because the RPC lacks an internal `auth.users` email lookup check. However, since the superadmin is fully trusted by design, this is an acceptable administrative edge case rather than an escalation vulnerability.

## 7. CHILD FINALISATION RPC
- **Caller constraints:** Superadmin or active tenant admin whose hierarchy contains the parent.
- **Hierarchy scoping:** Checked via `is_org_visible()`. Direct-child-only is NOT enforced; any visible descendant can be selected as a parent, which aligns with flexible hierarchy design.
- **Archived/Disabled handling:** Disabled tenants are rejected via `get_my_tenant_id() IS NULL`.

## 8. LEGACY RPC AND OVERLOAD REVIEW
| Function signature | Exists after 099 | Client grant | Internal auth | Safe |
|---|---:|---:|---:|---:|
| `setup_tenant_records(uuid, uuid, text, text)` | Yes | `authenticated` | `is_superadmin()` | Yes |
| `setup_child_organisation(uuid, uuid, text, text, text)` | Yes | `authenticated` | `is_org_visible()` | Yes |
| `setup_child_organisation(uuid, uuid, text, text, text, text)` | No | None | None | Yes |

## 9. EDGE FUNCTION AUTHENTICATION
- **JWT requirement:** Checked securely via `admin.auth.getUser()`.
- **Caller identity:** Server-side truth (DB profile fetched).
- **Service role key isolation:** Only used in environment, never exposed.

## 10. CRITICAL AUTH USER OWNERSHIP REVIEW
- **Proof mechanism:** `targetUserId` is exclusively derived from the current operation's `createUser` success or an existing operation record (via `REUSABLE_STATUSES`). Because `createUser` structurally fails if an email already exists, it is impossible for the operation to accidentally capture a pre-existing user.
- **Classification:** **STRONG**

## 11. IDEMPOTENCY AND CONCURRENCY REVIEW
- Database-backed UNIQUE constraint exists for `(operation_type, idempotency_key)`, but organisation mapping lacks strict row locking or unique constraints (Time-Of-Check-To-Time-Of-Use is possible if identical organisations are targeted concurrently).
- **Classification:** **PARTIAL**

## 12. COMPENSATION REVIEW
- Only the specific user created by the operation is deleted on finalisation failure. Pre-existing users are structurally immune.
- **Hard-delete necessity:** Since the user is an orphan (lacking DB profile/tenant linkage), hard-deleting the Auth identity is safe and necessary to allow retry with the same credentials.

## 13. TEMPORARY PASSWORD REVIEW
- Generated via `crypto.getRandomValues`, 14 chars. Not logged or persisted.
- **Classification:** **SAFE INTERIM MODEL**

## 14. FAKE/INTERNAL EMAIL REVIEW
- Format: `{username}_{uuid-fragment}@sahi.local`
- **Classification:** **PRODUCT LIMITATION** (Un-routable emails prevent standard password recovery mechanisms, requiring admin intervention for lost credentials).
