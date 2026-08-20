# LOCAL SUPER ADMIN PROVISIONING REPORT

## Local environment confirmed

- Docker containers: all 8 core containers running
- API: http://127.0.0.1:54321 (Kong healthy)
- Database: http://127.0.0.1:54322 (PostgreSQL healthy)
- Expo dev server: http://localhost:8081 (running)

## Exact canonical Super Admin role discovered

The application uses a **boolean flag** `is_superadmin` on the `profiles` table, not a separate role value. The `role` column can be any value (e.g., `admin`, `participant`). The `is_superadmin()` SQL function checks `profiles.is_superadmin` for the current `auth.uid()`.

The route guard in `useProtectedRoute.ts` checks `is_superadmin` from the auth store and redirects superadmins to `/(super)`.

## Auth user created

- ID: `7eafbe37-4c25-4960-a717-5ce2607c3222`
- Email: `superadmin-local@test.com` (local only, not committed)
- Created via Supabase Admin API: `POST /auth/v1/admin/users`
- Password: strong local-only temporary (not logged, not committed)

## Email confirmed

- `email_confirmed_at`: set at creation time via `email_confirm: true`
- Identity record created automatically by GoTrue

## Profile created or repaired

- Table: `public.profiles`
- `id`: matches auth user ID
- `role`: `admin`
- `full_name`: `Local Super Admin`
- `is_superadmin`: `true`
- `tenant_id`: NULL (intentional — superadmins have cross-tenant access)

## Role record created

- The `role` column is set to `admin` (canonical for superadmins)
- The `is_superadmin` boolean flag is the authoritative Super Admin indicator

## Global permissions/memberships created

- `is_superadmin()` function returns `true` for this user
- Cross-tenant access verified via REST API:
  - `profiles`: SELECT across all tenants
  - `tenants`: SELECT across all tenants
  - `organisations`: SELECT, INSERT, DELETE across all tenants
- `get_my_access_status()` RPC returns `superadmin: true`

## Required database grants applied

```sql
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.tenants TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.organisations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.festival_calendar TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_leader() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_access_status() TO authenticated;
```

## Username mapping created

- Not applicable — this account uses email/password login
- The `resolve-login-identifier` edge function uses synthetic emails (`{username}_XXXX@sahi.local`); the super admin uses a real email

## Team Leader assignment created: NO

- Verified: 0 rows in `team_leader_assignments` for this user

## Login HTTP result

- Valid credentials: HTTP 200 with JWT access_token
- Invalid credentials: HTTP 400 `invalid_credentials`

## Super Admin redirect result

- After login, `useProtectedRoute` checks `is_superadmin` flag
- If `is_superadmin === true`, redirects to `/(super)` (Super Admin dashboard)
- Super Admin dashboard loads with "Master Panel" header

## Super Admin route access result

- `/(super)/index` — Super Admin dashboard (stats, modules)
- `/(super)/organisations` — Global organisation hierarchy management
- `/(super)/tenants` — Tenant account management

## Cross-tenant authorised access result

- Can view all profiles across all tenants
- Can view all tenants
- Can view, create, and delete organisations across all tenants
- `get_my_access_status()` confirms `superadmin: true`

## Logout/re-login result

- Logout clears auth state
- Re-login restores session and redirects to `/(super)`

## Files changed

- `supabase/config.toml` — Updated `site_url` and `additional_redirect_urls` (local only, untracked)
- Database grants applied directly (not in any migration)

## Secrets committed: NO

- Password stored only in memory during test, not logged
- Service-role key used only in local curl commands, not in frontend
- `.env` and `.env.local` are gitignored

## Production contacted: NO

## Production user modified: NO

## Migration 118 modified: NO

## Deployment performed: NO

## Service-role key in frontend: NO

## Plaintext password stored: NO

## Credentials committed: NO

## Normal-user-only account created: NO

---

**Final status: LOCAL SUPER ADMIN ACCOUNT READY**
