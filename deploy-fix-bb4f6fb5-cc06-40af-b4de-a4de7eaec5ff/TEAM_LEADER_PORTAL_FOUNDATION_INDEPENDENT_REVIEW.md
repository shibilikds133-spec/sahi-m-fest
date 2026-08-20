# TEAM LEADER PORTAL FOUNDATION — INDEPENDENT SECURITY REVIEW

**Reviewer:** MiMo  
**Review Mode:** READ-ONLY  
**Date:** 2026-08-05  
**Branch:** staging  
**Commit:** c0cc5150a62cc7cb0b9b1c4b6258770fa012ba07  
**Migration 118 applied:** NO  
**Production resources changed:** NO  

---

## 1. EXECUTIVE SUMMARY

The Team Leader Portal security/data foundation is architecturally sound in its
core design: SECURITY DEFINER RPCs that resolve context from `auth.uid()`,
restrictive RLS deny policies on core tables, and a dedicated `/team/*` route
namespace with client-side blocking. The assignment model, portal availability
checks, and context chain validation are well-implemented.

**However, Migration 118 contains two critical regressions**:

1. **RLS Regression**: It enables RLS on six tables (`schedules`, `venues`,
   `group_members`, `attendance`, `point_table`, `announcements`) that previously
   had NO RLS, and adds only RESTRICTIVE policies (no PERMISSIVE). PostgreSQL
   denies all access when only RESTRICTIVE policies exist. This will break direct
   authenticated queries to these tables, affecting admin schedule management,
   venue lookups, public leaderboard queries, and existing check-in flows.

2. **Published-Results Weaker Gate**: The published-results RPC uses
   `published IS TRUE` instead of the existing triple-gate pattern
   (`published IS TRUE AND result_status = 'published' AND public_visible IS TRUE`),
   potentially exposing results that are internally marked as hidden or not
   public-visible.

**Decision: CHANGES REQUIRED BEFORE RUNTIME TEST**

Two Critical and one High finding must be addressed before disposable/local
runtime testing can produce meaningful results.

---

## 2. REVIEW SCOPE

This review covers the security and data foundation of the Team Leader Portal
as implemented in:

- `supabase/migrations/118_team_leader_security_foundation.sql`
- `src/services/teamLeaderPortalService.ts`
- `src/app/_layout.tsx` (root layout changes)
- `src/core/hooks/useProtectedRoute.ts` (route guard changes)
- `src/core/store/authStore.ts` (role type additions)
- `src/app/team/_layout.tsx` (team namespace layout)
- `src/app/team/dashboard.tsx` (placeholder screen)

All existing helper functions, RLS policies, and schema definitions referenced
by Migration 118 were independently verified.

---

## 3. REPOSITORY AND GIT STATE

- **Branch:** staging (up to date with origin/staging)
- **HEAD commit:** c0cc515 (generate unique chest numbers per festival)
- **Uncommitted changes:** 4 modified, 5 untracked (all team-leader foundation)
- **`git diff --check`:** PASS (3 CRLF warnings only, pre-existing)
- **Modified files:** `_layout.tsx`, `useProtectedRoute.ts`, `authStore.ts`, `items.tsx`
- **Untracked files:** `118_team_leader_security_foundation.sql`, `teamLeaderPortalService.ts`, `src/app/team/`, `TEAM_LEADER_PORTAL_MASTER_IMPLEMENTATION_REPORT.md`, `TEAM_LEADER_PORTAL_FOUNDATION_INDEPENDENT_REVIEW.md`

---

## 4. FILES REVIEWED

| File | Reviewed |
|------|----------|
| `supabase/migrations/118_team_leader_security_foundation.sql` | YES |
| `src/services/teamLeaderPortalService.ts` | YES |
| `src/app/_layout.tsx` | YES |
| `src/core/hooks/useProtectedRoute.ts` | YES |
| `src/core/store/authStore.ts` | YES |
| `src/app/team/_layout.tsx` | YES |
| `src/app/team/dashboard.tsx` | YES |
| `TEAM_LEADER_PORTAL_MASTER_IMPLEMENTATION_REPORT.md` | YES |
| `src/services/authService.ts` | YES |
| `src/providers/database/SupabaseDatabaseProvider.ts` | YES |
| `src/services/scheduleService.ts` | YES |
| `src/lib/repositories/scheduleRepository.ts` | YES |
| `src/core/hooks/useSchedule.ts` | YES |
| `supabase/migrations/001_initial_schema.sql` | YES |
| `supabase/migrations/011_multi_tenant_rls.sql` | YES |
| `supabase/migrations/014_fix_org_rls.sql` | YES |
| `supabase/migrations/017_fix_items_upsert.sql` | YES |
| `supabase/migrations/018_phase5_judges_marks_results.sql` | YES |
| `supabase/migrations/029_hybrid_participant_management.sql` | YES |
| `supabase/migrations/034_result_visibility.sql` | YES |
| `supabase/migrations/046_result_workflow_public_visibility_split.sql` | YES |
| `supabase/migrations/053_public_result_no.sql` | YES |
| `supabase/migrations/065_fix_public_leaderboard_visibility.sql` | YES |
| `supabase/migrations/067_public_ai_views.sql` | YES |
| `supabase/migrations/068_public_registrations_policy.sql` | YES |
| `supabase/migrations/093_secure_token_bound_judge_marks.sql` | YES |
| `supabase/migrations/095_complete_judge_mark_acl_hardening.sql` | YES |
| `supabase/migrations/098_tenant_access_disable_archive.sql` | YES |
| `supabase/migrations/099_tenant_child_provisioning_safety.sql` | YES |
| `src/app/(admin)/settings/items.tsx` | YES |
| `src/app/(public)/leaderboard.tsx` | YES |
| `src/app/stage-management/index.tsx` | YES |

---

## 5. ARCHITECTURE UNDERSTANDING

### 5.1 Approved hierarchy

```
Parent Tenant
  → Active Festival
    → festival_teams (maps organisations to festivals)
      → team_leader_assignments (binds auth.uid() to festival_team)
        → Team Leader Auth User
```

### 5.2 Security resolution chain

```
auth.uid()
  → team_leader_assignments (active, not revoked, within validity window)
    → festival_teams (active, scoped to parent tenant + festival)
      → organisations (canonical team/house/department identity)
        → portal_settings (enabled, within open/close window)
```

### 5.3 Data access path

All private data is accessed exclusively through SECURITY DEFINER RPCs that
resolve the above chain server-side. No client-supplied identifiers are used
as authority. The frontend service wrapper calls only these RPCs with no
parameters.

### 5.4 Route isolation

Team Leaders are detected from the trusted `role` field in the auth store
(profile-resolved from database on login/session restore). The route guard
blocks core UI rendering and redirects to `/team/dashboard`.

---

## 6. PREVIOUS CLAIMS INDEPENDENTLY VERIFIED

| Claim | Verified | Notes |
|-------|----------|-------|
| `festival_teams` maps organisations to festivals | YES | Correct FK, unique constraint |
| `team_leader_assignments` references `festival_team_id` | YES | Correct FK, no direct org binding |
| Portal disabled by default | YES | `is_enabled boolean NOT NULL DEFAULT false` |
| Secure RPCs accept no client tenant/team IDs | YES | All 6 RPCs have zero parameters |
| Route isolation blocks core routes for Team Leaders | YES | `mustBlockCoreRoute` blanks Slot |
| Service wrapper uses only approved RPCs | YES | 6 RPCs, no direct table queries |
| SECURITY DEFINER functions have fixed search_path | YES | All use `pg_catalog, public, pg_temp` |
| Internal helpers revoked from PUBLIC/anon/authenticated | YES | Trigger + helper functions revoked |
| RESTRICTIVE deny policies on core tables | YES | 16 tables covered in loop |
| Migration is single-transaction | YES | One BEGIN, one COMMIT |
| No production data changed | YES | No applied migration |
| No deployment occurred | YES | Verified |

---

## 7. SECURITY PASS/FAIL MATRIX

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | Festival-scoped organisation mapping | **PASS** | FK + trigger + unique constraint |
| 2 | Assignment references festival_team_id | **PASS** | FK to festival_teams, not organisations |
| 3 | Parent tenant chain validation | **PASS** | Trigger validates festival.tenant_id = parent_tenant_id |
| 4 | Active festival validation | **PASS** | `f.is_active` checked in context RPC |
| 5 | Organisation/team validation | **PASS** | Recursive org tree check in trigger |
| 6 | Client identifier distrust | **PASS** | Zero-parameter RPCs, no client IDs used |
| 7 | SECURITY DEFINER search_path safety | **PASS** | `pg_catalog, public, pg_temp` on all new functions |
| 8 | Schema qualification | **PASS** | All table refs are `public.` qualified |
| 9 | Function execute privilege safety | **PASS** | Trigger/helper revokes OK; external RPCs granted to authenticated only |
| 10 | Active assignment enforcement | **PASS** | Context checks `status='active' AND revoked_at IS NULL AND valid_from <= now() AND (valid_until IS NULL OR valid_until > now())` |
| 11 | Revocation enforcement | **PASS** | Trigger auto-sets `revoked_at`; context filters it |
| 12 | Expiry enforcement | **PASS** | `valid_until` checked in context |
| 13 | Portal disabled enforcement | **PASS** | `COALESCE(s.is_enabled, false)` in context |
| 14 | Portal open/close enforcement | **PASS** | `opens_at` and `closes_at` checked in context |
| 15 | Participant team isolation | **PASS** | Scoped by festival_id + organisation_id from context |
| 16 | Schedule team isolation | **PASS** | Scoped by festival_id from context + organisation_id on registrations |
| 17 | Check-in read-only enforcement | **PASS** | Read-only attendance counts; no write actions exposed |
| 18 | Published-results-only enforcement | **FAIL** | Only `published IS TRUE` gate; missing `result_status` and `public_visible` checks |
| 19 | Raw judge data exclusion | **PASS** | No raw marks, scores, or judge comments returned |
| 20 | All-rank support | **PASS** | No rank limit in SQL; all published ranks returned |
| 21 | Standings isolation | **PASS** | Scoped by festival_teams + context; uses official point_table |
| 22 | Announcement audience isolation | **PASS** | `target_role IN ('all','team_leader','participant')` + tenant + festival scope |
| 23 | Core-table write denial | **PASS** | RESTRICTIVE deny on 16 tables; no write RPCs exposed |
| 24 | Cross-team denial | **PASS** | Context chain enforces single organisation |
| 25 | Cross-tenant denial | **PASS** | Context chain enforces single parent_tenant |
| 26 | Admin/Super/Judge regression safety | **FAIL** | RLS enabled on 6 tables without permissive policies breaks existing queries |
| 27 | Public Schedule/Public Results regression safety | **PARTIAL** | Public RPCs use SECURITY DEFINER (bypass RLS); but `usePublicSchedule` hook direct query to schedules will break |
| 28 | Core route isolation | **PASS** | `mustBlockCoreRoute` blanks Slot; redirect fires on mount |
| 29 | Protected-query-before-redirect prevention | **PASS** | Slot returns null during redirect; no core queries start |
| 30 | Typed service secure-RPC-only usage | **PASS** | 6 RPCs, zero parameters, correct type defs |
| 31 | Migration transaction safety | **PASS** | Single BEGIN/COMMIT |
| 32 | Migration idempotency/forward-only safety | **PARTIAL** | `CREATE OR REPLACE` functions are idempotent; but `CREATE POLICY` is not idempotent (will fail on re-run) |
| 33 | Disposable/local test readiness | **FAIL** | Critical regression blocks meaningful runtime testing |

---

## 8. FESTIVAL TEAMS REVIEW

**File:** `118_team_leader_security_foundation.sql:31-41`

- References `public.organisations(id)` — correct
- References `public.tenants(id)` via `parent_tenant_id` — correct
- References `public.festival_calendar(id)` via `festival_id` — correct
- `UNIQUE (festival_id, organisation_id)` prevents duplicate mappings — correct
- `is_active` defaults to `true` — safe
- Trigger `validate_festival_team_mapping` validates:
  - Festival's `tenant_id` matches `parent_tenant_id` — correct
  - Organisation belongs to the parent tenant hierarchy (recursive tree walk) — correct
  - Organisation is not archived (`archived_at IS NULL`) — correct
- Index on `(parent_tenant_id, festival_id) WHERE is_active` — appropriate

**Verdict:** PASS

---

## 9. TEAM LEADER ASSIGNMENTS REVIEW

**File:** `118_team_leader_security_foundation.sql:47-73`

- References `festival_team_id` — correct, does not bind directly to organisations
- `user_id` references `auth.users(id)` — correct
- Status CHECK: `active`, `disabled`, `revoked` — appropriate
- `valid_from` / `valid_until` window with constraint `valid_until > valid_from` — correct
- `revoked_at` auto-set by trigger — correct
- Trigger `validate_team_leader_assignment` validates:
  - User has `team_leader` role — correct
  - Festival team is active — correct
  - One active assignment per festival per user — correct
  - Auto-sets `revoked_at` on revocation — correct

**Unique indexes:**

| Index | Enforces |
|-------|----------|
| `team_leader_one_active_per_team_idx` | One active TL per team (partial: `status='active' AND revoked_at IS NULL`) |
| `team_leader_one_active_assignment_per_festival_idx` | One active assignment per user per team (partial: same) |

**Assignment cardinality:** The trigger enforces one active assignment per
festival per user (lines 179-193), which is stricter than the unique indexes
alone. This is correct.

**Multiple active TLs per team:** The `team_leader_one_active_per_team_idx`
prevents this. Enforced at database level.

**Verdict:** PASS

---

## 10. PORTAL SETTINGS REVIEW

**File:** `118_team_leader_security_foundation.sql:75-94`

- `is_enabled boolean NOT NULL DEFAULT false` — portal disabled by default
- `opens_at` / `closes_at` with constraint `closes_at > opens_at` when both set
- `UNIQUE (parent_tenant_id, festival_id)` — one settings record per tenant+festival
- `configuration jsonb` with type check — safe
- Context RPC checks: `COALESCE(s.is_enabled, false)`, `opens_at <= now()`, `closes_at > now()`
- Null `opens_at` = always open from start; Null `closes_at` = never closes — correct edge case handling

**Edge cases verified:**
- No settings row → `COALESCE(s.is_enabled, false)` = false → denied ✓
- Portal disabled → `is_enabled = false` → denied ✓
- Before opening → `opens_at > now()` → denied ✓
- After closing → `closes_at <= now()` → denied ✓
- Opening after closing → `closes_at > opens_at` constraint prevents this ✓
- `opens_at = now()` → `opens_at <= now()` = true → allowed ✓
- `closes_at = now()` → `closes_at > now()` = false → denied ✓ (exclusive boundary)

**Timezone handling:** Uses `timestamptz` columns and `now()` function.
Both are UTC internally — consistent timezone handling.

**Verdict:** PASS

---

## 11. SECURITY DEFINER FUNCTION INVENTORY

| # | Function | Purpose | Caller Role | Execute Grant | Internal | Review |
|---|----------|---------|-------------|---------------|----------|--------|
| 1 | `validate_festival_team_mapping()` | Trigger: validate org belongs to tenant | trigger | revoked from PUBLIC/anon/auth | YES | PASS |
| 2 | `validate_team_leader_assignment()` | Trigger: validate assignment rules | trigger | revoked from PUBLIC/anon/auth | YES | PASS |
| 3 | `is_team_leader()` | Check if auth.uid() has team_leader role | policy | revoked from PUBLIC/anon/auth | YES | PASS |
| 4 | `get_team_leader_context()` | Resolve authorised context from auth.uid() | RPC | authenticated | NO | PASS |
| 5 | `get_team_leader_participants()` | Read own-team participants | RPC | authenticated | NO | PASS |
| 6 | `get_team_leader_schedule()` | Read own-team schedule | RPC | authenticated | NO | PASS |
| 7 | `get_team_leader_published_results()` | Read published results for own team | RPC | authenticated | NO | FAIL** |
| 8 | `get_team_leader_standings()` | Read team standings | RPC | authenticated | NO | PASS |
| 9 | `get_team_leader_announcements()` | Read team-scoped announcements | RPC | authenticated | NO | PASS |

**`is_team_leader()` usage in RESTRICTIVE policies:** The function is revoked
from all roles but used in RESTRICTIVE policies on tables it doesn't own.
RESTRICTIVE policies execute under the table owner's privileges, so the
revocation doesn't block policy evaluation. The function uses `auth.uid()`
which is session-aware. This is correct behavior.

** See Section 16 for publication gate deficiency.

---

## 12. FUNCTION GRANTS AND REVOKES

### Revokes (lines 476-484)

All 9 functions are revoked from `PUBLIC`, `anon`, and `authenticated` before
selective re-grants. This is correct.

### Grants (lines 486-491)

| Function | Granted To | Correct? |
|----------|-----------|----------|
| `get_team_leader_context()` | authenticated | YES |
| `get_team_leader_participants()` | authenticated | YES |
| `get_team_leader_schedule()` | authenticated | YES |
| `get_team_leader_published_results()` | authenticated | YES |
| `get_team_leader_standings()` | authenticated | YES |
| `get_team_leader_announcements()` | authenticated | YES |

**Internal functions not re-granted:**
- `validate_festival_team_mapping()` — trigger-only, correct
- `validate_team_leader_assignment()` — trigger-only, correct
- `is_team_leader()` — policy-only, correct

**Verdict:** PASS

---

## 13. AUTHORISED CONTEXT RESOLUTION

**File:** `118_team_leader_security_foundation.sql:222-255`

The `get_team_leader_context()` function resolves:

```
auth.uid()
  → team_leader_assignments WHERE user_id = auth.uid()
    → status = 'active'
    → revoked_at IS NULL
    → valid_from <= now()
    → (valid_until IS NULL OR valid_until > now())
  → festival_teams WHERE id = assignment.festival_team_id
    → is_active = true
  → festival_calendar WHERE id = festival_team.festival_id
    → is_active = true
  → team_portal_settings
    → is_enabled = true
    → (opens_at IS NULL OR opens_at <= now())
    → (closes_at IS NULL OR closes_at > now())
  → profiles WHERE id = auth.uid()
    → role = 'team_leader'
```

**All six RPCs call `get_team_leader_context()` and use its returned IDs
(festival_id, organisation_id, parent_tenant_id) as the sole filter.**

No RPC accepts parameters from the caller. No RPC trusts client-supplied
tenant, festival, team, or organisation identifiers.

**If context returns zero rows** (no valid assignment, portal disabled, etc.),
all RPCs return empty results — fail-closed.

**`LIMIT 1` behavior:** If a user has multiple valid assignments (e.g., due
to data migration), only the most recent is used (`ORDER BY a.assigned_at DESC`).
The trigger and unique indexes should prevent this in practice. Acceptable.

**Verdict:** PASS

---

## 14. PARTICIPANT RPC REVIEW

**File:** `118_team_leader_security_foundation.sql:257-278`

```sql
SELECT p.id, p.name, p.gender, p.category_code, p.chest_number,
       p.status, p.festival_id, p.organisation_id
FROM public.participants p
JOIN public.get_team_leader_context() c
  ON c.festival_id = p.festival_id AND c.organisation_id = p.organisation_id;
```

**Isolation:** Participants scoped by `festival_id` AND `organisation_id` from
authorised context. Cannot access other teams' participants.

**Data minimisation:** Returns only: id, name, gender, category_code,
chest_number, status, festival_id, organisation_id. Does not return:
phone, photo_url, unique_code, registered_by, or any other sensitive fields.

**Verdict:** PASS

---

## 15. SCHEDULE RPC REVIEW

**File:** `118_team_leader_security_foundation.sql:280-320`

**Isolation:**
- Schedule scoped by `festival_id` from context
- Registrations joined with `organisation_id` from context
- Only own-team registrations are counted

**Data returned:**
- Schedule details (item code/name, venue, times, status)
- Participant count for own team's registrations
- Checked-in count for own team

**Read-only:** No check-in management fields. No write actions exposed.
Attendance is aggregated as counts, not individual records.

**Check-in data source:** The RPC counts checked-in participants using the
`attendance` table (`a.status IN ('present', 'checked_in')`). The existing
admin check-in system uses `registrations.is_verified`. If the `attendance`
table is not populated by the application, `checked_in_count` will always
be 0. This is a data accuracy concern (not security).

**`registrations.tenant_id` not filtered:** The schedule RPC joins registrations
on `festival_id`, `item_id`, and `organisation_id` but not `tenant_id`.
Since `festival_id` is a UUID PK that belongs to exactly one tenant, and
`organisation_id` is also a UUID PK, the implicit scoping is correct.
Adding `tenant_id` as defense-in-depth is recommended but not required.

**Verdict:** PARTIAL — functional concern (check-in data source mismatch),
not security. Schedule data isolation is correct.

---

## 16. PUBLISHED RESULTS RPC REVIEW

**File:** `118_team_leader_security_foundation.sql:322-349`

```sql
WHERE res.published IS TRUE
  AND r.organisation_id = c.organisation_id
```

**Publication gate:** Only checks `published IS TRUE`. Does NOT check:
- `result_status = 'published'` (allows `hidden`, `archived` results through)
- `public_visible IS TRUE` (allows non-public-visible results through)

**Existing triple-gate pattern** (confirmed in migrations 034, 046, 053, 065):
```sql
AND res.published IS TRUE
AND COALESCE(res.result_status, 'published') = 'published'
AND COALESCE(res.public_visible, false) IS TRUE
```

**`result_status` column:** Added in migration 034 with values:
`draft`, `ready`, `published`, `hidden`, `archived`.
Default: `'published'`. Existing rows backfilled.

**`public_visible` column:** Added in migration 046. Boolean, default `false`.

**Risk:** A result with `published = true` AND `result_status = 'hidden'`
would be shown to Team Leaders. This is an information disclosure — Team
Leaders could see results that admins have intentionally hidden.

**Data minimisation:** No raw marks, score breakdown, judge comments, or
internal result-management fields returned. Only published rank, grade,
points, and participant name.

**Rank handling:** No rank limit in SQL. All published ranks (1, 2, 3, 4+)
are returned. Grade-only results (null rank) are included. Correct.

**Verdict:** FAIL — publication gate is weaker than the existing standard.

---

## 17. STANDINGS RPC REVIEW

**File:** `118_team_leader_security_foundation.sql:351-381`

**Isolation:** Uses `festival_teams` + context to scope to same festival.
All mapped festival teams are included.

**Data source:** Uses `point_table` (official team points). No raw judge
marks exposed. `point_table.org_id` has no FK constraint (pre-existing
schema issue) but the join logic is safe.

**Own team identification:** `(t.organisation_id = ctx.organisation_id)` —
derived from server-side context, not client input. Correct.

**Ranking:** `DENSE_RANK() OVER (ORDER BY total_points DESC)` —
deterministic and consistent.

**Inactive teams:** Only `ft.is_active` teams are included in the standings.
Correct.

**Verdict:** PASS

---

## 18. ANNOUNCEMENTS RPC REVIEW

**File:** `118_team_leader_security_foundation.sql:383-402`

**Isolation:** Scoped by `festival_id` AND `tenant_id` from context.

**Audience filter:** `target_role IN ('all', 'team_leader', 'participant')`

- General announcements (`all`) → visible ✓
- Team Leader-specific (`team_leader`) → visible ✓
- Participant announcements → visible (reasonable for team context) ✓
- Admin-only → excluded ✓
- Judge-only → excluded ✓

**Null target_role handling:** `NULL IN ('all', 'team_leader', 'participant')`
evaluates to NULL (not TRUE). Null-target announcements are excluded. Safe.

**No team-specific targeting:** The announcements table has no `team_id` or
`organisation_id` column (only `target_role`). Team-specific announcements
would require a schema change.

**Verdict:** PASS

---

## 19. RLS AND DIRECT TABLE ACCESS REVIEW

### 19.1 New tables (festival_teams, team_leader_assignments, team_portal_settings)

RLS enabled with appropriate permissive policies:
- Admin manage (is_superadmin OR tenant match)
- Team Leader read (assignment-based)

**Verdict:** PASS

### 19.2 Core table RESTRICTIVE deny loop (lines 457-474)

Creates `deny_team_leader_direct_{table}` RESTRICTIVE policies on 16 tables.

**Tables WITH pre-existing permissive policies (safe):**
- profiles, tenants, organisations, festival_calendar, participants,
  registrations, items, categories, results, mark_entries

**Tables WITHOUT pre-existing permissive policies (CRITICAL REGRESSION):**
- schedules, venues, group_members, attendance, point_table, announcements

**PostgreSQL behavior:** When only RESTRICTIVE policies exist (no PERMISSIVE),
all access is denied. Enabling RLS on these 6 tables with only a RESTRICTIVE
deny policy blocks ALL authenticated users from direct queries.

**Impact:**
- `schedules`: 22+ direct query sites in admin/stage/public components will break
  (e.g., `SupabaseDatabaseProvider.ts` lines 384, 558, 594, 603, 613, 626, 651,
  921, 1121; `useSchedule.ts` line 81; `leaderboard.tsx` line 422)
- `venues`: 6+ direct query sites in admin components (e.g.,
  `SupabaseDatabaseProvider.ts` lines 522, 531, 540, 550)
- `group_members`: No direct client queries found (accessed via SECURITY DEFINER)
- `attendance`: No direct client queries found (accessed via SECURITY DEFINER)
- `point_table`: No direct client queries found (accessed via SECURITY DEFINER)
- `announcements`: No direct client queries found (accessed via RPC)

**Verdict:** FAIL — CRITICAL REGRESSION on schedules and venues

---

## 20. CROSS-TEAM LEAKAGE REVIEW

- Team Leader A's context resolves to Organisation A only
- All RPCs join on `organisation_id = c.organisation_id`
- Cannot pass alternative organisation_id (zero-parameter RPCs)
- `LIMIT 1` on context with deterministic ordering (`assigned_at DESC`)
- Unique index prevents multiple active assignments per team
- Trigger prevents multiple active assignments per festival

**Verdict:** PASS — no cross-team leakage path identified.

---

## 21. CROSS-TENANT LEAKAGE REVIEW

- Context chain includes `parent_tenant_id` validation
- Festival mapping trigger validates `festival.tenant_id = parent_tenant_id`
- Organisation validated to belong to parent tenant hierarchy
- Portal settings scoped by `(parent_tenant_id, festival_id)`
- All RPCs scope by festival_id from context (which is tenant-bound)

**Verdict:** PASS — no cross-tenant leakage path identified.

---

## 22. ROUTE ISOLATION REVIEW

**File:** `src/core/hooks/useProtectedRoute.ts`

**Changes:**
- Added `inTeamGroup`, `isTeamLeader`, `mustBlockCoreRoute` variables (lines 9-11)
- Team Leader redirect fires BEFORE any other route logic (lines 25-28)
- `mustBlockCoreRoute` returns `true` to blank the Slot (line 88)
- Root layout uses `mustBlockCoreRoute` to prevent core rendering (line 26)

**Behavior:**
1. Team Leader on any non-`/team/*` route → immediate redirect to `/team/dashboard`
2. `mustBlockCoreRoute` = true while `initialized && user && isTeamLeader && !inTeamGroup`
3. Root layout returns `null` for `<Slot />` when `blockProtectedCoreRoute` is true
4. No core components render, no core queries start

**Browser Back:** Expo Router's `router.replace()` replaces history entry.
Browser Back cannot return to a core route after redirect. ✓

**Role from trusted source:** Role comes from `authStore.user.role`, populated
from `authService.getCurrentSession()` which queries the `profiles` table.
Not from route params or localStorage. ✓

**Logout:** `authStore.logout()` clears user, role, tenant_id, is_superadmin.
Team Leader context is cleared. ✓

**Verdict:** PASS

---

## 23. TYPED SERVICE WRAPPER REVIEW

**File:** `src/services/teamLeaderPortalService.ts`

- 6 methods, each calling exactly one RPC with zero parameters
- No fallback queries to direct tables
- No client-supplied IDs used as authority
- Type definitions match SQL return contracts
- Error handling throws raw Supabase error (acceptable for foundation)
- No pagination/search/filter parameters (all returned unbounded)

**Verdict:** PASS

---

## 24. REGRESSION RISK REVIEW

### 24.1 Critical regression: RLS on previously unprotected tables

Migration 118 enables RLS on 6 tables that previously had no RLS:

| Table | Direct queries exist? | Impact |
|-------|----------------------|--------|
| `schedules` | YES (22+ sites) | **CRITICAL** — admin schedule management, public schedule, stage management break |
| `venues` | YES (6+ sites) | **HIGH** — venue lookups in admin components break |
| `group_members` | NO (0 client sites) | LOW |
| `attendance` | NO (0 client sites) | LOW |
| `point_table` | NO (0 client sites) | LOW |
| `announcements` | NO (0 client sites) | LOW |

### 24.2 Role CHECK constraint change

The profiles role CHECK constraint is updated to include `team_leader`.
Existing roles (`admin`, `judge`, `volunteer`, `participant`) are preserved.
No regression. ✓

### 24.3 No existing policies modified

Migration 118 does not DROP or REPLACE any existing policies. Only adds new
policies and new tables/functions. ✓

### 24.4 No helper functions modified

`is_superadmin()`, `get_my_tenant_id()`, `get_my_org_id()`, `is_org_visible()`
are not modified. ✓

### 24.5 Public results/schedule

Public RPCs (`get_public_leaderboard`, `get_public_published_results`) use
SECURITY DEFINER and bypass RLS. No regression for public RPCs. However,
`usePublicSchedule` hook (line 81) uses a direct `.from('schedules')` query
that will break after RLS is enabled on schedules.

---

## 25. CRITICAL FINDINGS

### C1: RLS Regression on 6 Tables

**File:** `118_team_leader_security_foundation.sql:457-474`

**Risk:** Migration enables RLS on `schedules`, `venues`, `group_members`,
`attendance`, `point_table`, and `announcements` with ONLY RESTRICTIVE
policies (no PERMISSIVE). PostgreSQL denies all access when no permissive
policy exists.

**Exploit/failure scenario:**
- Admin opens schedule management page → direct `.from('schedules')` query
  returns empty array → page shows no schedules
- Admin opens venue management → venue lookups fail
- Public leaderboard page → `usePublicSchedule` query returns empty → broken display
- Stage management check-in → schedule data inaccessible

**Required correction:** Add permissive policies for `authenticated` on these
6 tables, or remove these tables from the deny loop (since Team Leaders access
them only through SECURITY DEFINER RPCs which bypass RLS anyway).

**Severity:** CRITICAL

### C2: Published Results Weaker Publication Gate

**File:** `118_team_leader_security_foundation.sql:346-347`

**Risk:** The `get_team_leader_published_results()` RPC only checks
`published IS TRUE`. The existing standard (migration 046) uses a triple gate:
`published IS TRUE AND result_status = 'published' AND public_visible IS TRUE`.

Results with `published = true` but `result_status = 'hidden'` or
`public_visible = false` will be exposed to Team Leaders.

**Exploit/failure scenario:**
- Admin hides a result (sets `result_status = 'hidden'`, keeps `published = true`)
- Team Leader still sees the hidden result through the RPC
- Information disclosure of intentionally hidden results

**Required correction:** Align the publication gate with the existing standard:

```sql
WHERE res.published IS TRUE
  AND COALESCE(res.result_status, 'draft') = 'published'
  AND COALESCE(res.public_visible, false) IS TRUE
  AND r.organisation_id = c.organisation_id
```

**Severity:** CRITICAL

---

## 26. HIGH FINDINGS

### H1: Schedule Check-in Count Data Source Mismatch

**File:** `118_team_leader_security_foundation.sql:303-304`

**Risk:** The schedule RPC counts checked-in participants using the
`attendance` table (`a.status IN ('present', 'checked_in')`). The existing
admin check-in system uses `registrations.is_verified`. If the `attendance`
table is not populated by the application, `checked_in_count` will always
be 0.

**Required clarification:** Confirm whether the `attendance` table is
populated alongside `registrations.is_verified`, or align the RPC to use
`registrations.is_verified`.

**Severity:** HIGH (functional, not security)

### H2: `is_superadmin()` Missing search_path

**File:** `supabase/migrations/017_fix_items_upsert.sql:13-15`

**Risk:** Pre-existing issue. `is_superadmin()` lacks `SET search_path`.
Could be exploitable if a same-named function is created in another schema.

**Required correction:** Add `SET search_path = pg_catalog, public, pg_temp`
to `is_superadmin()`.

**Severity:** HIGH (general security hygiene, not specific to team leader portal)

### H3: `festival_teams` and `team_leader_assignments` Not in Deny Loop

**File:** `118_team_leader_security_foundation.sql:461-466`

**Risk:** The deny loop covers 16 core tables but excludes `festival_teams`
and `team_leader_assignments`. The `festival_teams_admin_manage` policy uses
`is_superadmin() OR parent_tenant_id = get_my_tenant_id()`. A Team Leader
within the same tenant could potentially write to `festival_teams` if their
child tenant ID happens to match `parent_tenant_id` (data integrity issue)
or if they also have superadmin status.

**Mitigation:** The trigger `validate_team_leader_assignment` requires the
user to have `team_leader` role. The practical risk is low but the policy
should include a role check.

**Required correction:** Add role check to `festival_teams_admin_manage` or
add RESTRICTIVE deny on `festival_teams` for Team Leaders.

**Severity:** HIGH

---

## 27. MEDIUM FINDINGS

### M1: Announcements Missing 'team_leader' in Schema Comment

**File:** `001_initial_schema.sql:247`

The `target_role` column comment lists `all/admin/judge/participant/volunteer`
but not `team_leader`. Admins must be informed to use
`target_role = 'team_leader'` when creating team-leader-specific announcements.

**Severity:** MEDIUM (operational, not security)

### M2: Unbounded RPC Results

**File:** `118_team_leader_security_foundation.sql` (all 6 RPCs)

All RPCs return unbounded result sets. No LIMIT, no pagination. For large
festivals with many participants, schedules, or results, this could cause
performance issues.

**Severity:** MEDIUM (performance, not security)

### M3: Migration Not Idempotent

**File:** `118_team_leader_security_foundation.sql`

`CREATE POLICY` statements are not idempotent. Re-running the migration will
fail with "policy already exists" errors. The migration should be documented
as forward-only.

**Severity:** MEDIUM (operational)

### M4: `point_table.org_id` Has No FK Constraint

**File:** `001_initial_schema.sql:230`

The `point_table.org_id` is a bare `uuid` with no REFERENCES clause (pre-existing).
The standings RPC joins safely via `ft.organisation_id` which IS FK-constrained.
Orphaned `point_table.org_id` values are harmless in this context.

**Severity:** MEDIUM (pre-existing data integrity issue)

---

## 28. LOW FINDINGS

### L1: Error Messages in Service Wrapper

**File:** `src/services/teamLeaderPortalService.ts:65`

Raw Supabase errors are thrown. Could leak SQL error details in development mode.

**Severity:** LOW

### L2: `items.tsx` Unrelated Worktree Change

**File:** `src/app/(admin)/settings/items.tsx`

Pre-existing unrelated change. Not part of team leader foundation. Preserved.

**Severity:** LOW (not a security concern)

---

## 29. REQUIRED FIXES

### Must fix before runtime test:

1. **C1 — RLS Regression:** Add permissive SELECT policies for `authenticated`
   on `schedules`, `venues`, `group_members` (and optionally `attendance`,
   `point_table`, `announcements`). Alternatively, remove these tables from
   the deny loop if Team Leader blocking through RLS is not needed (since
   SECURITY DEFINER RPCs bypass RLS).

2. **C2 — Publication Gate:** Align `get_team_leader_published_results()` with
   the existing triple-gate pattern: `published IS TRUE AND result_status = 'published' AND public_visible IS TRUE`.

3. **H3 — festival_teams Admin Policy:** Add role check to
   `festival_teams_admin_manage` policy or add RESTRICTIVE deny for Team
   Leaders on `festival_teams`.

### Should fix before production:

4. **H1 — Check-in Data Source:** Clarify and align the attendance data
   source between Team Leader schedule RPC and admin check-in system.

5. **H2 — is_superadmin search_path:** Add `SET search_path = pg_catalog, public, pg_temp` to `is_superadmin()`.

6. **M3 — Migration Idempotency:** Document forward-only nature or add
   idempotency guards.

---

## 30. SECURITY DEFINER EXISTING HELPER REVIEW

The migration 118 calls the following existing helper functions from within
RLS policies:

| Function | search_path | Called From | Risk |
|----------|-------------|-------------|------|
| `is_superadmin()` | NONE | Policy USING clauses | Low — pre-existing, body is simple |
| `get_my_tenant_id()` | `public` | Policy USING clauses | OK |
| `is_team_leader()` | `pg_catalog, public, pg_temp` | RESTRICTIVE policy | OK |
| `get_my_org_id()` | NONE | Not called from migration 118 | N/A |
| `is_org_visible()` | `public` | Not called from migration 118 | N/A |

**`is_superadmin()` search_path concern:** The function body references
`public.profiles` which is unambiguous in the current schema. Risk is low
but should be addressed for defense-in-depth.

---

## 31. RUNTIME RLS TEST PLAN

### Identities

| # | Identity | Setup |
|---|----------|-------|
| 1 | Team Leader A | auth user with `team_leader` role, active assignment to Team A in Festival 1, Tenant 1 |
| 2 | Team Leader B | auth user with `team_leader` role, active assignment to Team B in Festival 1, Tenant 1 |
| 3 | Team Leader (other tenant) | auth user with `team_leader` role, active assignment in Tenant 2 |
| 4 | Revoked Team Leader | auth user with `team_leader` role, assignment with `status='revoked'` |
| 5 | Expired Team Leader | auth user with `team_leader` role, assignment with `valid_until` in past |
| 6 | Future-valid Team Leader | auth user with `team_leader` role, assignment with `valid_from` in future |
| 7 | Disabled Team Leader | auth user with `team_leader` role, assignment with `status='disabled'` |
| 8 | Festival Admin | auth user with `admin` role in Tenant 1 |
| 9 | Super Admin | auth user with `is_superadmin=true` |
| 10 | Judge | auth user with `judge` role in Tenant 1 |
| 11 | Normal authenticated | auth user with `participant` role, no team_leader assignment |
| 12 | Anon/unauthenticated | No auth session |

### Fixture requirements

- 2 parent tenants (T1, T2)
- 2 festivals in T1 (F1-active, F2-inactive), 1 in T2
- 3 teams per active festival (Team A, B, C) mapped to organisations
- Participants in multiple teams, some with null organisation_id
- Group and individual events with registrations
- Check-in records (attendance + registrations.is_verified)
- Published results with ranks 1-5 and one grade-only result
- Hidden result (published=true, result_status='hidden')
- Draft result (published=false, result_status='draft')
- General announcement, team-specific announcement, admin-only announcement
- Portal settings: disabled, enabled+open, enabled+closed, no record

### Required tests

| # | Actor | Action | Expected | Property |
|---|-------|--------|----------|----------|
| 1 | TL-A | `get_team_leader_context()` | Returns Team A context | Context resolution |
| 2 | TL-A | `get_team_leader_participants()` | Returns only Team A participants | Participant isolation |
| 3 | TL-A | `get_team_leader_schedule()` | Returns only Team A registrations in schedule | Schedule isolation |
| 4 | TL-A | `get_team_leader_published_results()` | Returns only Team A published results | Results isolation |
| 5 | TL-A | `get_team_leader_standings()` | Returns all teams, marks own team | Standings isolation |
| 6 | TL-A | `get_team_leader_announcements()` | Returns general + team announcements | Announcement scoping |
| 7 | TL-B | `get_team_leader_participants()` | Returns only Team B participants | Cross-team denial |
| 8 | TL-A | Direct `.from('participants')` | Returns empty (RESTRICTIVE deny) | Core-table write denial |
| 9 | TL-A | Direct `.from('results')` | Returns empty | Core-table write denial |
| 10 | TL-A | Direct `.from('schedules')` | Returns empty | Core-table write denial |
| 11 | TL-other-tenant | `get_team_leader_context()` | Returns empty | Cross-tenant denial |
| 12 | Revoked TL | `get_team_leader_context()` | Returns empty | Revocation enforcement |
| 13 | Expired TL | `get_team_leader_context()` | Returns empty | Expiry enforcement |
| 14 | Future TL | `get_team_leader_context()` | Returns empty | Future-valid denial |
| 15 | Disabled TL | `get_team_leader_context()` | Returns empty | Disabled enforcement |
| 16 | TL-A | Hidden result (`result_status='hidden'`) | NOT returned | Publication gate |
| 17 | TL-A | Draft result (`published=false`) | NOT returned | Publication gate |
| 18 | TL-A | Grade-only published result | Returned with null rank | Grade-only support |
| 19 | TL-A | Rank 4+ published result | Returned | All-rank support |
| 20 | TL-A | Admin-only announcement | NOT returned | Audience isolation |
| 21 | TL-A | Judge-only announcement | NOT returned | Audience isolation |
| 22 | TL-A | Portal disabled | `get_team_leader_context()` returns empty | Portal disabled |
| 23 | TL-A | Portal before opening | `get_team_leader_context()` returns empty | Open/close |
| 24 | TL-A | Portal after closing | `get_team_leader_context()` returns empty | Open/close |
| 25 | TL-A | No settings record | `get_team_leader_context()` returns empty | No-settings |
| 26 | TL-A | Insert participant | Denied | Write denial |
| 27 | TL-A | Update participant | Denied | Write denial |
| 28 | TL-A | Delete participant | Denied | Write denial |
| 29 | TL-A | Update check-in | Denied | Write denial |
| 30 | TL-A | Insert marks | Denied | Write denial |
| 31 | TL-A | Update result | Denied | Write denial |
| 32 | TL-A | Update points | Denied | Write denial |
| 33 | TL-A | Update portal settings | Denied | Write denial |
| 34 | TL-A | Call `validate_festival_team_mapping()` directly | Denied (revoked from authenticated) | Internal helper |
| 35 | anon | `get_team_leader_context()` | Denied (revoked from anon) | Anon denial |
| 36 | normal-auth | `get_team_leader_context()` | Returns empty (no assignment) | No-assignment denial |
| 37 | Admin | Schedule management page | Works (schedules query returns data) | Regression safety |
| 38 | Admin | Check-in page | Works | Regression safety |
| 39 | Judge | Mark entry page | Works | Regression safety |
| 40 | Public | Leaderboard page | Works | Regression safety |
| 41 | TL-A | Navigate to `/admin` | Redirected to `/team/dashboard` | Route isolation |
| 42 | TL-A | Navigate to `/super` | Redirected to `/team/dashboard` | Route isolation |
| 43 | TL-A | Navigate to `/judge` | Redirected to `/team/dashboard` | Route isolation |
| 44 | TL-A | Logout | Context cleared, no cached private data | Cache cleanup |
| 45 | TL-A | Assignment revoked during session | Next protected request returns empty | Live revocation |

---

## 32. DISPOSABLE/LOCAL TEST READINESS

**Is Migration 118 safe to apply to a disposable/local database for runtime RLS testing?**

**NO — changes required first.**

Applying Migration 118 as-is would:
1. Break existing admin schedule management (Critical regression C1)
2. Break existing venue queries (Critical regression C1)
3. Break public schedule views via `usePublicSchedule` hook (Critical regression C1)
4. Allow hidden results to leak to Team Leaders (Critical finding C2)
5. Allow Team Leaders to potentially write to festival_teams (High finding H3)

These issues would produce misleading test results — failures would appear
as migration issues rather than test-specific assertions.

After applying the three required fixes (C1, C2, H3), the migration would be
safe for disposable/local runtime testing.

---

## 33. PRODUCTION LIMITATIONS

This review is explicitly limited to:
- Static code review of the foundation
- No runtime RLS testing performed
- No migration applied
- No production data changed
- No deployment occurred

Production deployment requires:
- All Critical and High findings resolved
- Runtime RLS test plan executed successfully
- Performance testing with production-scale data
- UI/UX verification of all Team Leader portal screens
- Integration testing with existing admin/judge/public flows

---

## 34. FILES CHANGED DURING REVIEW

**None.** This review was conducted in READ-ONLY mode. No implementation
files were modified.

The only file created is this review report:
`TEAM_LEADER_PORTAL_FOUNDATION_INDEPENDENT_REVIEW.md`

---

## 35. CONFIRMATION OF NO MIGRATION/DEPLOYMENT

- Migration 118 NOT applied to any database
- No `supabase db push` or `supabase migration up` executed
- No frontend deployment performed
- No Edge Function deployment performed
- No production data modified
- No Auth users created or modified
- Working tree changes are identical to pre-review state

---

## 36. FINAL DECISION

**CHANGES REQUIRED BEFORE RUNTIME TEST**

Three findings must be resolved:

1. **C1 (CRITICAL):** RLS regression on `schedules`, `venues`, `group_members`
   — add permissive policies or remove from deny loop
2. **C2 (CRITICAL):** Published-results RPC publication gate is weaker than
   existing standard — align with triple-gate pattern
3. **H3 (HIGH):** `festival_teams_admin_manage` policy lacks role check —
   Team Leaders in same tenant could write to festival_teams

After these fixes, the migration is approved for disposable/local runtime
RLS testing. Production approval is not part of this review.
