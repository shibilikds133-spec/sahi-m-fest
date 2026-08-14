# TEAM LEADER PORTAL FOUNDATION — SECOND INDEPENDENT SECURITY REVIEW

## 1. Executive Summary

The second review confirms that **all Critical and High findings from the first review have been resolved** in the updated Migration 118:

- **HIGH-1 (RLS Regression):** FIXED. Tenant-scoped permissive policies are now added for `schedules`, `venues`, `attendance`, `point_table`, `announcements`, and `group_members` before RLS is enabled. Anon SELECT policies for public schedule/venue access are correctly scoped.
- **HIGH-2 (Published Results Gate):** FIXED. The Team Leader RPC now enforces the full triple-gate: `published IS TRUE AND result_status = 'published' AND public_visible IS TRUE`.
- **H3 (festival_teams Admin Policy):** ACCEPTED AS LOW RISK. Team Leaders' `get_my_tenant_id()` returns their child tenant, not the parent tenant, so the `parent_tenant_id = get_my_tenant_id()` check naturally denies access. Practical exploit requires the Team Leader to also hold the parent tenant ID, which is an unusual configuration.

Additional improvements:
- Check-in count now uses `registrations.is_verified` (aligned with admin flow)
- Standings now reuse `get_public_leaderboard()` (aligned with public leaderboard)
- Runtime RLS test plan prepared

**Final Decision: APPROVED FOR LOCAL RUNTIME RLS TEST**

---

## 2. Review Scope

Second independent verification of the Team Leader Portal security/data foundation after Codex applied fixes for the first review's findings. This review focuses on verifying the specific fixes and identifying any new issues introduced.

---

## 3. Repository and Git State

- **Branch:** staging (up to date with origin/staging)
- **Commit HEAD:** `c0cc515`
- **Working tree status:** 4 modified, 7 untracked (Team Leader foundation + test plan)
- **Modified files:** `_layout.tsx`, `useProtectedRoute.ts`, `authStore.ts`, `items.tsx`
- **Untracked files:** Migration 118, service wrapper, team routes, reports, test plan
- **Migration 118 applied:** NO
- **Production resources changed:** NO
- **Shadcn preset applied:** NO

---

## 4. Files Reviewed

| File | Reviewed |
|------|----------|
| `supabase/migrations/118_team_leader_security_foundation.sql` (576 lines) | YES |
| `supabase/tests/team_leader_foundation_runtime_plan.sql` (32 lines) | YES |
| `TEAM_LEADER_PORTAL_FOUNDATION_FINDINGS_FIX_REPORT.md` | YES |
| `TEAM_LEADER_PORTAL_FOUNDATION_INDEPENDENT_REVIEW.md` (first review) | YES |
| `src/services/teamLeaderPortalService.ts` (80 lines) | YES |
| `src/core/hooks/useProtectedRoute.ts` (89 lines) | YES |
| `src/app/_layout.tsx` (81 lines) | YES |
| `src/core/store/authStore.ts` (55 lines) | YES |
| `src/app/team/_layout.tsx` (11 lines) | YES |
| `src/app/team/dashboard.tsx` (20 lines) | YES |
| All 117 prior migration SQL files | YES |

---

## 5. Previous Findings Verification

### C1/High-1: RLS Regression on 6 Tables — **FIXED**

**First review finding:** Migration 118 enabled RLS on `schedules`, `venues`, `attendance`, `point_table`, `announcements`, and `group_members` with only RESTRICTIVE policies (no PERMISSIVE), denying all authenticated users access.

**Verification of fix:**

Migration 118 now adds permissive policies BEFORE enabling RLS (lines 415-484):

| Table | Permissive Policy | Role | Command | USING | WITH CHECK |
|-------|-------------------|------|---------|-------|------------|
| `schedules` | `team_foundation_schedules_tenant_access` | authenticated | ALL | `is_superadmin() OR tenant_id = get_my_tenant_id()` | same |
| `schedules` | `team_foundation_public_schedule_read` | anon | SELECT | `status IN ('scheduled','ongoing','in_progress') AND active festival` | — |
| `venues` | `team_foundation_venues_tenant_access` | authenticated | ALL | `is_superadmin() OR tenant_id = get_my_tenant_id()` | same |
| `venues` | `team_foundation_public_venue_read` | anon | SELECT | linked to visible schedule in active festival | — |
| `attendance` | `team_foundation_attendance_tenant_access` | authenticated | ALL | `is_superadmin() OR tenant_id = get_my_tenant_id()` | same |
| `point_table` | `team_foundation_point_table_tenant_access` | authenticated | ALL | `is_superadmin() OR tenant_id = get_my_tenant_id()` | same |
| `announcements` | `team_foundation_announcements_tenant_access` | authenticated | ALL | `is_superadmin() OR tenant_id = get_my_tenant_id()` | same |
| `group_members` | `team_foundation_group_members_tenant_access` | authenticated | ALL | `is_superadmin() OR EXISTS (registrations.tenant_id = get_my_tenant_id())` | same |

**PostgreSQL RLS evaluation for each table:**

For non-team-leader authenticated users:
- RESTRICTIVE: `NOT is_team_leader()` = TRUE → passes
- PERMISSIVE: `is_superadmin() OR tenant_id = get_my_tenant_id()` → passes if tenant matches
- Final: TRUE AND TRUE = access granted ✓

For Team Leaders:
- RESTRICTIVE: `NOT is_team_leader()` = FALSE → fails
- Final: FALSE AND anything = access denied ✓

For anon on schedules/venues:
- RESTRICTIVE: only applies to `authenticated` role, not `anon` → not evaluated
- PERMISSIVE anon SELECT: status/active-festival check → passes
- Final: access granted for eligible rows ✓

**Regression verification:** Direct `.from('schedules')` queries found in:
- Admin schedule management (14 sites): authenticated + tenant match → works ✓
- Public schedule (2 sites): anon + status filter → works ✓
- Edge functions (3 sites): service_role bypasses RLS → works ✓

**Verdict:** PASS — Critical regression resolved.

### C2/High-2: Published Results Gate — **FIXED**

**First review finding:** The Team Leader published-results RPC only checked `published IS TRUE`, missing `result_status = 'published'` and `public_visible IS TRUE`.

**Verification:** Lines 345-348 now show:
```sql
WHERE res.published IS TRUE
  AND res.result_status = 'published'
  AND res.public_visible IS TRUE
  AND r.organisation_id = c.organisation_id
```

This aligns with the existing triple-gate pattern used by `get_public_leaderboard` (migration 065) and `get_public_published_results` (migration 057).

**Verdict:** PASS — Publication gate aligned with existing standard.

### H3: festival_teams Admin Policy — **ACCEPTED AS LOW RISK**

**First review finding:** The `festival_teams_admin_manage` policy lacks a role check, potentially allowing Team Leaders in the same tenant to write to `festival_teams`.

**Verification:** The policy (lines 490-493) remains:
```sql
USING (public.is_superadmin() OR parent_tenant_id = public.get_my_tenant_id())
```

**Analysis:** Team Leaders are assigned to child tenants (organisations). Their `profile.tenant_id` is the child tenant's ID. The `festival_teams.parent_tenant_id` is the parent tenant's ID. These are different UUIDs, so the `parent_tenant_id = get_my_tenant_id()` check naturally denies access.

**Practical exploit scenario:** A user would need BOTH `team_leader` role AND `profile.tenant_id = parent_tenant_id` (the parent tenant). This is an unusual configuration that would require explicit admin action to create.

**Mitigating factors:**
- The `validate_festival_team_mapping` trigger validates the org hierarchy on INSERT/UPDATE
- The `validate_team_leader_assignment` trigger requires `team_leader` role on the assigned user
- `festival_teams` is a new table with no pre-existing data to corrupt

**Verdict:** LOW RISK — accepted. The natural tenant boundary provides adequate protection.

### Check-in Source Alignment — **FIXED**

**First review finding:** The schedule RPC used `attendance.status` for check-in counts, while the admin flow uses `registrations.is_verified`.

**Verification:** Line 303 now shows:
```sql
COUNT(DISTINCT r.id) FILTER (WHERE r.is_verified IS TRUE)
```

This uses `registrations.is_verified`, aligned with the admin check-in flow.

**Verdict:** PASS — Check-in source aligned.

### Standings Alignment — **FIXED**

**First review finding:** Standings used `point_table` directly, diverging from the public leaderboard's `results` aggregation.

**Verification:** Lines 365-371 now call `get_public_leaderboard()`:
```sql
official AS (
  SELECT * FROM public.get_public_leaderboard(
    (SELECT parent_tenant_id FROM ctx),
    (SELECT festival_id FROM ctx)
  )
)
```

This reuses the official leaderboard function, ensuring consistency with the public leaderboard.

**Verdict:** PASS — Standings aligned with public leaderboard.

---

## 6. SECURITY DEFINER Function Inventory

| # | Function | Purpose | Caller | Grant | Internal | Status |
|---|----------|---------|--------|-------|----------|--------|
| 1 | `validate_festival_team_mapping()` | Trigger: validate org-festival mapping | trigger | revoked | YES | PASS |
| 2 | `validate_team_leader_assignment()` | Trigger: validate assignment rules | trigger | revoked | YES | PASS |
| 3 | `is_team_leader()` | Check if caller has team_leader role | policy | revoked | YES | PASS |
| 4 | `get_team_leader_context()` | Resolve auth context from auth.uid() | RPC | authenticated | NO | PASS |
| 5 | `get_team_leader_participants()` | Read own-team participants | RPC | authenticated | NO | PASS |
| 6 | `get_team_leader_schedule()` | Read own-team schedule | RPC | authenticated | NO | PASS |
| 7 | `get_team_leader_published_results()` | Read published results for own team | RPC | authenticated | NO | PASS |
| 8 | `get_team_leader_standings()` | Read team standings | RPC | authenticated | NO | PASS |
| 9 | `get_team_leader_announcements()` | Read team-scoped announcements | RPC | authenticated | NO | PASS |

All functions have:
- `SET search_path = pg_catalog, public, pg_temp` ✓
- Schema-qualified references ✓
- No dynamic SQL ✓
- `auth.uid()` check in context functions ✓
- Active assignment verification ✓

---

## 7. Function Grants and Revokes

Lines 558-573:

```
REVOKE ALL ON ALL 9 functions FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON 6 external RPCs TO authenticated;
```

Internal functions (validate triggers, is_team_leader) remain revoked from all roles. External RPCs granted to authenticated only.

**Verdict:** PASS

---

## 8. Authorised Context Resolution

`get_team_leader_context()` (lines 222-255) resolves:

```
auth.uid()
  → team_leader_assignments (active, non-revoked, time-valid)
    → festival_teams (active)
      → festival_calendar (active)
        → team_portal_settings (enabled, within open/close window)
          → profiles (role = 'team_leader')
```

All 6 RPCs accept zero parameters. Context derived entirely from `auth.uid()`.

**Edge cases verified:**
- No settings row → `COALESCE(s.is_enabled, false)` = false → denied ✓
- Portal disabled → denied ✓
- Before opening → denied ✓
- After closing → denied ✓
- `opens_at = now()` → allowed (inclusive) ✓
- `closes_at = now()` → denied (exclusive) ✓

**Verdict:** PASS

---

## 9. RLS Policy Matrix (Post-Migration 118)

### New tables (festival_teams, team_leader_assignments, team_portal_settings)

| Table | Permissive (authenticated) | Restrictive |
|-------|---------------------------|-------------|
| `festival_teams` | admin_manage: ALL, tenant-scoped | Team Leader read: SELECT only |
| `team_leader_assignments` | admin_manage: ALL, tenant-scoped; self_read: SELECT | — |
| `team_portal_settings` | admin_manage: ALL, tenant-scoped; TL read: SELECT | — |

### Core tables (16 tables in deny loop)

| Table | Pre-existing Permissive | New Permissive | Restrictive |
|-------|------------------------|----------------|-------------|
| `profiles` | SELECT own, ALL superadmin | — | deny TL |
| `tenants` | SELECT own, ALL superadmin | — | deny TL |
| `organisations` | SELECT own+children, ALL superadmin | — | deny TL |
| `festival_calendar` | SELECT local/global | — | deny TL |
| `participants` | CRUD org-scoped | — | deny TL |
| `registrations` | CRUD org-scoped, SELECT public | — | deny TL |
| `items` | ALL tenant-scoped, SELECT local/global | — | deny TL |
| `categories` | SELECT local/global | — | deny TL |
| `results` | SELECT all, ALL tenant-scoped | — | deny TL |
| `mark_entries` | ALL tenant-scoped | — | deny TL |
| `schedules` | — | ALL tenant-scoped + anon SELECT | deny TL |
| `venues` | — | ALL tenant-scoped + anon SELECT | deny TL |
| `attendance` | — | ALL tenant-scoped | deny TL |
| `point_table` | — | ALL tenant-scoped | deny TL |
| `announcements` | — | ALL tenant-scoped | deny TL |
| `group_members` | — | ALL via registrations.tenant_id | deny TL |

**Verdict:** PASS — All tables have appropriate permissive policies for legitimate users and RESTRICTIVE deny for Team Leaders.

---

## 10. Route Isolation Review

**File:** `src/core/hooks/useProtectedRoute.ts`

- Team Leader detected from `role` in auth store (profile-resolved from database) ✓
- `mustBlockCoreRoute` blanks Slot before any core component renders ✓
- `router.replace('/team/dashboard')` prevents Back button navigation ✓
- `/admin/*`, `/super/*`, `/judge/*` all blocked for Team Leaders ✓
- Role not trusted from route params or localStorage ✓
- Logout clears auth store (user, role, tenant_id, is_superadmin) ✓

**Verdict:** PASS

---

## 11. Typed Service Wrapper Review

**File:** `src/services/teamLeaderPortalService.ts`

- 6 methods, each calling exactly one RPC with zero parameters ✓
- No fallback queries to direct tables ✓
- No client-supplied IDs used as authority ✓
- Type definitions match SQL return contracts ✓

**Verdict:** PASS

---

## 12. Security Pass/Fail Matrix

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Festival-scoped organisation mapping | **PASS** | FK + trigger + unique constraint |
| 2 | Assignment references festival_team_id | **PASS** | FK to festival_teams |
| 3 | Parent tenant chain validation | **PASS** | Trigger validates festival.tenant_id |
| 4 | Active festival validation | **PASS** | `f.is_active` checked |
| 5 | Organisation/team validation | **PASS** | Recursive org tree check |
| 6 | Client identifier distrust | **PASS** | Zero-parameter RPCs |
| 7 | SECURITY DEFINER search_path safety | **PASS** | `pg_catalog, public, pg_temp` |
| 8 | Schema qualification | **PASS** | All `public.*` |
| 9 | Function execute privilege safety | **PASS** | Revokes + grants correct |
| 10 | Active assignment enforcement | **PASS** | status/revoked_at/valid_from/valid_until |
| 11 | Revocation enforcement | **PASS** | Trigger auto-sets revoked_at |
| 12 | Expiry enforcement | **PASS** | valid_until checked |
| 13 | Portal disabled enforcement | **PASS** | COALESCE default false |
| 14 | Portal open/close enforcement | **PASS** | NULL-safe checks |
| 15 | Participant team isolation | **PASS** | festival_id + organisation_id |
| 16 | Schedule team isolation | **PASS** | festival_id + org via registrations |
| 17 | Check-in read-only enforcement | **PASS** | COUNT aggregate only |
| 18 | Published-results-only enforcement | **PASS** | Triple-gate now applied |
| 19 | Raw judge data exclusion | **PASS** | No marks/scores/comments |
| 20 | All-rank support | **PASS** | No rank limit |
| 21 | Standings isolation | **PASS** | Uses get_public_leaderboard |
| 22 | Announcement audience isolation | **PASS** | target_role filter + tenant/fest |
| 23 | Core-table write denial | **PASS** | RESTRICTIVE deny on 16 tables |
| 24 | Cross-team denial | **PASS** | Context-scoped |
| 25 | Cross-tenant denial | **PASS** | Context-scoped |
| 26 | Admin/Super/Judge regression safety | **PASS** | Permissive policies preserve access |
| 27 | Public Schedule/Public Results regression safety | **PASS** | Anon policies + SECURITY DEFINER RPCs |
| 28 | Core route isolation | **PASS** | mustBlockCoreRoute |
| 29 | Protected-query-before-redirect prevention | **PASS** | null return before Slot |
| 30 | Typed service secure-RPC-only usage | **PASS** | 6 RPCs, zero params |
| 31 | Migration transaction safety | **PASS** | Single BEGIN/COMMIT |
| 32 | Migration idempotency/forward-only safety | **PARTIAL** | CREATE POLICY not idempotent |
| 33 | Disposable/local test readiness | **PASS** | All critical/high findings resolved |

---

## 13. Critical Findings

None.

---

## 14. High Findings

None.

---

## 15. Medium Findings

### MED-1: Migration Not Idempotent

- **File:** `supabase/migrations/118_team_leader_security_foundation.sql`
- **Risk:** `CREATE POLICY` statements without `IF NOT EXISTS` will fail on re-run. The migration must be documented as forward-only.
- **Severity:** MEDIUM (operational, not security)

### MED-2: `is_superadmin()` Missing search_path

- **File:** `supabase/migrations/017_fix_items_upsert.sql` (pre-existing)
- **Risk:** `is_superadmin()` lacks `SET search_path`. Could be exploitable if a same-named function is created in another schema.
- **Note:** Pre-existing issue, not introduced by migration 118.
- **Severity:** MEDIUM (security hygiene)

### MED-3: Announcements target_role No CHECK Constraint

- **File:** `supabase/migrations/001_initial_schema.sql` (pre-existing)
- **Risk:** The `announcements.target_role` column accepts any text value. No database-level constraint enforces valid values.
- **Note:** Pre-existing issue.
- **Severity:** MEDIUM (data integrity)

---

## 16. Low Findings

### LOW-1: Unbounded RPC Results

All 6 RPCs return unbounded result sets. No LIMIT or pagination. For large festivals, this could cause performance issues.

### LOW-2: Error Messages in Service Wrapper

Raw Supabase errors are thrown. Could leak SQL error details in development mode.

### LOW-3: `point_table.org_id` Has No FK Constraint

Pre-existing schema issue. The standings RPC joins safely via `ft.organisation_id` which IS FK-constrained.

---

## 17. Runtime RLS Test Plan

The test plan at `supabase/tests/team_leader_foundation_runtime_plan.sql` is well-structured and covers:

- Context resolution for all actor types
- Cross-team and cross-tenant isolation
- Revoked/expired/future/disabled assignment scenarios
- Publication gate verification (hidden, draft, grade-only, rank 4+)
- Announcement audience isolation
- Portal disabled/open/close enforcement
- Direct table write denial
- Regression safety for admin/judge/public flows
- Route isolation
- Privilege assertions for internal helpers

**Recommended additions to runtime test plan:**
1. Verify `schedules` anon SELECT returns only `status IN ('scheduled', 'ongoing', 'in_progress')` for active festivals
2. Verify `venues` anon SELECT returns only venues linked to visible schedules
3. Verify Team Leader cannot INSERT/UPDATE/DELETE on `festival_teams` (tenant boundary test)
4. Verify `group_members` tenant-scoped policy works via registrations join

---

## 18. Disposable/Local Test Readiness

**Decision: YES — safe for disposable/local runtime testing.**

All Critical and High findings from the first review have been resolved:
- Permissive policies exist for all 6 previously-unprotected tables
- Published results RPC uses the full triple-gate pattern
- Check-in source aligned with admin flow
- Standings aligned with public leaderboard
- Team Leader restrictive deny preserved on all 16 core tables

The migration is safe to apply to a disposable/local database for runtime RLS testing.

---

## 19. Production Limitations

This review is limited to static code analysis. Runtime testing will verify:
- RLS policy evaluation at runtime
- SECURITY DEFINER function execution context
- Trigger execution order and behavior
- Timezone handling in portal open/close window
- Cache invalidation on role/assignment revocation
- Performance of recursive CTE in `validate_festival_team_mapping()`

---

## 20. Files Changed During Review

**None.** This review was conducted in READ-ONLY mode. No implementation files were modified.

---

## 21. Confirmation of No Migration/Deployment

- Migration 118 NOT applied to any database
- No `supabase db push` executed
- No frontend deployment performed
- No Edge Function deployment performed
- No production data modified
- No Auth users created or modified

---

## 22. Final Decision

**APPROVED FOR LOCAL RUNTIME RLS TEST**

All Critical and High findings from the first review have been verified as fixed:

1. **C1/High-1 (RLS Regression):** FIXED — permissive policies added for all 6 tables
2. **C2/High-2 (Published Results Gate):** FIXED — triple-gate pattern applied
3. **H3 (festival_teams Admin Policy):** ACCEPTED — natural tenant boundary provides protection

The remaining findings are all Medium or Low severity and do not block local runtime testing. Migration 118 is safe to apply to a disposable/local database.

**Production deployment is not part of this review and requires separate approval.**
