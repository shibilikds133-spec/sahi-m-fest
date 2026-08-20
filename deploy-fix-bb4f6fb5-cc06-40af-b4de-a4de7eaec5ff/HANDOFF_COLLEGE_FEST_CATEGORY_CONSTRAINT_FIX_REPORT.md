# College Fest Custom Category Constraint Fix

## Handoff Context

The active error was PostgreSQL `23514` from `participants.chk_category_code` while assigning a manually created College Fest category. The existing dirty worktree and prior migrations were preserved.

## Previous Codex Work Preserved

Migrations 106 and 107 were not edited. Migration 106 provides `festival_categories`, tenant/festival-scoped active/archive validation, and template-aware participant/item triggers. Migration 107 preserves the least-privilege `resolve_festival_template` permission-chain fix: trigger validators are `SECURITY DEFINER` with fixed search paths, while direct execution remains revoked.

## Root Cause and Existing Contract

The repository contains no historical definition of `chk_category_code`; the effective production catalog definition was not safely retrievable in this environment because the available Node diagnostic lacks its `pg` runtime dependency. The reported `23514` proves that the effective constraint rejected the submitted custom code before the College Fest membership trigger could accept it. The exact rejected code was not present in the handoff/log artifacts and is therefore recorded as **not captured**, rather than guessed. Migration 106 did not replace this old constraint.

The old constraint is replaced by a structural-only constraint with the same name. NULL remains permitted; non-NULL values must be trimmed, begin with a letter, and contain only letters, digits, or underscores. This permits stable custom codes without making the field unrestricted. Sahithyolsav meaning and fixed allow-list behavior remain in `validate_participant_category()`.

## Custom Category Storage and Payload

`public.festival_categories` stores `id`, `tenant_id`, `festival_id`, `name`, stable `code`, ordering, active/archive state, and timestamps. Codes are unique per festival and cannot change after use. The participant payload continues to use `participants.category_code` as the single source of truth; College Fest sends `class_std` and `education_type` as NULL.

## Forward Migration

Created `supabase/migrations/108_relax_participant_category_code_constraint.sql`. It verifies exactly one old constraint exists, read-only checks existing values, aborts without modification if incompatible rows exist, drops only the exact named constraint, and adds the structural replacement. No data is rewritten and no migration was applied.

## Validation and Security

College Fest membership remains enforced by migration 106 through festival category lookup requiring matching tenant, festival, and active state. Unchanged archived values are allowed only on participant update, preserving historical readability. Unknown, foreign-tenant, foreign-festival, and newly assigned archived categories remain rejected. Sahithyolsav continues through its existing automatic rules. RLS, grants, safe search paths, and trigger attachments are preserved; no PUBLIC or anon execute grants were added.

Registration compatibility remains code-based and can support custom codes once College Fest items are configured with those codes. Existing College Fest import/item UI gaps remain; no unrelated redesign was made.

## Test Matrix and Static Checks

Runtime participant, cross-tenant, archive, Sahithyolsav, permission, and registration tests were not run because deployment/application was explicitly out of scope and no disposable authenticated database fixture was available. Static SQL review confirms the migration is forward-only and non-destructive.

`npx.cmd tsc --noEmit` reports the existing workspace baseline errors (including imports, settings points, notification typings, and Deno edge-function typings); no new error was identified in the category files. Focused ESLint passed with zero errors and two pre-existing warnings in `participants/add.tsx`.

## Files Changed

- `supabase/migrations/108_relax_participant_category_code_constraint.sql`
- `HANDOFF_COLLEGE_FEST_CATEGORY_CONSTRAINT_FIX_REPORT.md`

## Deployment and Remaining Risks

Migration 108 was applied to the linked production database after explicit user approval. It changed only the participant constraint and migration metadata; no participant, category, or registration rows were rewritten. Frontend and Edge Functions were not deployed. The full disposable transaction matrix, including item configuration and registration compatibility, should still be run. The exact rejected category code was not captured in the original artifacts.
