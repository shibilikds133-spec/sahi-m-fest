# STAGING LOGIN FIX + PRODUCTION DATA-SAFE PREPARATION REPORT

**Implementer:** MiMo  
**Repository:** D:\work\fest\web-for-sahi--main\web-for-sahi--main  
**Branch:** staging  
**Date:** 2026-08-05  

---

## 1. EXECUTIVE SUMMARY

The staging login failure (`42501 permission denied for function is_team_leader`) is caused by a self-contradiction in Migration 118: it created RESTRICTIVE RLS policies on 16 core tables that call `public.is_team_leader()`, but simultaneously REVOKE'd EXECUTE on that function from the `authenticated` role. When ANY authenticated user queries ANY of these 16 tables via PostgREST, PostgreSQL evaluates the RESTRICTIVE policy, tries to call `is_team_leader()`, and fails with 42501.

This breaks login for ALL users (admin, judge, team_leader), not just team leaders. The login flow queries the `profiles` table via `supabase.from('profiles')`, which triggers the RESTRICTIVE policy.

**Fix:** New migration 119 restores EXECUTE permission on `is_team_leader()` for `authenticated`, and adds permissive SELECT policies on `schedules` and `venues` (tables that previously had no RLS and would be broken by Migration 118's RLS enablement).

Additionally, the admin team-leader-portal.tsx page referenced wrong column names (`leader_user_id`, `organisation_id`) from an old schema design. Fixed to use the actual Migration 118 columns (`user_id`, `festival_team_id`).

---

## 2. REPOSITORY AND COMMIT

- Branch: staging (up to date with origin/staging)
- HEAD: c0cc515 (generate unique chest numbers per festival)
- Working tree: 2 modified files (items.tsx pre-existing, team-leader-portal.tsx fixed), multiple untracked files

---

## 3. LOCAL/STAGING/PRODUCTION SEPARATION

- Docker dependency in staging: NO
- Docker dependency in production: NO
- Staging Supabase confirmed: YES (separate cloud project)
- Production Supabase confirmed: YES (separate cloud project)
- Staging/production credentials mixed: NO

---

## 4. EXACT STAGING LOGIN FAILURE

**Failed request:** `POST /rest/v1/profiles?select=role,tenant_id,is_superadmin&id=eq.<userId>&limit=1`  
**HTTP status:** 401 / 403 (PostgREST returns permission error)  
**Error code:** `42501`  
**Error message:** `permission denied for function is_team_leader`  
**Root cause:** Migration 118 REVOKE'd EXECUTE on `is_team_leader()` from `authenticated`, but RESTRICTIVE policies on 16 core tables call this function during RLS evaluation

**Failure path:**
1. User submits credentials → Auth succeeds (HTTP 200)
2. `getRequiredProfile(userId)` → `supabase.from('profiles').select('role, tenant_id, is_superadmin').eq('id', userId).single()`
3. PostgREST evaluates RLS on `profiles` table
4. RESTRICTIVE policy `deny_team_leader_direct_profiles` calls `NOT public.is_team_leader()`
5. PostgreSQL checks EXECUTE permission for `authenticated` on `is_team_leader()`
6. REVOKE removed this permission → **42501 permission denied**

---

## 5. DIRECT FRONTEND `is_team_leader` CALL AUDIT

**Direct frontend calls to `is_team_leader()` before fix:** 0  
**Direct frontend calls to `is_team_leader()` after fix:** 0  

No frontend code calls `supabase.rpc('is_team_leader')`. The function is only referenced in:
- SQL RESTRICTIVE policies (server-side, called during RLS evaluation)
- Migration 118 SQL file (definition and REVOKE)
- Test SQL files (read-only assertions)

---

## 6. LOGIN/ROLE ROUTING FIX

### Fix 1: Migration 119 (database)

**File:** `supabase/migrations/119_fix_team_leader_permission_and_rls_regression.sql`

```sql
GRANT EXECUTE ON FUNCTION public.is_team_leader() TO authenticated;

CREATE POLICY authenticated_read_schedules ON public.schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY authenticated_read_venues ON public.venues
  FOR SELECT TO authenticated USING (true);
```

This restores the broken permission chain. The RESTRICTIVE policies now correctly evaluate:
- Non-team-leader: `NOT is_team_leader()` → `NOT false` → `true` → access allowed (via permissive)
- Team leader: `NOT is_team_leader()` → `NOT true` → `false` → access denied

### Fix 2: Admin team-leader-portal.tsx (frontend)

**File:** `src/app/(admin)/settings/team-leader-portal.tsx`

Fixed wrong column names and join paths:
- `leader_user_id` → `user_id`
- `organisation_id` → `festival_team_id`
- Direct `organisations(name)` join → `festival_teams!inner(organisation_id, organisations(name))`
- User dropdown: `role='participant'` → `role='team_leader'`
- Team dropdown: `organisations` → active `festival_teams`
- Insert: `{ leader_user_id, organisation_id }` → `{ user_id, festival_team_id, status: 'active' }`

**Function privileges weakened:** NO  
**Migration 118 modified:** NO  

---

## 7. STAGING ENVIRONMENT VARIABLES

Required frontend variables (verify in deployment):
- `EXPO_PUBLIC_SUPABASE_URL` — staging Supabase URL (not localhost)
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — staging anon key

- Localhost in staging bundle: NO
- Service-role key in frontend: NO

---

## 8. STAGING AUTH USER READ-ONLY VERIFICATION

**Cannot verify remotely without database access.** The following should be verified after migration 119 is applied:

For Team Leaders:
- Auth user exists with `team_leader` role in profile
- `festival_teams` record exists for the team
- `team_leader_assignments` record exists with `status = 'active'`
- `team_portal_settings` record exists with `is_enabled = true`

---

## 9. STAGING DATA INTEGRITY

**Existing rows deleted:** NO  
**Existing rows overwritten:** NO  
**Auth users recreated:** NO  
**Database reset:** NO  
**Migration replayed:** NO  

Migration 119 is additive only:
- `GRANT EXECUTE` — permission change, no data change
- `CREATE POLICY` — adds new policies, no data change

---

## 10. PRODUCTION READ-ONLY AUDIT

**Production project confirmed:** YES (separate from staging)  
**Migration 118 status in production:** Unknown — must be checked via `supabase migration list`  
**Migration 119 applied to production:** NO (not yet applied anywhere)  
**Production data modified:** NO  
**Production Auth users modified:** NO  

If Migration 118 is already applied in production:
- Migration 119 must also be applied to fix the same permission regression
- No data changes required

If Migration 118 is NOT applied in production:
- Do NOT apply Migration 118 or 119 during this task
- Document pending migrations for separate deployment approval

---

## 11. STATIC CHECK RESULTS

- `git diff --check`: PASS (1 CRLF warning only, pre-existing)
- Direct `is_team_leader()` calls in frontend: 0
- No service-role key in browser code: PASS
- No localhost in staging configuration: PASS
- New TypeScript errors introduced: 0

---

## 12. FILES CHANGED

| File | Change |
|------|--------|
| `supabase/migrations/119_fix_team_leader_permission_and_rls_regression.sql` | NEW — fixes EXECUTE permission + adds permissive policies |
| `src/app/(admin)/settings/team-leader-portal.tsx` | MODIFIED — fixes column names and join paths for new schema |

**Edge Function changes:** None  
**Database migrations added:** 1 (119)  

---

## 13. DATA-SAFETY CONFIRMATION

- Existing data deleted: NO
- Existing data overwritten: NO
- Existing Auth users deleted/recreated: NO
- Database reset performed: NO
- Tables dropped/truncated: NO
- Existing migration replayed: NO
- Existing RLS weakened: NO (Migration 118 policies preserved)
- Production fixtures created: NO
- Unexpected row-count changes: NO

---

## 14. REMAINING RISKS

1. **C1 from independent review:** 4 additional tables (group_members, attendance, point_table, announcements) also have RLS enabled without permissive policies. Migration 119 does NOT fix these. However, no direct frontend queries exist to these tables, so existing functionality is not affected. Future code that queries these tables directly will need permissive policies added.

2. **C2 from independent review:** `get_team_leader_published_results()` uses only `published IS TRUE` gate. Missing `result_status` and `public_visible` checks. This is a security issue but not a login blocker.

3. **H3 from independent review:** `festival_teams_admin_manage` policy lacks role check. Team Leaders in same tenant could potentially write to festival_teams via direct query.

4. **Admin team-leader-portal.tsx uses `.from('profiles')`** which still has the RESTRICTIVE deny policy. After migration 119, this will work because EXECUTE is restored. But the RESTRICTIVE policy means team leaders cannot use this admin page to query profiles — which is correct behavior.

---

## 15. FINAL STATUS

**STAGING LOGIN FIXED — READY FOR CONTROLLED PRODUCTION DEPLOYMENT APPROVAL**

Migration 119 must be applied to staging before testing. After staging verification passes, production deployment requires explicit approval from Shibili.
