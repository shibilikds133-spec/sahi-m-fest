# MIMO Festival Calendar Creation and Template Propagation Trace

**Reviewer:** MiMo V2.5
**Date:** 2026-08-04
**Scope:** Exact trace of `festival_calendar` row creation, template propagation, and Add Participant rendering
**Commit:** 56404fe (main)
**Mode:** Strict read-only audit

---

## 1. Festival Calendar INSERT Path — Complete Chain

### UI Caller
**File:** `src/app/(admin)/settings/calendar.tsx:61`
```ts
await updateFestival.mutateAsync({
  id: festival?.id,        // undefined on first save, uuid on edit
  ...formData,             // custom_name, start_date, end_date, registration_open, registration_close
  festival_year: festivalYear,
});
```

### Hook
**File:** `src/core/hooks/useFestival.ts:96-105`
```ts
useUpdateFestival = () => {
  return useMutation({
    mutationFn: async (payload: any) => {
      return festivalSettingsService.updateFestival<FestivalCalendarRecord>(tenant_id, payload);
    },
  });
};
```

### Service
**File:** `src/services/festivalSettingsService.ts:35-45`
```ts
async updateFestival<T>(tenantId: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await festivalRepository.upsertFestival<T>({
    ...payload,
    tenant_id: tenantId,
    is_active: true,
  });
  // ...
}
```

### Repository
**File:** `src/lib/repositories/festivalRepository.ts:16-18`
```ts
async upsertFestival<T>(payload: Record<string, unknown>) {
  return databaseProvider.upsertFestival<T>(payload);
}
```

### Provider (actual Supabase call)
**File:** `src/providers/database/SupabaseDatabaseProvider.ts:44-52`
```ts
async upsertFestival<T>(payload: Record<string, unknown>): Promise<QueryResult<T>> {
  const { data, error } = await supabase
    .from('festival_calendar')
    .upsert(payload)
    .select()
    .single();
  return { data: (data as T) ?? null, error: normalizeError(error) };
}
```

### Exact INSERT Payload (new festival, first save)
```
{
  custom_name: string,
  start_date: string,
  end_date: string,
  registration_open: string | undefined,
  registration_close: string | undefined,
  festival_year: number,
  tenant_id: string,       ← added by service
  is_active: true          ← added by service
}
```

**`festival_template` is NOT in the payload.** The field is absent.

---

## 2. Database Layer — Column Default and Trigger

### Column Definition (Migration 102)
**File:** `supabase/migrations/102_college_fest_template.sql:250-251`
```sql
ALTER TABLE public.festival_calendar
  ADD COLUMN IF NOT EXISTS festival_template text NOT NULL DEFAULT 'sahithyolsav';
```

Column default: `'sahithyolsav'`

### BEFORE INSERT Trigger (Migration 102)
**File:** `supabase/migrations/102_college_fest_template.sql:278-309`
```sql
CREATE OR REPLACE FUNCTION public.snapshot_festival_template_from_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_template text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NOT NULL THEN
      SELECT festival_template INTO v_template
      FROM public.tenants
      WHERE id = NEW.tenant_id;

      IF v_template IS NULL THEN
        RAISE EXCEPTION 'Cannot snapshot festival template: owning tenant % not found', NEW.tenant_id;
      END IF;

      NEW.festival_template := v_template;
    ELSE
      NEW.festival_template := 'sahithyolsav';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_festival_template_snapshot
  BEFORE INSERT ON public.festival_calendar
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_festival_template_from_tenant();
```

**Trigger behavior:** On INSERT, reads `tenants.festival_template` for the owning tenant and overwrites `NEW.festival_template`. Client-supplied values are ignored. If `tenant_id` is NULL, defaults to `'sahithyolsav'`.

### BEFORE UPDATE Trigger (Migration 102)
**File:** `supabase/migrations/102_college_fest_template.sql:320-337`
```sql
CREATE OR REPLACE FUNCTION public.reject_festival_template_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.festival_template IS DISTINCT FROM OLD.festival_template THEN
    RAISE EXCEPTION 'festival_calendar.festival_template is immutable; template conversion is not available in the current release';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_festival_template_immutable
  BEFORE UPDATE OF festival_template ON public.festival_calendar
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_festival_template_change();
```

**Trigger behavior:** Prevents any UPDATE from changing `festival_template`. The snapshot is immutable after INSERT.

---

## 3. Migration 102 — 6-Argument Provisioning Function

**File:** `supabase/migrations/102_college_fest_template.sql:356-406`

```sql
CREATE OR REPLACE FUNCTION public.finalise_tenant_provisioning(
  p_org_id uuid,
  p_user_id uuid,
  p_org_name text,
  p_org_type text,
  p_idempotency_key text,
  p_festival_template text
)
-- ...
BEGIN
  IF p_festival_template NOT IN ('sahithyolsav', 'college_fest') THEN
    RAISE EXCEPTION 'Invalid festival_template: %', p_festival_template;
  END IF;

  -- Step 1: Call 5-arg function (creates tenant with DEFAULT 'sahithyolsav')
  v_result := public.finalise_tenant_provisioning(
    p_org_id, p_user_id, p_org_name, p_org_type, p_idempotency_key
  );

  v_tenant_id := (v_result->>'tenant_id')::uuid;

  -- Step 2: Retry guard — reads festival_calendar but does NOT write
  IF v_result->>'message' = 'Already completed' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.festival_calendar WHERE tenant_id = v_tenant_id
    ) INTO v_dependent_exists;
    IF v_dependent_exists THEN
      RAISE EXCEPTION 'Cannot change festival template: festival data already exists for tenant %', v_tenant_id;
    END IF;
  END IF;

  -- Step 3: Update tenant template (AFTER 5-arg call created it with default)
  UPDATE public.tenants
     SET festival_template = p_festival_template
   WHERE id = v_tenant_id;

  RETURN v_result || jsonb_build_object('festival_template', p_festival_template);
END;
```

### What Migration 102 Sets

| Target | Set by Migration 102? | Value |
|--------|----------------------|-------|
| `tenants.festival_template` | **YES** — UPDATE at line 400-402 | `p_festival_template` (e.g., `'college_fest'`) |
| `festival_calendar.festival_template` | **NO** — no INSERT/UPDATE | Relies on trigger at next INSERT |
| `festival_calendar` row | **NO** — 5-arg function does not INSERT into `festival_calendar` | Created later by admin via Settings UI |

### Does Migration 102 Backfill Existing Festivals?

**NO.** Line 247 comment: *"Existing rows (all `sahithyolsav` per section 1d) are untouched"*. The `DEFAULT 'sahithyolsav'` applies retroactively via PostgreSQL column default, but the BEFORE INSERT trigger never fires for pre-existing rows.

---

## 4. College Fest Tenant Lifecycle — Expected vs Actual

### Expected Flow (College Fest tenant)

1. **Provisioning (Edge Function → 6-arg RPC):**
   - 5-arg function creates `tenants` row → `festival_template = 'sahithyolsav'` (column default)
   - 6-arg function UPDATEs `tenants.festival_template = 'college_fest'`
   - **Result:** `tenants.festival_template = 'college_fest'` ✓

2. **Admin creates festival (Settings → Calendar → Save):**
   - `upsertFestival()` → INSERT into `festival_calendar` (no `festival_template` in payload)
   - BEFORE INSERT trigger fires → reads `tenants.festival_template` = `'college_fest'`
   - `NEW.festival_template := 'college_fest'`
   - **Result:** `festival_calendar.festival_template = 'college_fest'` ✓

3. **Add Participant form loads:**
   - `useActiveFestival()` → `select('*')` from `festival_calendar`
   - `activeFestival.festival_template` = `'college_fest'`
   - `isCollegeFest = true`
   - Form renders Sub Junior / Junior / Senior radio buttons ✓

### This Flow Is Correct in Code

The code path is **correct for new festivals created after provisioning completes**. The trigger correctly snapshots the tenant's template.

---

## 5. Failure Modes — Why College Fest May Display Sahithyolsav Fields

### Failure Mode A: Tenant Template Not Set (CRITICAL)

If the 6-arg `finalise_tenant_provisioning` was never called (or failed midway), the tenant's `festival_template` remains `'sahithyolsav'` (column default). When the admin creates the festival, the trigger snapshots `'sahithyolsav'`.

**Verification needed:** Query `tenants.festival_template` for the College Fest tenant.

### Failure Mode B: Festival Created Before Provisioning Completed

If the admin created the festival while the tenant's `festival_template` was still `'sahithyolsav'` (e.g., during a race condition or before the 6-arg function ran), the snapshot captured `'sahithyolsav'`. Later, the 6-arg function updated the tenant to `'college_fest'`, but the festival snapshot is immutable.

**Verification needed:** Check `festival_calendar.created_at` vs the provisioning completion time.

### Failure Mode C: Pre-Existing Festival (Pre-Migration 102)

If the festival was created before Migration 102 was applied, the `festival_template` column did not exist. After Migration 102, the column default `'sahithyolsav'` applies to all existing rows. The trigger never fires for pre-existing rows.

**Verification needed:** Check if the festival was created before Migration 102 was deployed.

### Failure Mode D: Upsert (UPDATE Path) Preserves Wrong Snapshot

If the festival already exists with `festival_template = 'sahithyolsav'`, and the admin edits it via Settings → Calendar, the `upsert()` does an UPDATE (because `id` is in the payload). The BEFORE INSERT trigger does NOT fire on UPDATE. The `reject_festival_template_change` trigger prevents changing the template. So the wrong snapshot persists.

**Verification needed:** Check if the festival row was created before the tenant template was set to `'college_fest'`.

---

## 6. Add Participant — What It Reads

**File:** `src/app/(admin)/participants/add.tsx:70,76`
```ts
const { data: activeFestival, isLoading: isFestivalLoading } = useActiveFestival();
const isCollegeFest = activeFestival?.festival_template === 'college_fest';
```

- Reads: `activeFestival.festival_template` from `festival_calendar` table
- Does NOT read: `tenants.festival_template`
- Does NOT read: any hardcoded fallback
- Does NOT read: any feature flag

The form's College Fest branch (line 469-486) is **correct and complete** — it renders Sub Junior / Junior / Senior radio buttons when `isCollegeFest` is true.

---

## 7. Manual College Fest Category Flow

**YES, it exists.** The form at `add.tsx:241-247`:
```ts
if (isCollegeFest) {
  const selected = collegeCategory;
  if (!selected || !isCollegeFestCategory(selected)) {
    Alert.alert('Validation Error', 'Please select Sub Junior, Junior, or Senior.');
    return;
  }
  category = selected;
}
```

The user manually selects Sub Junior, Junior, or Senior via radio buttons. No auto-detection is used. The `getFestivalCategoryMode()` function in `templatePolicy.ts` returns `'manual'` for College Fest but is **never called anywhere in the codebase** — it's dead code.

---

## 8. Runtime Database Verification

**NOT PERFORMED.** Database access is unavailable in this audit. The following queries would confirm the root cause:

```sql
-- Check tenant template
SELECT id, name, festival_template FROM tenants WHERE id = '<college_fest_tenant_id>';

-- Check festival snapshot
SELECT id, tenant_id, festival_template, is_active, created_at
FROM festival_calendar
WHERE tenant_id = '<college_fest_tenant_id>';
```

---

## 9. Summary

| Question | Answer |
|----------|--------|
| Festival creation UI file | `src/app/(admin)/settings/calendar.tsx` |
| upsertFestival implementation file | `src/providers/database/SupabaseDatabaseProvider.ts:44-52` |
| Festival INSERT payload | `{ custom_name, start_date, end_date, registration_open, registration_close, festival_year, tenant_id, is_active }` |
| `festival_template` explicitly inserted | **NO** |
| Template source | Database trigger reads `tenants.festival_template` at INSERT time |
| Database default | `'sahithyolsav'` |
| Migration 102 sets tenant template | **YES** — 6-arg function UPDATEs `tenants.festival_template` |
| Migration 102 sets festival snapshot | **NO** — relies on trigger at next INSERT |
| Trigger copies tenant template | **YES** — `snapshot_festival_template_from_tenant()` BEFORE INSERT |
| Existing festivals backfilled | **NO** — column default applies, trigger never fires |
| College Fest tenant template value | Unverified (requires DB query) |
| College Fest active festival template value | Unverified (requires DB query) |
| Snapshot mismatch found | **UNVERIFIED** — code path is correct for new festivals; mismatch requires DB confirmation |
| Add Participant reads active festival snapshot | **YES** — `activeFestival?.festival_template` |
| Primary root cause | Most likely: `festival_calendar.festival_template = 'sahithyolsav'` due to one of: (A) tenant template not set by 6-arg provisioning, (B) festival created before tenant template updated, (C) pre-existing festival from before Migration 102 |
| Hardcoded Sahithyolsav fallback found | **NO** — no hardcoded fallback in Add Participant |
| Manual College Fest category flow exists | **YES** — radio buttons for Sub Junior / Junior / Senior |
| Frontend College Fest branch complete | **YES** — `add.tsx:469-486` renders correctly when `isCollegeFest` is true |

---

## 10. Conclusion

The frontend code is **correct and complete**. The College Fest participant form branch exists and renders the right fields. The backend trigger correctly snapshots the tenant's template on INSERT. The 6-arg provisioning function correctly sets the tenant's template.

The most probable root cause is a **data timing issue**: either the tenant's `festival_template` was not set to `'college_fest'` before the festival was created, or the festival pre-dates the template being set. A database query is required to confirm.

**Files requiring no correction:**
- `src/app/(admin)/participants/add.tsx` — College Fest branch is correct
- `src/core/festival/templatePolicy.ts` — constants and helpers are correct
- `supabase/migrations/102_college_fest_template.sql` — triggers and provisioning are correct

**Files potentially requiring correction (if tenant template is wrong):**
- `supabase/functions/provision-admin/index.ts` — verify 6-arg function is called with correct template
- Runtime database data — verify `tenants.festival_template` and `festival_calendar.festival_template` values

---

FESTIVAL CALENDAR CREATION AND TEMPLATE PROPAGATION TRACE COMPLETED — NO CHANGES PERFORMED
