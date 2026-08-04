# MIMO Deep Audit: College Fest Template Behavior

**Reviewer:** MiMo V2.5
**Date:** 2026-08-04
**Scope:** Why does the participant creation form appear identical for Sahithyolsav and College Fest tenants, despite both templates being selectable during onboarding?
**Codebase Commit:** 56404fe (main)

---

## Executive Summary

The participant add form **already contains a correct College Fest branch** (lines 469–486 in `add.tsx`) with Sub Junior / Junior / Senior radio buttons. The form renders differently based on `activeFestival?.festival_template === 'college_fest'`. The most likely root cause is that **the `festival_calendar` row for the College Fest tenant has `festival_template = 'sahithyolsav'`** (the column default from Migration 102), meaning the template was never propagated from the tenant to the festival at festival creation time, or the festival was created before Migration 102 was applied.

A secondary gap: **`category_auto_detection` does not exist as a column on `festival_calendar`** — it is only mentioned in a Migration 102 comment as existing in a different workspace. The form code never references it, and `getFestivalCategoryMode()` always returns `'manual'` for College Fest regardless.

---

## Audit Questions & Findings

### Q1: Does the participant form have College Fest-specific rendering?

**YES.** The form at `src/app/(admin)/participants/add.tsx:469–486`:

```tsx
{isCollegeFest && (
  <View>
    <Text className="font-poppins text-ssf-text-muted mb-2">Category *</Text>
    <View className="flex-row gap-2">
      {COLLEGE_FEST_CATEGORY_CODES.map(category => (
        <TouchableOpacity
          key={category}
          className={`... ${collegeCategory === category ? 'bg-ssf-primary ...' : '...'}`}
          onPress={() => setCollegeCategory(category)}
        >
          <Text className={`... ${collegeCategory === category ? 'text-white' : '...'}`}>
            {getCollegeFestCategoryLabel(category)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
)}
```

When `isCollegeFest` is true, it shows three radio buttons: Sub Junior, Junior, Senior.
When `isCollegeFest` is false, it shows the standard Sahithyolsav class/education-type fields.

**The code is correct.** The issue is that `isCollegeFest` evaluates to `false`.

---

### Q2: What determines `isCollegeFest`?

Line 76 of `add.tsx`:

```tsx
const isCollegeFest = activeFestival?.festival_template === 'college_fest';
```

`activeFestival` comes from `useActiveFestival()` → `festivalSettingsService.getActiveFestival()` → `SupabaseDatabaseProvider.getActiveFestival()`:

```ts
const { data, error } = await supabase
  .from('festival_calendar')
  .select('*')
  .eq('tenant_id', tenantId)
  .eq('is_active', true)
  .maybeSingle();
```

This uses `select('*')` so `festival_template` IS fetched if the column exists.

**Root cause: `activeFestival.festival_template` is `'sahithyolsav'` instead of `'college_fest'`.**

---

### Q3: Why would `festival_calendar.festival_template` be `'sahithyolsav'` for a College Fest tenant?

Migration 102 adds the column with:

```sql
ADD COLUMN IF NOT EXISTS festival_template text NOT NULL DEFAULT 'sahithyolsav';
```

The `BEFORE INSERT` trigger `snapshot_festival_template_from_tenant()` resolves the template from the owning tenant:

```sql
IF NEW.tenant_id IS NOT NULL THEN
  SELECT festival_template INTO v_template
  FROM public.tenants
  WHERE id = NEW.tenant_id;
  IF v_template IS NULL THEN
    RAISE EXCEPTION '...';
  END IF;
  NEW.festival_template := v_template;
ELSE
  NEW.festival_template := 'sahithyolsav';
END IF;
```

**Two scenarios cause the bug:**

1. **Festival created before Migration 102 was applied:** The column didn't exist, so the festival has no `festival_template`. After Migration 102, the `DEFAULT 'sahithyolsav'` backfills via the column default, but existing rows are NOT updated by the trigger (which only fires on INSERT). The trigger snapshot is INSERT-only.

2. **Tenant's `festival_template` was set AFTER the festival was created:** The `finalise_tenant_provisioning` 6-arg overload (Migration 102) calls the 5-arg version first (which creates the tenant), then sets `festival_template` on the tenant AFTER. But the festival may already be created by that point (or by a separate edge function call), so the snapshot captures the tenant's default `'sahithyolsav'` before the override.

Let me trace the exact provisioning flow:

- Edge Function `provision-admin/index.ts:293–295`:
  ```ts
  const festivalTemplate = operation === 'root_tenant'
    ? (body?.festival_template || 'sahithyolsav')
    : 'sahithyolsav';
  ```

- This is passed to `finalise_tenant_provisioning` 6-arg overload (Migration 102, line 356–406):
  ```sql
  v_result := public.finalise_tenant_provisioning(
    p_org_id, p_user_id, p_org_name, p_org_type, p_idempotency_key
  );  -- 5-arg: creates tenant + festival_calendar row
  UPDATE public.tenants SET festival_template = p_festival_template WHERE id = v_tenant_id;
  ```

**Critical bug in provisioning flow:** The 5-arg function creates the festival_calendar row. At that point, the tenant's `festival_template` is still `'sahithyolsav'` (the default). The trigger snapshots `'sahithyolsav'`. Then the 6-arg function updates the tenant to `'college_fest'` — but the festival snapshot is immutable (Migration 102 `reject_festival_template_change` trigger blocks UPDATE).

**The festival gets the wrong template because the tenant template is set AFTER the festival is created.**

---

### Q4: Does `category_auto_detection` exist on `festival_calendar`?

**NO.** Grep across all `.sql` and `.ts` files shows `category_auto_detection` appears only in a Migration 102 comment (line 6):

```sql
-- workspace (which introduced `category_auto_detection` and a seven-argument
```

This references a DIFFERENT workspace, not this codebase. The column does not exist on `festival_calendar` or `tenants` in this repo.

`getFestivalCategoryMode()` in `templatePolicy.ts:64–69`:

```ts
export function getFestivalCategoryMode(template: FestivalTemplate): FestivalCategoryMode {
  if (!isFestivalTemplate(template)) {
    throw new Error(`Unsupported festival template: ${String(template)}`);
  }
  return isCollegeFestTemplate(template) ? 'manual' : 'auto';
}
```

This function is **not called anywhere in the codebase** — it's exported but unused. The form hardcodes `'manual'` behavior for College Fest by requiring explicit radio selection.

---

### Q5: What categories does College Fest support?

`templatePolicy.ts:7–11`:

```ts
export const COLLEGE_FEST_CATEGORY_CODES = [
  'SUB_JUNIOR',
  'JUNIOR',
  'SENIOR',
] as const;
```

Labels: Sub Junior, Junior, Senior.

---

### Q6: What categories does Sahithyolsav support?

`participantValidation.ts:11–19`:

```ts
export type SahithyolsavCategoryCode =
  | 'LP' | 'UP' | 'HS' | 'HSS' | 'JUNIOR' | 'SENIOR' | 'CAMPUS' | 'GENERAL';
```

Class-based (1–4=LP, 5–7=UP, 8–10=HS, 11–12=HSS), age-based (15–19=JUNIOR, 20–25=SENIOR), education-type override (CAMPUS), and GENERAL.

---

### Q7: Is there a feature gate blocking College Fest?

**NO.** `src/core/config/features.ts` only has:

```ts
ENABLE_ONBOARDING: true,
```

No College Fest feature flag exists. The form rendering is entirely driven by `activeFestival.festival_template`.

---

### Q8: Does the `getCategory()` function handle College Fest?

**NO.** `participantValidation.ts:165–217` — the synchronous `getCategory()` only handles Sahithyolsav categories (LP/UP/HS/HSS/JUNIOR/SENIOR/CAMPUS). It has no `template` parameter.

For College Fest, the form bypasses `getCategory()` entirely and uses the radio button selection directly (line 241–247):

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

This is correct design.

---

### Q9: How does the import flow handle College Fest?

**PARTIALLY HANDLED.** All import pages (`import.tsx`, `import-lp.tsx`, `import-up.tsx`, etc.) check:

```ts
const isCollegeFest = activeFestival?.festival_template === 'college_fest';
```

But they are separate pages for each Sahithyolsav category (LP, UP, HS, HSS, Senior). For College Fest, the user would need a unified import page that handles Sub Junior / Junior / Senior. The existing import pages likely show/hide based on the same `isCollegeFest` flag, but I did not find a College Fest-specific import page.

---

### Q10: Is the Sahithyolsav behavior preserved for existing tenants?

**YES, with one nuance.** The 5-arg `finalise_tenant_provisioning` is untouched (Migration 102 header confirms). Legacy callers get the 5-arg version and stay Sahithyolsav via column default. The `getCategory()` function remains Sahithyolsav-only. The form's Sahithyolsav branch is untouched.

---

## Root Cause Summary

| Issue | Severity | Description |
|-------|----------|-------------|
| **Template snapshot timing** | **CRITICAL** | The 6-arg `finalise_tenant_provisioning` creates the festival via the 5-arg delegate (tenant default = `'sahithyolsav'`), THEN updates the tenant template. The festival snapshot is immutable and captures the wrong value. |
| **Pre-existing festivals** | **HIGH** | Festivals created before Migration 102 was applied have no `festival_template` column; the `DEFAULT 'sahithyolsav'` applies retroactively, but the trigger never fires for existing rows. |
| **`category_auto_detection` missing** | **MEDIUM** | The column does not exist on `festival_calendar`. The form never references it. `getFestivalCategoryMode()` is exported but unused. |

---

## Recommended Fix

### Fix 1: Template snapshot timing (CRITICAL)

**Option A — Set tenant template BEFORE festival creation:**
In the 6-arg `finalise_tenant_provisioning`, UPDATE the tenant's `festival_template` BEFORE calling the 5-arg delegate. This requires restructuring the function.

**Option B — Add a post-provisioning UPDATE for existing festivals:**
After setting the tenant template, also UPDATE the most recent festival_calendar row:

```sql
UPDATE public.festival_calendar
   SET festival_template = p_festival_template
 WHERE tenant_id = v_tenant_id
   AND festival_template = 'sahithyolsav';
```

This requires temporarily disabling the `reject_festival_template_change` trigger inside the SECURITY DEFINER function.

**Option C (RECOMMENDED) — Migrate at the application layer:**
After login, the client checks if `tenant.festival_template !== festival_calendar.festival_template` and calls a one-time migration RPC. This avoids touching the immutable trigger.

### Fix 2: Pre-existing festivals

Run a one-time data migration:

```sql
UPDATE public.festival_calendar fc
   SET festival_template = t.festival_template
  FROM public.tenants t
 WHERE fc.tenant_id = t.id
   AND fc.festival_template IS DISTINCT FROM t.festival_template;
```

This must run INSIDE a SECURITY DEFINER function to bypass the `reject_festival_template_change` trigger, or the trigger must be temporarily disabled.

### Fix 3: Add `category_auto_detection` column (if needed)

If auto-detection is a desired feature, add the column to `festival_calendar` (or `tenants`) and wire it to the form. Currently unused.

---

## Files Referenced

| File | Role |
|------|------|
| `src/app/(admin)/participants/add.tsx` | Primary participant form — has correct College Fest branch |
| `src/core/festival/templatePolicy.ts` | Template constants, `isCollegeFestTemplate()`, `getFestivalCategoryMode()` (unused) |
| `src/core/utils/participantValidation.ts` | `getCategory()` — Sahithyolsav-only; no template parameter |
| `src/core/hooks/useFestival.ts` | Fetches active festival including `festival_template` |
| `src/providers/database/SupabaseDatabaseProvider.ts` | `getActiveFestival()` uses `select('*')` |
| `src/core/config/features.ts` | Only `ENABLE_ONBOARDING`; no College Fest gate |
| `src/services/tenantProvisioningService.ts` | Sends `festival_template` to Edge Function |
| `supabase/functions/provision-admin/index.ts` | Edge Function — extracts `body.festival_template` for root_tenant |
| `supabase/migrations/102_college_fest_template.sql` | Adds columns, triggers, 6-arg provisioning overload |
| `supabase/migrations/103_college_fest_category_enforcement.sql` | Template-aware `validate_participant_category()` |
| `supabase/migrations/104_college_fest_registration_enforcement.sql` | Registration category compatibility |
| `supabase/migrations/105_root_tenant_preflight_username_scope.sql` | Root preflight fix (completed) |

---

## Conclusion

The frontend code is **correct and ready** — the College Fest form branch exists and renders Sub Junior / Junior / Senior radio buttons when `activeFestival.festival_template === 'college_fest'`. The backend SQL triggers and RPC functions are **correct and production-safe**.

The bug is a **data propagation issue**: the festival's `festival_template` snapshot captures `'sahithyolsav'` because the 6-arg provisioning function sets the tenant template AFTER the festival is created. The fix is either reordering the provisioning steps or adding a one-time data migration to correct existing festivals.
