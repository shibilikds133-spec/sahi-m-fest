# Points and Grace Marks — Local Implementation and Verification

Date: 2026-10-19. Checkout: `D:\work\fest\web-for-sahi--main\web-for-sahi--main`.

## Status and scope

The scoring/grace implementation and unapplied deployment migration are now included in staging Git `main` commit `fa0a535`. This report is not evidence of database application or production deployment: no remote database was changed or verified, and no deployment was performed. The separately nested client checkout was not changed. Unrelated dirty work was preserved.

The implementation plan was created before changes in `POINTS_AND_GRACE_IMPLEMENTATION_PLAN.md`. Supabase security/transaction guidance influenced private calculation helpers, explicit RPC authorization, immutable publication/submission ledgers, optimistic version checks and short transactional finalization.

## Verified from repository

### Data flow

1. Points Configuration loads the festival's saved configuration. Missing numerical values remain blank/invalid rather than receiving code defaults.
2. Baseline ranks, one universal default grade-point row for participants (and a separate group row only when configured), grade percentage thresholds, boost values/memberships and grace field definitions are saved together as a new configuration version.
3. One item UUID identifies one competition/category. Neither membership list means baseline; one list changes that component; both lists replace both components. Baseline points are not added a second time.
4. Judge/admin entry records raw marks and an explicit maximum snapshot. Grade previews use saved percentage thresholds; no default maximum or grade cutoff is supplied by the calculator.
5. Publishing derives the item, tenant, eligible registrations, active judges, grades, ranks and award components on the server. It stores sealed result rows, raw-mark inputs and configuration version in the same transaction as the schedule bracket update.
6. Existing consumers continue reading `results.points_awarded`. Configuration editing alone does not rewrite these awards. Explicit republishing may reduce awards. Replaced rows are retained in publication history, including older rows that predate the new ledger.
7. Grace drafts live only in `grace_workspaces`. Fields start empty in configuration and require admin-entered names/maxima. The entry screen uses actual current child-team records, not a fixed team count.
8. All Submit validates the complete matrix, freezes the team roster for the short transaction, records the immutable submission and previous final rows, then replaces `grace_marks` totals. Blank is missing; an entered zero is valid. Concurrent retries cannot add points twice.
9. Existing leaderboard aggregators retain their visibility/item-limit gates. Their final grace source is unchanged. New submitted grace-only teams can appear with zero competition-result count. Individual-ranking duplicate selection uses latest publication time rather than maximum historical award.

Group member counts follow the existing `useEntrySizes` semantics: nonempty `raw_group_members` length, otherwise leader plus stored group members. Counts remain in scoring inputs/metadata, but do not select point values. Each entry type uses one default grade-point set for all member counts; Grade Boost sections use the same default key. Separate group grade points remain optional.

Grade labels and rank positions retain the existing model. Numerical award values, maxima and percentage cutoffs are configuration data. Mathematical percentage scaling by 100 is not an award default. Previously applied migration files remain historical records.

### API flow and authorization

| RPC | Input/version boundary | Result |
| --- | --- | --- |
| `save_scoring_configuration` | Festival, expected config version, complete explicit rules; owning admin/superadmin | New row/version and immutable configuration snapshot |
| `save_competition_items` | Owned festival, selected codes and new single-category records; admin | Atomic activation/new-item inserts; existing metadata not overwritten |
| `preview_competition_points` | Schedule, expected version, manual raw inputs or persisted final judge marks; admin | Authoritative calculated batch |
| `publish_competition_results` | Same calculation inputs plus request UUID; admin | Sealed publication and transactional result writes |
| `get_judge_scoring_context` | Existing approved, unused, unrevoked, unexpired token and active assignment | Grade thresholds/version only |
| `get_grace_workspace` | Owned festival; admin | Configured fields, actual teams, saved draft/revision and last final submission |
| `save_grace_draft` | Expected config version and draft revision; admin | Draft only, no leaderboard changes |
| `submit_all_grace_marks` | Expected config version and draft revision; admin | Atomic, idempotent final submission |

The browser's instantaneous point preview mirrors the validated engine; publication always recomputes on the server. Published rows display stored awards until explicit republish. New manual publications retain raw inputs so later configuration republishing can reuse recorded marks. Old manual results without raw snapshots require reviewed re-entry, not a fabricated maximum.

Direct client writes to final grace totals and history ledgers are revoked. Result scoring writes require an exact sealed publication match. Visibility-only edits preserve historical scoring; a draft cannot become a newly published unsealed award. Old archived/unsealed rows may require explicit republishing before release.

### Changed files by responsibility

- Configuration and calculation: `src/core/utils/flexiblePointsEngine.ts`, `pointCalculator.ts`, `scoringRules.ts`, `requestId.ts`, `currentResult.ts`, `src/types/scoring.ts`, `src/lib/validation/registrationValidator.ts`.
- UI: `src/app/(admin)/settings/points.tsx`, `settings/items.tsx`, `settings/scoring-rules/index.tsx`, `settings/scoring-rules/[id].tsx`, `grace-marks/index.tsx`, `schedule/[id]/results.tsx`, `schedule/[id]/marks.tsx`, `src/app/judge/marks.tsx`, `src/components/ui/DirectMarkEntryModal.tsx`, `AdminMarkEntryModal.tsx`.
- Contracts/data access: `src/core/hooks/useFestival.ts`, `useJudges.ts`, `src/providers/database/DatabaseProvider.ts`, `SupabaseDatabaseProvider.ts`, `src/lib/repositories/judgeRepository.ts`, `src/services/judgeService.ts`, `pointsService.ts`, `graceMarksService.ts`.
- Downstream correction: admin and public `leaderboard/individual-rankings.tsx` retain surrounding behaviour while changing duplicate-version selection only.
- Migration: `supabase/migrations/20261019155907_configurable_points_and_grace_submissions.sql`.
- Checks: `tests/scoring.test.cjs`, `tests/scoring-concurrency.cjs`, `tests/scoring-browser.cjs`, `supabase/tests/configurable_points_grace.sql`, `supabase/tests/scoring_preflight.sql`.
- Removed unused parallel/mock calculators: `src/core/hooks/useFestivalSettings.ts`, `src/lib/calculators/resultCalculator.ts`. No remaining source imports were found; the files are recoverable from Git history.

The migration patches only explicit-maximum defaults/validation within the installed judge mark functions. Their existing token checks, final locks and permission code are not replaced by a different historical function body. Unknown validator shapes fail the migration transaction for review.

## Verified from isolated runtime/database

Rehearsal used a schema-only copy of the existing local database inside `supabase_db_web-for-sahi--main`, database `scoring_validation_20261019`. The user's `postgres` data/schema was not changed. Selected existing migrations 161, 166, 171 and 174-preview were replayed only inside the disposable database before the new migration to cover later mark-lock and grace contracts. No production rows were copied.

- Node engine tests: 17 discovered and passed in the 2026-10-21 follow-up. Coverage includes four profiles, arbitrary configured awards, actual maxima and percentage boundaries including explicit zero, no missing-rule fallback, minimum-team behaviours, universal participant/group default points and rejected non-default overrides, grace definition validation, serialization and downward corrections.
- SQL transactional assertions: passed for configuration versions, full batch publication, request retries, forged-award rejection, stale configurations, separate category identities, downward republishing, retained history, grace draft isolation/completeness/maxima, explicit zero, replacement rather than addition, active-judge filtering, final mark locks, used-token denial, cross-tenant/admin boundaries, grace-only admin/public totals and leaderboard preview.
- Actual `authenticated` role tests: passed for concurrent draft/config saves (one wins, stale writer rejected), concurrent All Submit retries (same submission ID), and final/history table ACLs.
- Existing installed token-expiration and judge-registration function definition hashes matched before/after migration. Reset RPCs were not installed in the original local schema; their live authorization was not runtime-verified.
- Browser tests used a production web export, fake public credentials and intercepted APIs only. Points/Grace screens passed at widths 1440, 1024, 768, 390 and 320px; input bounds, blank new fields, explicit zero, draft-only saves, one All Submit and uncaught-page-error checks passed. Screenshots were visually inspected under `output/scoring-validation`.
- `npx expo export --platform web --output-dir .scoring-build-validation` passed with fake test Supabase credentials and dotenv loading disabled. Existing font/CSS/Browserslist warnings remain.
- Focused ESLint: zero errors; 30 existing/adjacent unused-import and hook-dependency warnings, not silently suppressed.
- A scoped TypeScript semantic check found zero diagnostics in the scoring implementation modules. The repository source still has 92 other diagnostics; the unrestricted project check also scans nested checkouts. A full-project TypeScript pass is **not** claimed. The touched admin-ranking file's `ui.colors.destructive` error also exists in HEAD and was not introduced by its duplicate-selection edit.

Commands for repeat verification:

```powershell
node --experimental-strip-types --test tests/scoring.test.cjs
# Only after migration rehearsal in the named disposable database:
Get-Content -Raw supabase/tests/configurable_points_grace.sql | docker exec -i supabase_db_web-for-sahi--main psql -U supabase_admin -d scoring_validation_20261019 -q -v ON_ERROR_STOP=1
node tests/scoring-concurrency.cjs
# Export first with fake test URL/key; this test never uses a live Supabase:
node tests/scoring-browser.cjs
```

`scoring-concurrency.cjs` deliberately persists synthetic fixtures only in the explicitly named disposable database so separate transactions can race. Drop/recreate that database between complete rehearsals. The SQL assertion file itself rolls back all its fixtures.

Cleanup was blocked by the execution policy. The task-created databases `scoring_plan_test_20261019` (partial initial rehearsal) and `scoring_validation_20261019` (synthetic fixtures), temporary `.scoring-build-validation` export and `output/scoring-validation` screenshots remain local. Do not include the generated export in a code commit. They contain test data/fake public credentials, not production copies. A final read-only check confirmed the original local database still has zero points configs/mark entries and no new scoring-publication table.

## Release gates and remaining risks

### 2026-10-21 finalized-mark correction follow-up

- **Verified from repository:** `supabase/migrations/20261021131729_preserve_final_marks_and_secure_admin_reentry.sql` replaces the earlier unlock RPC without updating `mark_entries`; it only moves matching published/ready results to draft and unpublished. The admin edit now uses the `admin_upsert_mark` RPC and touches only the selected schedule/judge/registration row. A previously finalized row is reopened and finalized again inside one transaction; failure rolls that edit back.
- **Security boundary:** Both RPCs require a signed-in admin/super-admin and scope tenant-admin roles to the schedule tenant. The admin-edit RPC additionally validates the target registration and active judge assignment. The browser no longer treats the tenant ID as an admin password.
- **Validation:** Targeted ESLint passed. Full-project `tsc --noEmit` remains failing on existing errors across clone/export folders and unrelated application components. No PostgreSQL test was run and this migration has not been applied to Staging or Main, so the database behavior is not yet runtime-verified.

The earlier definitions remain in migration history, but this later migration replaces them when applied. Verify migration history and the installed function definitions on the intended target before treating the authorization and finalized-mark behavior as live.

### B — Target configuration/history preflight is pending

Run `supabase/tests/scoring_preflight.sql` read-only against the explicitly confirmed target. Review duplicate configs, absent numerical rules, bracket coverage, historical maxima, multi-category items and team ownership. In particular old `official` mode ignored some stored settings and supplied code constants: removing that override may expose differences. No values were auto-seeded or inferred to hide them. Confirm the intended baseline values before publishing under the new engine.

The existing local database has two active festivals and no points configs/marks; it cannot prove production baseline equivalence. Schema-only synthetic tests are not a production-data audit. No multi-category historical item was automatically split or reassigned.

### 2026-10-21 default grade-points follow-up

- **Verified from repository:** The Points Configuration editor now presents only default A+, A, B and C point fields. Legacy range-shaped configuration is interpreted using the lowest enabled row, then serialized as one open-ended default (`min=1`, no upper limit); extra range-specific boost-map keys are not saved. Individual, Grade Boost, Rank Boost and combined profiles remain competition-item scoped.
- **Verified from repository:** The new SQL migration canonicalizes configuration on authorized saves, disables member-count bracket selection/overrides, and makes server publication use the same default points for every size. It also fixes the separate-group SQL selection typo (`separate_agroup_brackets`), which could select participant points for group entries.
- **Compatibility boundary:** The migration does not bulk-rewrite existing config rows or published awards. Existing range rows are scored using the currently lowest enabled row immediately; saving the configuration stores the single universal row and retains the new config version snapshot. Existing published results remain unchanged until explicit republish.
- **Validation:** `node --experimental-strip-types --test tests/scoring.test.cjs` passed 17/17; focused TypeScript check and ESLint passed. SQL regression assertions were added for legacy-row normalization and separate group boosts, but were **not run** because no local PostgreSQL stack was running and no remote Supabase target was confirmed. The new migration has not been applied to Staging or Main, and actual saved competition configurations remain runtime-unverified.

The latest public leaderboard migration 172 expects `festival_leaderboard_settings.ranking_mode/item_limit`, which are absent in the original local schema. Public totals were exercised with migration 166; preview with 174. The newer public item-limit shape is patched compatibly but needs a target-shaped runtime test after confirming its schema history. Do not replay every old migration blindly: repository history contains duplicate numbering and older SQL defects.

### B — Deployment is a coordinated schema/client release

New UI calls require the matching migration. Do not deploy only frontend changes against an old database. Back up the confirmed target, reconcile migration history, finish the A-risk review, rehearse against its schema, apply the migration and release the matching frontend in a controlled window. Cached old clients will receive explicit configuration/publication errors rather than being allowed to forge awards; arrange a reload. Source is present in staging Git `main` at `fa0a535`; no remote apply, linked-target dry run, or deployment has been performed.

Missing configurations intentionally block awards. Admins must enter actual rules; no default seeds are supplied. Existing published awards remain unchanged until explicit republish. Turning off grace visibility retains its old configured behaviour; it does not delete submission history.

Rollback should retain/export new ledgers first. Do not blindly drop snapshot tables or deploy the old direct-write client against the new sealing boundary. Prefer a reviewed forward fix and controlled release. Repository-wide type errors and existing build warnings remain outside this scoring scope.
