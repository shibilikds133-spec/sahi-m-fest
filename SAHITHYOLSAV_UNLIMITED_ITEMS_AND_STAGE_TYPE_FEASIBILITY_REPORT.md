# Sahithyolsav: Unlimited Items + Stage/Off-Stage Classification — Feasibility Report

**Date:** 2026-08-09
**Status:** READ-ONLY AUDIT — NO IMPLEMENTATION
**Auditor:** opencode (MIMO v2.5-free)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Change A: Remove 4-Item Registration Limit](#change-a-remove-4-item-registration-limit)
3. [Change B: Add Stage/Off-Stage Item Type](#change-b-add-stageoff-stage-item-type)
4. [Recommendations](#recommendations)

---

## Executive Summary

| Change | Verdict | Risk | Effort |
|--------|---------|------|--------|
| A: Unlimited Items | **SAFE TO IMPLEMENT WITH SMALL TARGETED CHANGES** | Low | ~2-3 hours |
| B: Stage/Off-Stage | **IMPLEMENTATION REQUIRES ADDITIONAL ARCHITECTURAL WORK** | Medium | ~4-6 hours |

---

## Change A: Remove 4-Item Registration Limit

### 1. Current Enforcement Architecture

The 4-item limit is enforced at **3 locations** with **2 different mechanisms**:

#### ACTIVE Enforcement (must modify)

| # | File | Line | Mechanism | Hardcoded? |
|---|------|------|-----------|------------|
| 1 | `src/core/rules/registrationRules.ts` | 13 | `festivalConfig?.max_items_per_participant ?? 4` | **NO** — configurable via `festivalConfig`, default 4 |
| 2 | `src/core/hooks/useBulkImport.ts` | 159-161 | `[row.event1, row.event2, row.event3, row.event4].filter(e => !!e).length > 4` | **YES** — hardcoded to 4 |

#### DEAD CODE (not imported anywhere, safe to update or leave)

| # | File | Line | Mechanism | Hardcoded? |
|---|------|------|-----------|------------|
| 3 | `src/lib/validation/registrationValidator.ts` | 23 | `nonGeneralCount >= 4` | **YES** — hardcoded |
| 4 | `src/core/utils/participantValidation.ts` | 329 | `events.length > 4` | **YES** — hardcoded |

**Critical finding:** `RegistrationValidator` class (file #3) is **never imported** by any other file in the codebase. `validateMaxEvents` function (file #4) is **never called**. Both are dead code.

### 2. `festivalConfig.max_items_per_participant` Analysis

- **Defined in:** `RuleContext.festivalConfig` (type: `any`) — passed from `participantService.registerParticipantForItem()` line 354
- **Used at:** `registrationRules.ts:13` — `const maxLimit = festivalConfig?.max_items_per_participant ?? 4`
- **Null behavior:** If `festivalConfig` is undefined/null, or if `max_items_per_participant` is undefined, defaults to `4`
- **To make unlimited:** Change the logic to treat `null`/`undefined`/`0`/`-1` as "no limit"

**Current behavior with `null`:**
```typescript
const maxLimit = festivalConfig?.max_items_per_participant ?? 4;
// If max_items_per_participant is null → ?? 4 → limit is 4
// If max_items_per_participant is undefined → ?? 4 → limit is 4
```

**Required change for unlimited:**
```typescript
const configured = festivalConfig?.max_items_per_participant;
const maxLimit = configured != null && configured > 0 ? configured : Infinity;
// Now null/undefined/0/-1 all mean "unlimited"
```

### 3. General Category (GN) Exception

**Current behavior (registrationRules.ts:10-11):**
```typescript
if (item.category_codes?.includes('GN')) return null; // bypass limits
```

**Finding:** GN items already bypass the 4-item limit entirely. After removing the cap, GN items remain unaffected. **No change needed for GN exception.**

### 4. Bulk Import Analysis (Critical Discovery)

**The event1-event4 columns in bulk import are a facade.**

| Step | What Happens | Data Used? |
|------|-------------|------------|
| Template download | Generates Excel with Event 1-4 columns | N/A |
| Column mapping | Maps Excel columns to `event1`-`event4` fields | Yes (mapped) |
| Validation | Checks `eventCount > 4` → error | Yes (validated) |
| **Import** | **Only creates participants, NOT registrations** | **DISCARDED** |

**Evidence (useBulkImport.ts:200-228):**
```typescript
validInserts.push({
  tenant_id: tenantId,
  festival_id: festivalId,
  organisation_id: targetOrganisationId,
  name: row.name,
  category_code: row._resolvedCategory,
  phone: row.phone || null,
  dob: ...,
  // NOTE: event1, event2, event3, event4 are NEVER included
});
const data = await participantService.createParticipants(validInserts);
```

**Conclusion:** Bulk import event data is validated then discarded. The 4-item check in bulk import is dead validation — removing it has zero impact on data integrity.

### 5. Registration Flow (Single Path)

All registration goes through **one path**:
```
participantService.registerParticipantForItem()
  → ruleEngine.evaluateRegistration()
    → ItemLimitRule.evaluate()  ← THIS is the only active enforcement
```

**No other flow bypasses this.** Participant create, edit, and bulk import all eventually call this single path for registration.

### 6. Hardcoded Checks to Remove

| Check | File | Action |
|-------|------|--------|
| `festivalConfig?.max_items_per_participant ?? 4` | registrationRules.ts:13 | Modify to support unlimited (null = no limit) |
| `[...].filter(e => !!e).length > 4` | useBulkImport.ts:159-161 | **Remove entirely** — event data is discarded anyway |
| `nonGeneralCount >= 4` | registrationValidator.ts:23 | Dead code — leave as-is or update |
| `events.length > 4` | participantValidation.ts:329 | Dead code — leave as-is or update |

### 7. Eligibility/Duplicate Checks to KEEP

| Rule | File | Purpose |
|------|------|---------|
| CategoryMatchRule | registrationRules.ts:32 | Participant category must match item |
| GroupItemLevelRule | registrationRules.ts:80 | Group items from Division level |
| PlagiarismBanRule | registrationRules.ts:116 | Block plagiarized participants |
| DuplicateRegistrationRule | registrationRules.ts:139 | No duplicate item registration |
| DualTeamRule | registrationRules.ts:190 | No multi-team participation |

**All of these remain valid and must NOT be removed.**

### 8. Change A — Files to Modify

| File | Change | Risk |
|------|--------|------|
| `src/core/rules/registrationRules.ts` | Modify `ItemLimitRule` to support unlimited | Low |
| `src/core/hooks/useBulkImport.ts` | Remove hardcoded 4-item validation | Low (dead validation) |
| `src/lib/validation/registrationValidator.ts` | (Optional) Update dead code for consistency | None |
| `src/core/utils/participantValidation.ts` | (Optional) Update dead code for consistency | None |

### 9. Change A — Database Changes

**None required.** The limit is entirely frontend-enforced.

### 10. Change A — Backward Compatibility

- **Existing registrations:** Unaffected — they already exist with ≤4 items
- **Festival config:** Existing `max_items_per_participant` values continue to work
- **General category:** Unaffected — already bypasses limit

### 11. Change A — Test Cases

1. Register participant to 5+ non-GN items → should succeed (previously blocked)
2. Register participant to GN items → should succeed (already works)
3. Bulk import with 5+ event columns → should not error on count
4. Register participant to same item twice → should still fail (DuplicateRegistrationRule)
5. Register participant from 2 teams → should still fail (DualTeamRule)
6. Set `max_items_per_participant` in festivalConfig → should still respect the cap
7. Set `max_items_per_participant: null` → should mean unlimited

---

## Change B: Add Stage/Off-Stage Item Type

### 1. Critical Finding: `item_type` Column Semantic Conflict

**The `item_type` column exists but has CONFLICTING usage:**

| Source | Expected Values | Actual Purpose |
|--------|----------------|----------------|
| Schema comment (`001_initial_schema.sql:51`) | `stage` / `offstage` | Stage vs Off-Stage |
| Test fixtures (`runtime_rls_test.sql:100-101`) | `individual` / `group` | **WRONG — duplicates `participation_type`** |
| Scoring rules (`scoringRules.ts:25`) | `'stage' \| 'offstage'` | Performance scoring |
| Leaderboard (`leaderboard.tsx:1117`) | `'stage'` vs other | Display label |
| Judge marks (`judge/marks.tsx:159`) | Defaults to `'stage'` | Scoring mode |
| Admin marks (`schedule/[id]/marks.tsx:83`) | Defaults to `'stage'` | Scoring mode |
| Public views (`067_public_ai_views.sql:78`) | Passes through | Display |

**The application code consistently expects `stage` / `offstage`.**
**The test fixtures incorrectly use `individual` / `group`.**

### 2. The Two Separate Columns

| Column | Purpose | Values | Constraint |
|--------|---------|--------|------------|
| `participation_type` | Individual vs Group | `'individual'` / `'group'` | Used throughout (32+ references) |
| `item_type` | Stage vs Off-Stage | `'stage'` / `'offstage'` | Schema comment only, no CHECK |

**These are DIFFERENT concepts:**
- `participation_type`: How many people compete (solo vs team)
- `item_type`: Where/how scoring happens (on-stage performance vs off-stage creative)

**`item_type` is NOT available in the TypeScript `Item` type definition.**

### 3. Missing Infrastructure

| Component | Status |
|-----------|--------|
| Database column (`items.item_type`) | EXISTS — `text`, nullable |
| Schema comment | `-- stage/offstage` |
| TypeScript type definition | **MISSING** — not in `src/types/index.ts` |
| Item create/edit form | **MISSING** — `items.tsx` only has `participation_type` in custom item form |
| CHECK constraint | **MISSING** — any text value can be stored |
| Default value | **MISSING** — NULL allowed |
| Seed data / HANDBOOK_ITEMS | **MISSING** — no `item_type` in any handbook item |
| Admin UI for setting item_type | **MISSING** |
| Data population for existing items | **UNKNOWN** — no migration sets item_type for existing items |

### 4. Current item_type Usage in Code

```typescript
// scoringRules.ts:25 — Expects 'stage' | 'offstage'
export const getScoringRulesForItem = async (
  itemNameEn: string, 
  itemNameMl?: string, 
  itemType: 'stage' | 'offstage' = 'stage',
  tenantId?: string
): Promise<ItemRule> => {

// leaderboard.tsx:1117 — Expects 'stage'
itemType = item.items.item_type === 'stage' ? 'Stage Item' : 'Off-Stage Item';

// judge/marks.tsx:159 — Defaults to 'stage'
const itemType = sessionData.schedules?.items?.item_type || 'stage';
```

### 5. Risk Assessment for CHECK Constraint

**Adding `CHECK (item_type IN ('stage', 'offstage'))` is unsafe because:**

1. **No migration sets item_type for existing items** — all existing rows are NULL
2. **Test data uses wrong values** (`individual`, `group`) — would violate constraint
3. **HANDBOOK_ITEMS has no item_type** — all 170+ items would be NULL
4. **No default value** — new items created without item_type remain NULL

**Safe path:** Set a default value, backfill NULL rows, THEN add CHECK constraint.

### 6. Change B — Architecture Required

| Work Item | Type | Effort |
|-----------|------|--------|
| Add `item_type` to TypeScript `Item` interface | Code | 5 min |
| Add item_type field to items.tsx admin UI | Code | 30 min |
| Create migration: SET DEFAULT + backfill NULL rows | Migration | 30 min |
| Add CHECK constraint (after backfill) | Migration | 5 min |
| Update HANDBOOK_ITEMS with correct item_type values | Data | 1-2 hours |
| Test scoring rules with both types | QA | 30 min |
| Test leaderboard display with both types | QA | 30 min |

### 7. Change B — Recommendation

**Do NOT overload `item_type` with a different meaning.** The column already has the correct semantic (stage/offstage) per the schema comment and application code. The problem is:

1. The test fixtures have wrong values (individual/group instead of stage/offstage)
2. No UI exists to set the value
3. No migration backfills existing items
4. No CHECK constraint enforces valid values

**Recommended approach:**
1. Fix test fixtures first
2. Add TypeScript type
3. Add admin UI
4. Create migration with DEFAULT + backfill + CHECK
5. Populate handbook items with correct values

---

## Recommendations

### A. Exact Smallest Safe Implementation for Unlimited Items

**Verdict: SAFE TO IMPLEMENT WITH SMALL TARGETED CHANGES**

| Step | File | Change | Lines |
|------|------|--------|-------|
| 1 | `src/core/rules/registrationRules.ts` | Modify `ItemLimitRule.evaluate()` | ~5 lines changed |
| 2 | `src/core/hooks/useBulkImport.ts` | Remove lines 159-162 (dead validation) | 3 lines removed |

**Total: 2 files, ~8 lines changed**

**Detailed change for Step 1 (registrationRules.ts:7-29):**
```typescript
evaluate(context: RuleContext): RuleResult | null {
    const { item, existingRegistrations, festivalConfig } = context;
    
    // GN category bypasses limits by default
    if (item.category_codes?.includes('GN')) return null;

    const configuredLimit = festivalConfig?.max_items_per_participant;
    
    // null/undefined/0 means unlimited
    if (configuredLimit == null || configuredLimit <= 0) return null;

    const nonGeneralCount = existingRegistrations.filter(
      (r: any) => !r.item?.category_codes?.includes('GN')
    ).length;

    if (nonGeneralCount >= configuredLimit) {
      return {
        ruleId: this.id,
        severity: 'error',
        message: `Maximum allowed items is ${configuredLimit} (excluding General category).`,
        metadata: { currentCount: nonGeneralCount, maxLimit: configuredLimit }
      };
    }

    return null;
  }
```

**Detailed change for Step 2 (useBulkImport.ts:159-162):**
Remove these 4 lines entirely:
```typescript
const eventCount = [row.event1, row.event2, row.event3, row.event4].filter(e => !!e).length;
if (eventCount > 4) {
  errors.push(`Selected ${eventCount} events (max 4 allowed)`);
}
```

**Database changes:** None
**Migration:** None
**Backward compatible:** Yes
**Regression risk:** Very Low

---

### B. Exact Smallest Safe Implementation for Stage/Off-Stage

**Verdict: IMPLEMENTATION REQUIRES ADDITIONAL ARCHITECTURAL WORK**

The `item_type` column already exists with the correct semantic meaning. The work is **completing the missing infrastructure**, not adding a new feature.

| Step | File/Location | Change | Effort |
|------|---------------|--------|--------|
| 1 | `src/types/index.ts` | Add `item_type?: 'stage' \| 'offstage'` to `Item` interface | 1 line |
| 2 | `supabase/tests/runtime_rls_test.sql:100-101` | Fix test data: `item_type` should be `'stage'` not `'individual'`/`'group'` | 2 lines |
| 3 | `src/app/(admin)/settings/items.tsx` | Add item_type dropdown to custom item form | ~20 lines |
| 4 | `supabase/migrations/` | New migration: SET DEFAULT 'stage', backfill NULL, ADD CHECK | ~15 lines |
| 5 | `src/constants/items.ts` | Add `item_type` to HANDBOOK_ITEMS (data work, ~170 items) | ~170 lines |

**Total: 5 files, ~210 lines changed**

**Migration SQL (Step 4):**
```sql
-- 1. Set default for new items
ALTER TABLE items ALTER COLUMN item_type SET DEFAULT 'stage';

-- 2. Backfill existing NULL rows (conservative: stage for performance items, offstage for creative)
UPDATE items SET item_type = 'stage' WHERE item_type IS NULL;

-- 3. Add CHECK constraint
ALTER TABLE items ADD CONSTRAINT items_item_type_check 
  CHECK (item_type IN ('stage', 'offstage'));
```

**⚠️ WARNING:** Step 2 (backfill) requires understanding which items are stage vs offstage. A blanket `SET 'stage'` is safe but may be wrong for some items. A proper backfill requires analyzing each item's nature.

**Database changes:** Yes (migration required)
**Backward compatible:** Yes (if default is set before CHECK)
**Regression risk:** Medium (data migration affects all items)

---

## Final Decision

### Change A (Unlimited Items)
**SAFE TO IMPLEMENT WITH SMALL TARGETED CHANGES**
- 2 files, ~8 lines
- No database changes
- No migration needed
- Low risk

### Change B (Stage/Off-Stage)
**IMPLEMENTATION REQUIRES ADDITIONAL ARCHITECTURAL WORK**
- 5 files, ~210 lines
- Database migration required
- Data backfill required (170+ items)
- Medium risk — must be done carefully with proper testing

---

*End of Report*
