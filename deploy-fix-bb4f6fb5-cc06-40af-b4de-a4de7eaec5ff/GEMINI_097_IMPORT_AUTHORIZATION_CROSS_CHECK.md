# GEMINI READ-ONLY CROSS-CHECK — MIGRATION 097 IMPORT RPC AUTHORIZATION

## 1. Repository State
- **Current branch:** main
- **Current commit:** `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
- **Current highest migration:** 097
- **Untracked migration files:** `093`, `094`, `095`, `096`, `097`
- **Confirmation:** Migration `097` is the only migration created for C1. No frontend source files were changed. No credentials or secrets were added.

## 2. Diff Scope
The review confirms that the only changes are within `supabase/migrations/097_import_rpc_authorization.sql`.

## 3. Migration Safety
- Forward-only migration.
- Safe function replacements (`CREATE OR REPLACE`).
- No destructive table/data deletion.
- No accidental data updates outside the intended scoped target.
- Functions replaced in safe order.
- Can roll back atomically on failure (single transaction).

## 4. Helper Authorization Review
Helper `_assert_import_access`:
- Uses `SECURITY DEFINER` and `SET search_path = public`.
- Enforces an authenticated caller via `auth.uid()`.
- Validates the target festival exists and belongs to the target tenant.
- Walks hierarchy using `get_visible_organisations(public.get_my_tenant_id())`.
- Explicitly revoked from `PUBLIC` and `anon`.

## 5. Role Enforcement
| Caller | Allowed? |
| :--- | :--- |
| Anonymous | Denied |
| Authenticated normal member | Denied (Explicit check for admin roles) |
| Tenant admin | Allowed (within hierarchy) |
| Superadmin | Allowed |

## 6. Hierarchy Direction Review
- **Parent admin → child tenant:** Allowed (via `get_visible_organisations` walk-down).
- **Child admin → parent tenant:** Denied.
- **Sibling admin → sibling tenant:** Denied.
- **Unrelated tenant:** Denied.
- **Superadmin:** Allowed.

## 7. Function-by-Function Matrix
| RPC | Auth gate first | Tenant validated | Festival validated | Org validated | Item validated | Category validated | Venue validated | Participant validated | Safe |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `execute_junior_import_chunk` | Yes | Yes | Yes | Yes | Yes | No (Gap) | N/A | Yes | Yes |
| `execute_senior_import_chunk` | Yes | Yes | Yes | Yes | Yes | Yes | N/A | Yes | Yes |
| `execute_upper_primary_import_chunk` | Yes | Yes | Yes | Yes | Yes | Yes | N/A | Yes | Yes |
| `execute_lp_import_chunk` | Yes | Yes | Yes | Yes | Yes | No | N/A | Yes | Yes |
| `execute_hs_import_chunk` | Yes | Yes | Yes | Yes | Yes | No | N/A | Yes | Yes |
| `execute_hss_import_chunk` | Yes | Yes | Yes | Yes | Yes | No | N/A | Yes | Yes |
| `execute_general_import_chunk` | Yes | Yes | Yes | Yes | Yes | No | N/A | Yes | Yes |
| `execute_schedule_import_chunk` | Yes | Yes | Yes | Yes | Yes | Yes | Yes | N/A | Yes |

## 8. Junior/Senior/UP Review
- `execute_junior_import_chunk` lacks an actual `category_codes` check in the SQL query (it claims "not in JUNIOR category" on error, but does not enforce it in the `WHERE` clause).
- `execute_senior_import_chunk` enforces `SENIOR`, `SR`, or `GN`.
- `execute_upper_primary_import_chunk` enforces `UPPER PRIMARY`, `UP`, or `GN`.

## 9. LP/HS/HSS Review
- Item lookup is strictly `festival_id = p_festival_id`.
- Null-festival items will fail (SAFE INTENTIONAL CHANGE).
- Duplicate participants correctly scoped.

## 10. General Import Review
- Safe `uuid` parsing with `EXCEPTION WHEN OTHERS`.
- Reused participants enforce `tenant_id = p_tenant_id` and `festival_id = p_festival_id`.
- Duplicate registration prevented safely.

## 11. Schedule Import Review
- Target festival checked against tenant.
- Item checked against festival.
- Venue checked against tenant AND festival (`WHERE festival_id = p_festival_id AND tenant_id = p_tenant_id`).
- Overlaps blocked securely.

## 12. Entity Ownership Validation
- Entity ownership validation is COMPLETE. All critical entities (participants, registrations, items, venues, schedules) are safely scoped to the authorized tenant and festival.

## 13. SECURITY DEFINER Review
- SAFE WITH HARDENING RECOMMENDATION. `SET search_path = public` is used and most objects are fully qualified (e.g., `public.participants`). However, `search_path = ''` would be stricter.

## 14. Search Path Review
- `SET search_path = public` applied consistently to all RPCs.

## 15. Grant Matrix
- `PUBLIC` → no execute.
- `anon` → no execute.
- `authenticated` → execute (restricted internally by role/tenant).

## 16. Raw Error Review
- No `SQLERRM` leakage.
- Clean JSON arrays for row-level warnings/errors.
- Does not expose cross-tenant names/data.

## 17. Frontend Compatibility
- Complete frontend compatibility preserved. RPC parameters and return shapes remain identical.

## 18. Legacy Bypass Search
- No overloads found. Old functions are replaced entirely (`CREATE OR REPLACE FUNCTION`).

## 19. Negative Test Analysis
- All negative tests (Anonymous execution, normal member execution, sibling import, foreign participant reuse, etc.) PASS BY SQL EVIDENCE.

## 20. Positive Regression Analysis
- Valid imports and hierarchy access LIKELY PASS by code evidence.

## 21. Issues Found
- **REMAINING VALIDATION GAP:** `execute_junior_import_chunk` is missing the `category_codes` filter in the item lookup.
- **Own-tenant Check Constraint:** `_assert_import_access` relies entirely on `get_visible_organisations()`. If a tenant admin doesn't have a valid organization hierarchy structure, they might be locked out of their own tenant, though securely.

## 22. Required Corrections
- 1 small correction: Add `AND 'JUNIOR' = ANY(category_codes)` to `execute_junior_import_chunk`.

## 23. Remaining Limitations
- None critical.

## 24. Deployment Readiness
- Ready for staging deployment (with minor validation gap fix).

## 25. Final Verdict
- PASS WITH SMALL FIXES

## 26. Confirmation of No Changes
- Verified read-only execution. No source, migration, or DB changes performed.
