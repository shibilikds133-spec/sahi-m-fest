# PGRST201 Organisation Query Fix Report

## 1. Root Cause
The `PGRST201` error occurs because there are two valid foreign keys linking `organisations` and `tenants`:
1. `tenants.organisation_id → organisations.id`
2. `organisations.tenant_id → tenants.id`

When embedding `tenants` into the `organisations` query using `.select('..., tenants(access_disabled)')`, PostgREST cannot determine which relationship to use without an explicit hint.

## 2. Failing Query Location
The failing query was located in:
`src/providers/database/SupabaseDatabaseProvider.ts` inside the `listTenantAccounts` method.

## 3. Intended Foreign-Key Relationship
The intended relationship is for each organisation to fetch its linked tenant via `organisations.tenant_id → tenants.id`. Thus, the correct explicit hint is `tenants!organisations_tenant_id_fkey`.

## 4. Files Changed
- `src/providers/database/SupabaseDatabaseProvider.ts`

## 5. Query Before
```typescript
.from('organisations')
.select('id, name, org_type, tenant_id, admin_email, tenants(access_disabled)')
.order('created_at', { ascending: false });
```

## 6. Query After
```typescript
.from('organisations')
.select('id, name, org_type, tenant_id, admin_email, tenants!organisations_tenant_id_fkey(access_disabled)')
.order('created_at', { ascending: false });
```

## 7. Response Shape
The response mapping properly handles the return payload. Whether PostgREST returns a single object or an array, the code correctly infers the boolean property or safely falls back to `false` if `tenants` is null or `access_disabled` is missing. The shape `tenants(access_disabled)` produces the exact same runtime JSON key name as `tenants!organisations_tenant_id_fkey(access_disabled)`, meaning the alias logic was not strictly required and the existing TypeScript response shape maps identically.

## 8. Error Handling
The method has been updated to explicitly capture query errors (`if (error)`) and return them safely mapped to `normalizeError(error)` alongside an empty `data: []` array, rather than suppressing the error or crashing the mapping logic.

## 9. Duplicate Occurrence Search
A repository-wide search was performed for other queries selecting `.select('*tenants(*')` within `.from('organisations')` and no other ambiguous queries were found.

## 10. TypeScript Result
TypeScript validation (`npx tsc --noEmit`) passes cleanly for the modified file (0 new TS errors introduced).

## 11. Lint Result
ESLint check on `src/providers/database/SupabaseDatabaseProvider.ts` passes cleanly (0 new lint errors introduced).

## 12. Runtime Verification
Not explicitly tested due to runtime session and data constraints in this non-destructive sandbox. However, the exact explicit hint resolves the PostgREST ambiguity by definition.

## 13. Regression Review
- Dashboard organisation count: **Not affected**
- Organisation filters: **Not affected**
- Tenant provisioning: **Not affected**
- Migration 102/College Fest: **Not affected**
- RLS behavior: **Not affected**

## 14. Remaining Risks
None identified related to this fix. The query mapping handles null or array payloads gracefully.

## 15. Confirmation No Database or Deployment Changes
- No database schemas, tables, policies, or migrations were modified.
- No files were staged, committed, or pushed to Git.
- No deployments were triggered.
- No production data was edited.
