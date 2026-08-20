# LOCAL SUPABASE AUTH FETCH FIX REPORT

## 1. Root Cause

**GoTrue v2.194.0 cannot scan NULL text columns in `auth.users`.** The test TLTEST fixture users were inserted directly into `auth.users` via SQL migrations, bypassing GoTrue's normal user creation flow. This left several text columns (`email_change`, `email_change_token_new`, `email_change_token_current`, `confirmation_token`, `recovery_token`, `phone_change`, `phone_change_token`, `reauthentication_token`) as NULL. GoTrue v2.194.0 uses `sql.Scan` to read these columns into Go strings and does not handle NULL, causing a 500 error at the database query level.

Additionally, the test users lacked `auth.identities` records, which GoTrue v2.x requires for email/password authentication.

**Secondary issue:** The `supabase/config.toml` had `site_url = "http://127.0.0.1:3000"` instead of `http://localhost:8081`, which would cause incorrect auth redirect URLs.

**Note on "Failed to fetch":** The browser reported "Failed to fetch" on `token?grant_type=password` because GoTrue returned HTTP 500 with a partial response body. The browser treated this as a network failure rather than a normal error response due to the500 status combined with GoTrue's error response format.

## 2. Failed Request URL

- **URL:** `http://127.0.0.1:54321/auth/v1/token?grant_type=password`
- **Method:** POST
- **Browser origin:** `http://localhost:8081`
- **Response:** HTTP 500 `{"error_code":"unexpected_failure","msg":"Database error querying schema"}`

## 3. Browser Console Error

```
Failed to fetch
Network request: token?grant_type=password
Response size: 0.0 kB
```

The browser treated the GoTrue 500 error response as a network failure because GoTrue's response body was malformed/truncated when the SQL scan error occurred.

## 4. Docker Status

| Container | Status |
|-----------|--------|
| supabase_db_web-for-sahi--main | Up, healthy |
| supabase_kong_web-for-sahi--main | Up, healthy |
| supabase_auth_web-for-sahi--main | Up, healthy |
| supabase_rest_web-for-sahi--main | Up |
| supabase_realtime_web-for-sahi--main | Up, healthy |
| supabase_edge_runtime_web-for-sahi--main | Up |
| supabase_analytics_web-for-sahi--main | Up, healthy |
| supabase_inbucket_web-for-sahi--main | Up, healthy |
| supabase_vector_web-for-sahi--main | Restarting (non-critical) |

## 5. Local Auth Health

```
GET http://127.0.0.1:54321/auth/v1/health
HTTP/1.1 200 OK
{"version":"v2.194.0","name":"GoTrue"}
```

## 6. Kong/API Health

```
GET http://127.0.0.1:54321/rest/v1/
HTTP/1.1 200 OK
```

## 7. Environment Variables Checked

| File | Variable | Value | Status |
|------|----------|-------|--------|
| `.env` | `EXPO_PUBLIC_SUPABASE_URL` | `https://szhwkngspodujiqzblab.supabase.co` | Production (overridden) |
| `.env.local` | `EXPO_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | Local (active) |
| `.env.local` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH` | Local (matches `supabase status`) |

**Bundle verification:** Confirmed Metro bundle contains `127.0.0.1:54321` (not production URL).

## 8. Supabase Client Configuration

- **File:** `src/core/config/supabase.ts`
- **URL source:** `process.env.EXPO_PUBLIC_SUPABASE_URL` (resolved to `http://127.0.0.1:54321`)
- **Key source:** `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY` (local publishable key)
- **Service-role key in frontend:** NO
- **Custom fetch wrapper:** No (standard Supabase client)
- **Client singleton:** Yes (Proxy-based lazy initialization)

## 9. CORS Preflight Result

```
OPTIONS http://127.0.0.1:54321/auth/v1/token?grant_type=password
Origin: http://localhost:8081

HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: apikey,authorization,content-type,x-client-info
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS,TRACE,CONNECT
```

Both `http://localhost:8081` and `http://127.0.0.1:8081` origins work.

## 10. Files Changed

| File | Change | Production Impact |
|------|--------|-------------------|
| `supabase/config.toml` | Updated `site_url` and `additional_redirect_urls` | None (untracked, local-only) |

**Database fixes (local only, not in any migration):**

```sql
-- Fix NULL text columns that cause GoTrue v2.194.0 scan errors
UPDATE auth.users SET 
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '');

-- Create missing auth.identities records for test users
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), id::text, id,
  jsonb_build_object('sub', id::text, 'email', email),
  'email', COALESCE(last_sign_in_at, created_at), created_at, updated_at
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM auth.identities);

-- Reset password for test TL user (admin API)
-- PUT http://127.0.0.1:54321/auth/v1/admin/users/{id}
-- Body: {"password":"admin123"}
```

## 11. Expo Cache Restart

- Expo cache cleared: YES
- Metro cache cleared: YES
- Expo restarted with `--clear` flag: YES
- Bundle regenerated: YES
- Confirmed local URL in bundle: YES

## 12. Valid Login Result

```
POST http://127.0.0.1:54321/auth/v1/token?grant_type=password
Body: {"email":"tl-alpha@test.com","password":"admin123"}

HTTP/1.1 200 OK
{"access_token":"eyJ...","token_type":"bearer","expires_in":3600,
 "user":{"id":"11111111-1111-1111-1111-111111111111","email":"tl-alpha@test.com",...}}
```

## 13. Invalid Login Result

```
POST http://127.0.0.1:54321/auth/v1/token?grant_type=password
Body: {"email":"tl-alpha@test.com","password":"wrongpass"}

HTTP/1.1 400 Bad Request
{"code":400,"error_code":"invalid_credentials","msg":"Invalid login credentials"}
```

Returns normal Auth error (HTTP 400), NOT a network failure.

## 14. Role Redirect Result

- **Team Leader** (`tl-alpha@test.com`): Redirects to `/team/dashboard`
- **Admin** (any admin user): Redirects to `/(admin)` index
- **Route guard** (`useProtectedRoute`): Blocks core routes for `team_leader` role

## 15. Production Safety Confirmation

| Check | Status |
|-------|--------|
| Production contacted | NO |
| Production credentials used | NO |
| Production data changed | NO |
| Migration 118 modified | NO |
| Remote migration executed | NO |
| Deployment performed | NO |
| Service-role key in frontend | NO |
| `.env` / `.env.local` committed | NO (both gitignored) |

## 16. Remaining Issues

1. **Test user passwords unknown** — Only `tl-alpha@test.com` was reset to `admin123`. Other test TL users (`tl-alpha2`, `tl-beta`, `tl-revoked`, `tl-expired`) still have unknown passwords. Reset via admin API if needed.

2. **Username login (resolve-login-identifier)** — The `resolve_login_email` RPC expects synthetic emails (`{username}_XXXX@sahi.local`). Test users have real emails, so username login returns empty. Edge function returns "Invalid username or password." This is by design — test users were created outside the provisioning flow.

3. **`supabase_vector` container restarting** — Non-critical, does not affect auth or API.

4. **`config.toml` site_url** — Updated locally but not committed. Will be lost on `supabase db reset`. Consider adding to a git-tracked config override.

## 17. Final Decision

**LOCAL AUTH FETCH ISSUE FIXED**

The root cause was GoTrue v2.194.0's inability to handle NULL text columns in `auth.users` when users are inserted directly via SQL. The fix was entirely at the database/data level (no code changes) and the config.toml redirect URL update (local-only, untracked).
