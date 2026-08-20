# Database Verification Script V2 — Change Notes

**Date**: 2026-07-22
**Scope**: Corrections applied to `database_readonly_verification.sql` → `database_readonly_verification_v2.sql`

---

## Changes Summary

### 1. `forcerowsecurity` — Fixed

**V1 (incorrect)**:
```sql
t.forcerowsecurity AS rls_forced
FROM pg_tables t
```

**V2 (correct)**:
```sql
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND c.relkind = 'r'
AND c.relrowsecurity = true
ORDER BY c.relname;
```

**Reason**: `pg_tables` is a convenience view that does NOT expose `forcerowsecurity`. The column exists only in `pg_class.relforcerowsecurity`. The fix joins `pg_class` with `pg_namespace` directly.

---

### 2. `pg_get_function_expr` — Fixed

**V1 (incorrect)**:
```sql
pg_get_function_expr(p.oid) AS function_source
```

**V2 (correct)**:
- For full CREATE definition: `pg_get_functiondef(p.oid)`
- For function body only: `p.prosrc`

**Reason**: PostgreSQL does not provide a function called `pg_get_function_expr`. The correct built-in functions are:
- `pg_get_functiondef(oid)` — returns complete `CREATE FUNCTION` definition
- `pg_get_function_arguments(oid)` — returns argument list
- `pg_get_function_result(oid)` — returns return type
- `p.prosrc` — raw function source from `pg_proc`

The V2 script uses `pg_get_functiondef` for full definitions and `p.prosrc` for body-only inspection.

---

### 3. PostgreSQL `PUBLIC` Role — Fixed

**V1 (incorrect)**:
```sql
JOIN pg_roles r ON r.rolname IN ('anon', 'authenticated', 'public')
```

**V2 (correct)**:
```sql
SELECT
  p.proname AS function_name,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.prokind = 'f'
ORDER BY p.proname;
```

**Reason**: PostgreSQL `PUBLIC` is a pseudo-role, not a normal `pg_roles` row. Joining `pg_roles` on `rolname = 'public'` may produce incorrect results for privilege checks. The V2 script uses `has_function_privilege()` with role name strings, which correctly handles all roles including `PUBLIC`.

---

### 4. Script Robustness — Improved

**V1**: Sections were independent but relied on Supabase SQL Editor continuing after errors.

**V2**: Each section is designed to be independently runnable. The script is divided into clearly labeled sections (A through H) with explicit prerequisites documented.

**Reason**: Supabase SQL Editor behaviour after statement errors is not guaranteed across all versions. Making each section self-contained ensures the script works reliably.

---

### 5. Optional Tables — Guarded

**V1**: Some optional tables were queried directly without existence checks.

**V2**: All optional tables (system_api_keys, file_metadata, notifications, notification_logs, user_notification_tokens, audit_logs, system_events, participant_unit_batches, participant_unit_audit_logs, import_sessions, poster_templates, poster_drafts, poster_versions, generated_posters, generated_assets, export_jobs) are:
- First checked for existence via `pg_tables`
- Then queried only if the existence check passes

**Reason**: If an optional table does not exist, a direct query will error. While Supabase SQL Editor may continue, the error is noisy and confusing. Guarding with existence checks produces cleaner output.

---

### 6. `::regclass` Cast — Fixed

**V1 (fragile)**:
```sql
WHERE conrelid = 'public.profiles'::regclass
```

**V2 (safe)**:
```sql
WHERE conrelid = to_regclass('public.profiles')
```

**Reason**: `::regclass` raises an error if the table does not exist. `to_regclass()` returns NULL instead, making the query safe against missing tables. In this case, `profiles` is guaranteed to exist, but `to_regclass` is the safer idiom.

---

### 7. Read-Only Safety — Verified

The V2 script contains only:
- `SELECT` statements
- `DO $$ ... END $$` blocks with `RAISE NOTICE` (read-only)
- Catalog queries (`pg_tables`, `pg_policies`, `pg_proc`, `pg_class`, `pg_indexes`, `pg_views`, `pg_constraint`, `pg_stat_user_tables`, `information_schema.triggers`)

No write operations are present:
- No `INSERT`, `UPDATE`, `DELETE`, `UPSERT`
- No `ALTER`, `DROP`, `CREATE`, `TRUNCATE`
- No `GRANT`, `REVOKE`
- No application RPC invocations
- No Edge Function invocations

---

### 8. Secret Exposure — Verified

The V2 script does NOT expose:
- API key values (only counts and provider labels)
- Raw judge tokens (only counts and aggregate stats)
- User emails (only counts)
- Participant personal data (only counts and aggregates)
- Signed URLs or access tokens
- Secrets embedded in function definitions (function bodies are shown but contain no secrets in this repository)

---

### 9. Section Restructuring

The V2 script is organized into 8 independent sections:

| Section | Purpose | Dependencies |
|---|---|---|
| A | Universal catalog preflight | None — always works |
| B | Migration history | Requires `supabase_migrations.schema_migrations` |
| C | Table and column inventory | Uses stable catalog views |
| D | RLS policy inventory | Uses `pg_policies` |
| E | Function and grant inventory | Uses `pg_proc`, `pg_roles`, `has_function_privilege` |
| F | Core table ownership checks | Requires core tables to exist |
| G | Optional module checks | Guards each table before querying |
| H | Verification complete | Summary counts |

Each section can be run independently. If one section fails, subsequent sections are unaffected.

---

### 10. PostgreSQL Function Verification

All PostgreSQL functions used in V2 are verified against PostgreSQL 15+ documentation:

| Function | Status | Notes |
|---|---|---|
| `version()` | Valid | Standard PostgreSQL |
| `current_database()` | Valid | Standard PostgreSQL |
| `current_user` | Valid | Standard PostgreSQL |
| `current_setting()` | Valid | Standard PostgreSQL |
| `pg_tables` | Valid | Convenience view (does NOT have `forcerowsecurity`) |
| `pg_class` | Valid | Core catalog (has `relforcerowsecurity`) |
| `pg_policies` | Valid | RLS policy catalog |
| `pg_proc` | Valid | Function catalog |
| `pg_namespace` | Valid | Schema catalog |
| `pg_constraint` | Valid | Constraint catalog |
| `pg_indexes` | Valid | Index catalog |
| `pg_views` | Valid | View catalog |
| `pg_stat_user_tables` | Valid | Table statistics |
| `pg_get_functiondef()` | Valid | Returns CREATE FUNCTION definition |
| `pg_get_function_arguments()` | Valid | Returns argument list |
| `pg_get_function_result()` | Valid | Returns return type |
| `pg_get_constraintdef()` | Valid | Returns constraint definition |
| `has_function_privilege()` | Valid | Checks function privileges |
| `to_regclass()` | Valid | Safe regclass cast (returns NULL if missing) |
| `information_schema.tables` | Valid | Standard information schema |
| `information_schema.triggers` | Valid | Standard information schema |

---

*End of V2 Change Notes*
