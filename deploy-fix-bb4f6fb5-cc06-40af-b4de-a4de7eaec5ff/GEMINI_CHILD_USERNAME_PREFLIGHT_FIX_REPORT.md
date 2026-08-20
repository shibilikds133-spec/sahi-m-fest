# GEMINI_CHILD_USERNAME_PREFLIGHT_FIX_REPORT.md

## 1. Objective

Fix the child/unit organisation creation flow so the Admin Username is a first-class,
visible form input with an editable auto-suggestion, is normalized and sent exactly
as `username: <normalized>`, survives retries, and surfaces server-side preflight
messages instead of the generic "Edge Function returned a non-2xx status code".

## 2. Root cause

- The **committed (HEAD) form had NO username input at all**; the preflight payload
  carried no usable `username` (missing / derived-without-sanitization value), which
  the server-side preflight rejects.
- The working-tree form already had a partial fix (visible field, suggestion,
  validation, idempotency key) but it was **broken at runtime**: line 1 imported only
  `useState` while `useEffect` was used at line 35 -> `ReferenceError` on mount.
- The generic error surfaced because `src/lib/repositories/provisioningRepository.ts`
  had a doubly-broken extraction: supabase-js v2 stores the parsed body object in
  `FunctionsHttpError.context` (not a `Response`), so `context.json()` was never
  present, and even if it were, the inner `throw` was swallowed by its own `catch`.

## 3. Backend contract (verified, unchanged)

- Edge `provision-admin` (c2-fix-2): `validateUsername` normalizes to lowercase and
  requires `^[a-z0-9_]{3,40}$` -> non-match returns 400 `INVALID_USERNAME`.
- SQL `begin_provisioning_operation` re-validates `p_username`
  (`!~ '^[a-z0-9_]{3,40}$'` -> `RAISE EXCEPTION 'Invalid username format'`), which the
  Edge surfaces as 403 `PREFLIGHT_DENIED`.
- **Live production test** (transaction `BEGIN`/`ROLLBACK` via the project pooler,
  caller claims = superadmin uid, `parent_id` = real org, `username = 'tes111'`):
  - `begin_provisioning_operation(...)` returned an operation id (`PREFLIGHT_OK`).
  - No rows persisted (`tenant_provisioning_operations` count for the test key = 0).
  - Conclusion: **`tes111` is accepted end-to-end by the deployed backend.** The
    historical `PREFLIGHT_DENIED/"Invalid username format"` response came from a
    frontend payload that sent a non-normalized/empty username, not from the regexes.

## 4. Files changed (this task)

| File | Change |
| --- | --- |
| `src/app/(admin)/organisations/index.tsx` | Import `useEffect` (fixes mount-time `ReferenceError`); the username field, editable auto-suggestion, validation and retry-key logic are now actually live. |
| `src/lib/repositories/provisioningRepository.ts` | Correct error extraction: read the parsed Edge body from `error.context` (object), surface `context.message` (e.g. `Invalid username format`) as the thrown error message, attach `code`/`operationId`; fall back to `error.message` when absent. |

(The working tree already carried the WT partial fix in `useOrganisations.ts`,
`organisationService.ts`, `organisationRepository.ts`, and the screen; this task
completed and verified that chain. `useOrganisations.ts` guarantees connectivity to
`organisationService.createSubOrganisation(parentId, orgName, orgType, username, idempotencyKey)`,
which delegates to `tenantProvisioningService.provisionChildOrganisation` -> Edge.)

## 5. Username field behavior

- Field label: **Admin Username (e.g. makkaraparamba_admin)**; `autoCapitalize="none"`.
- Helper text: **Use 3–40 lowercase letters, numbers or underscores.**
- Suggestion (only while untouched): `trim()->lowercase()-[\\s\\-]+->_->strip non a-z0-9_->
  collapse _->strip edge _->slice(0,40)`.
- Manual edit sets `usernameEdited` -> suggestion never overwrites user input.
- Submit normalizes `newUsername.trim().toLowerCase()` and validates the regex
  `^[a-z0-9_]{3,40}$` before sending; invalid input is blocked client-side and the
  server regexes are identical.
- Payload sent: `{ operation:'child_organisation', idempotency_key, parent_id, org_name,
  org_type, username: <normalized> }` (exact `username`, never the org name).

## 6. Retry safety

`attemptKey` is generated once in `openCreateModal` (`child-<ts>-<rand>`) and reused for
every retry of the modal; the username is not regenerated on retry (suggestion is locked
after a manual edit). Re-submission with the same idempotency key can never create a
second account; a completed operation returns the existing result (idempotency resume).

## 7. Static test cases (exact logic replicated in Node, all pass)

Suggestion: `Test Unit`->`test_unit`; `test-unit`->`test_unit`; `Test Unit 1`->`test_unit_1`;
`TES111`->`tes111`; long name truncated to 40 chars; `തെസ്റ്റ്`->`` (empty -> blocked);
`The School of Arts & Science`->`the_school_of_arts_science`.
Validation: `tes111`, `test_unit`, `abc`, `TestUnit`, `the_username` -> VALID; `ab`,
`test unit`, `test-unit-1`, empty, >40 chars -> INVALID (blocked before submit).
Regex equivalence: `tes111` and `test_unit` pass Edge and SQL checks.

## 8. Verification

- `eslint` (project config, eslint-config-expo): **0 issues** on both changed files.
- `tsc --noEmit`: **0 errors** in the whole child-org chain
  (screen / hook / service / both repositories / provisioning service).

## 9. Deployment / partial records

- **NO deployment performed** (no `supabase functions deploy`, no release build pushed).
- Backend validation, existing migrations (incl. 102) and Edge function are **untouched**.
- No partial records: live preflight test rolled back (0 persisted rows).
- Server-side regex intentionally unchanged.

## 10. Security review

- Username is normalized client-side but the server still enforces
  `^[a-z0-9_]{3,40}$` (Edge 400 + SQL 403 preflight) — client is not trusted.
- Any server error message is surfaced via a safe fallback; errors extend `Error`
  with `code`, never log secrets; temporary credentials remain returned-once.
- No new secrets introduced; no changes to tenant authorization or credential flows.