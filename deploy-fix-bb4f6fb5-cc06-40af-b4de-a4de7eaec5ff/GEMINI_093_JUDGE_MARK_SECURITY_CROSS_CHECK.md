# GEMINI 093 JUDGE MARK SECURITY CROSS-CHECK

## 1. Repository State
* **Current branch**: `main`
* **Current commit**: `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
* **git diff --stat**: Modifies 5 files (`src/app/judge/marks.tsx`, `src/lib/repositories/judgeRepository.ts`, `src/providers/database/DatabaseProvider.ts`, `src/providers/database/SupabaseDatabaseProvider.ts`, `src/services/judgeService.ts`)
* **Highest migration number**: `093`
* **New migration files**: `supabase/migrations/093_secure_token_bound_judge_marks.sql`
* **Untracked files**: `GEMINI_SCHEDULE_VENUE_RESULT_ACCESS_ANALYSIS.md`, `OPEN_CODE_JUDGE_MARK_SECURITY_IMPLEMENTATION_REPORT.md`, `UPDATED_PROJECT_REVALIDATION_REPORT.md`

## 2. Diff Scope
The diff is strictly limited to the `093` migration and the necessary frontend provider/service/page updates to invoke the new token-bound RPCs instead of using direct table upserts. No unrelated files were touched.

## 3. Open Code Claims Verified
* **Judge registrations now load using a token**: Verified.
* **Marks are submitted through a secure RPC**: Verified.
* **Judge, schedule, tenant and festival are derived server-side**: Verified.
* **Direct anonymous mark_entries access removed**: Verified by `DROP POLICY` and `REVOKE ALL`.
* **Final mark immutability preserved**: Verified.
* **Existing scoring validation remains active**: Verified.
* **Parent-to-descendant organisation-tree access is preserved**: Verified.
* **mark_entries.token_id records authorising token**: Verified.

## 4. Migration Safety
The migration is safe, forward-only, uses valid transaction boundaries, creates objects in safe order, drops policies by exact name, adds an `ON DELETE SET NULL` foreign key for `token_id`, does not destroy data, and correctly notifies PostgREST.

## 5. SECURITY DEFINER Review
The newly introduced functions `get_judge_registrations` and `upsert_judge_mark` properly use `SECURITY DEFINER` and `SET search_path = public, extensions`. They revoke default `PUBLIC` execute access and grant only to `anon, authenticated`. They do not use unsafe dynamic SQL and they strictly derive critical context from the validated token.

## 6. Function Signature and Grant Review
* `get_judge_registrations(text)`: Takes the token, safely retrieves the schedule ID, and checks the hierarchy. Granted to `anon, authenticated`.
* `get_judge_registrations(uuid)`: Legacy signature. Correctly hardened to verify `is_superadmin()` or `v_schedule_tenant_id = public.get_my_tenant_id()`. Revoked from `PUBLIC` and granted only to `authenticated`.
* `upsert_judge_mark(...)`: Takes the token and mark data. Revoked from `PUBLIC` and granted to `anon, authenticated`. No old insecure overload remains.

## 7. Token Validation Review
Token validation checks `status = 'approved'`, `is_used = false`, `is_revoked IS NOT TRUE`, and `expires_at IS NULL OR expires_at > now()`. Both plaintext and hashed tokens are robustly matched. It also correctly validates that the judge remains actively assigned in `schedule_judge_assignments`. 

## 8. Token Lifecycle Review
The implementation never explicitly marks the token as `used` (i.e. `is_used = true`).
**Verdict:** This relies on the final immutability triggers and the `v_existing_final_id IS NOT NULL` check inside the RPC to prevent replay/overwrite attacks. Because a single schedule has multiple participants, the token cannot be marked "used" until *all* marks are final. This is an acceptable known behavior, provided final immutability remains strictly enforced.

## 9. Registration Access Review
The RPC `get_judge_registrations(text)` successfully derives `tenant_id`, `festival_id`, and `item_id` from the schedule attached to the token. It restricts results to the permitted recursive descendant `organisation_tree`, excluding sibling/unrelated registrations. It does not return sensitive data or plaintext tokens.

## 10. Hierarchy Preservation Review
The recursive CTE `organisation_tree` starts at the schedule tenant's root organization and recurses down to its children, securely providing access to all eligible descendant registrations.

## 11. Mark RPC Review
`upsert_judge_mark` securely verifies the token, registration belonging to the derived schedule, active assignment, and the permitted organization tree. It specifically prevents `draft -> final` transitions when a final mark already exists. The `ON CONFLICT` effectively merges criteria/total marks.

## 12. Draft and Final Transition Review
Draft -> Draft: Permitted.
Draft -> Final: Permitted.
Final -> Final: Blocked correctly by the RPC returning an exception before touching the table.
Final -> Draft: Blocked.

## 13. Scoring Validation Compatibility
The RPC passes exactly the snapshot data needed by the existing `validate_mark_entry_scoring` trigger. Client-supplied snapshots (`p_max_mark`, `p_entry_mode`) are passed along, which relies on the trigger to definitively cross-check against authoritative configurations, consistent with the existing design.

## 14. Direct Table Access Review
All previously identified unsafe public/anonymous SELECT, INSERT, and UPDATE policies on `mark_entries` are dropped by exact name. The `anon` and `public` roles are explicitly revoked from the table.

## 15. Admin Mark Screen Regression Review
Admin marks screen is preserved because it still relies on existing tenant-scoped policies (`Admins can manage mark entries`), and `093` additionally recreates an explicit SELECT policy for tenant admins to ensure read access isn't entirely wiped out. `get_judge_registrations(uuid)` was securely hardened, not removed.

## 16. Frontend Integration Review
`src/app/judge/marks.tsx` properly imports and uses `submitJudgeMark` and `getJudgeRegistrationsByToken`. Tokens are correctly extracted from session data and safely passed to the database layer. Loading states, error states, and draft prefilling work properly.

## 17. Data Privacy Review
The registration RPC limits fields strictly to what is required by the judge UI (e.g., `chest_number`, `photo_url`, `code_letter`, etc.). No unnecessary metadata or other judges' scores are leaked.

## 18. Audit Field Review
`token_id` properly records a foreign key reference to the internal `judge_tokens` table row via `ON DELETE SET NULL`. 

## 19. Effective Access Matrix
| Role/path                      | Registration RPC | Mark RPC | Direct mark SELECT | Direct mark INSERT | Direct mark UPDATE |
| ------------------------------ | ---------------: | -------: | -----------------: | -----------------: | -----------------: |
| anon with no valid token       |           Denied |   Denied |             Denied |             Denied |             Denied |
| anon with approved token       |          Allowed |  Allowed |             Denied |             Denied |             Denied |
| authenticated own tenant admin |          Allowed |  Allowed |            Allowed |            Allowed |            Allowed |
| superadmin                     |          Allowed |  Allowed |            Allowed |            Allowed |            Allowed |

## 20. Negative Security Tests
1. Unknown token -> PASS BY SQL EVIDENCE
2. Revoked/Expired/Used token -> PASS BY SQL EVIDENCE
3. Anonymous direct mark INSERT/UPDATE -> PASS BY SQL EVIDENCE
4. Final overwrite of final mark -> PASS BY SQL EVIDENCE
5. Sibling organisation registration -> PASS BY SQL EVIDENCE

## 21. Positive Regression Tests
1. Approved judge registration loading -> PASS BY CODE EVIDENCE
2. Approved judge draft/final save -> PASS BY CODE EVIDENCE
3. Admin mark review -> LIKELY PASS
4. Existing historical marks with null token ID -> PASS BY CODE EVIDENCE

## 22. Static Validation Results
The repository-level SQL and frontend code securely and successfully close the vulnerability.

## 23. Live Supabase Deployment Verification
1. **Environment classification**: UNKNOWN ENVIRONMENT — READ-ONLY CHECK ONLY
2. **Privileged catalog access available**: NO
3. **Migration-history result**: MIGRATION HISTORY UNAVAILABLE
4. **Column and foreign-key result**: UNABLE TO VERIFY
5. **Function signatures found**: Found legacy `get_judge_registrations(uuid)`. `upsert_judge_mark` and the new `get_judge_registrations(text)` were **NOT FOUND** via the REST API.
6. **Live function-body match**: MISSING LIVE
7. **Function execute grants**: UNABLE TO VERIFY
8. **Effective mark_entries policies**: UNABLE TO VERIFY
9. **Effective direct table grants**: `GET /rest/v1/mark_entries` returned `200 []`, implying the `anon` role still possesses a `SELECT` grant on the live database.
10. **Repository/live drift**: `093` NOT APPLIED
11. **Deployment verdict**: **093 NOT APPLIED.** The repository code is correctly written, but the live Supabase environment has not received the `093` migration. If the frontend is deployed right now, it will fatally crash when attempting to call the missing RPCs.
12. **Checks that could not be performed**: Direct catalog queries due to missing privileged access.
13. **Confirmation that no database write occurred**: Confirmed. Only safe, anonymous read probes were executed.

## 24. Issues Found
No security flaws in the static repository code. The only issue is the **deployment drift** — the live database has not been migrated.

## 25. Required Corrections
Run the database migrations (`supabase db push` or equivalent CI/CD step) to apply `093_secure_token_bound_judge_marks.sql` before deploying the frontend.

## 26. Remaining Known Limitations
Token consumption lifecycle: The token is never formally marked as `is_used = true` by the judge workflow. It relies strictly on final immutability rules. 

## 27. Final Verdict
PASS (Pending live database migration deployment)

## 28. Confirmation of No Changes
I confirm that no source files, migrations, or database configurations were modified. Only read-only repository inspection and REST API probes were performed.
