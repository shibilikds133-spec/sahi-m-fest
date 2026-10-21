# Main Supabase Migration Checklist

Prepared: 2026-10-20

Updated: 2026-10-21 (staging Git `main` now includes commit `fa0a535`; migrations 13, 16–19 were pushed as source only. No Supabase project was changed or verified.)

Staging Git repository: `shibilikds133-spec/sahi-m-fest`
Target: **Main Git repository/branch and Main Supabase project reference are not yet confirmed**. The known Git remote is the staging repository; its `main` branch is not the separate Main Git repository. The user reports migrations were applied to Staging Supabase project `szhwkngspodujiqzblab`; that report is not independently verified here.

## Execution status

The user reports that earlier migrations were applied to Staging (`szhwkngspodujiqzblab`); this does **not** establish whether any newer SQL was applied. Commit `fa0a535` publishes migrations 13 and 16–19 to staging Git only; no staging/Main database migration history or live schema was verified. Do not rerun earlier SQL solely based on this checklist. If a follow-up change is needed, first check the target project's actual schema and history. SQL Editor runs may not be reflected in migration history, so inspect existing tables/functions before retrying any SQL.

Apply only migrations that are not already present and whose expected schema changes are absent. Keep the order below. Record the actual project reference and run date after each manual execution.

## Ordered migration files

| Order | Migration | Purpose | Present on staging Git repo `main` | Main Supabase DB status |
| ---: | --- | --- | --- | --- |
| 1 | `supabase/migrations/20261019155907_configurable_points_and_grace_submissions.sql` | Configurable scoring, grace-mark submissions, shared `scoring_private` functions including `assert_admin`. Prerequisite for order 2 and order 7. | Yes | Not verified |
| 2 | `supabase/migrations/20261020021346_festival_scoring_switches_and_group_size.sql` | Festival scoring switches, group-size behavior, scoring and competition-item RPC updates. | Yes | Not verified |
| 3 | `supabase/migrations/20261020075307_general_team_entries.sql` | General team entry schema/RPCs and related result/stage access functions. | Yes | Not verified |
| 4 | `supabase/migrations/20261020103212_festival_gender_mode.sql` | Festival-wide gender mode and participant-gender enforcement. | Yes; verified in staging Git repo `origin/main` at `3f80831`. | Not verified; apply to Main only if absent |
| 5 | `supabase/migrations/20261020121526_reserve_unique_festival_chest_numbers.sql` | Safe chest-number reservation for participant creation. | Yes; verified in staging Git repo `origin/main` at `3f80831`. | Not verified; apply to Main only if absent |
| 6 | `supabase/migrations/20261020131308_program_intake_completion.sql` | Program intake completion status table, admin RPC, and registration-change trigger. | Yes, pushed in commit `5192039` | Not verified |
| 7 | `supabase/migrations/20261020135416_atomic_competition_item_changes.sql` | Atomic, tenant-admin-authorized item activation/deactivation RPC; depends on order 1's `scoring_private.assert_admin`. | Yes, pushed in commit `5192039` | Not verified |
| 8 | `supabase/migrations/20261020150000_archived_organisation_lifecycle.sql` | Archive/restore lifecycle and guarded permanent deletion for archived organisations. | Yes; verified in staging Git repo `origin/main` at `3f80831`. | Not verified; apply to Main only if absent |
| 9 | `supabase/migrations/20261020171835_allow_restore_of_archived_organisations.sql` | Allow hierarchy-authorized restore of archived organisations. | Yes; verified in staging Git repo `origin/main` at `3f80831`. | Not verified; apply after order 8, only if absent |
| 10 | `supabase/migrations/20261020174030_fix_participant_class_std_integer_cast.sql` | Keep the existing participant-create RPC signature and cast blank/numeric-text `class_std` input to the database's integer column. No table/data change. | Yes; pushed in staging Git `main` commit `4bedddd` (2026-10-21). | Not verified; if needed, apply after order 5 and after confirming target RPC/column types. |
| 11 | `supabase/migrations/20261020181313_team_chest_number_template.sql` | Festival-selectable category/team chest-number template; stable team slots; atomic renumber on template/range save; participant-create/transfer/regeneration behavior and audit; guards on legacy chest-number imports. Existing festivals default to category mode. | Yes; pushed in staging Git `main` commit `4bedddd` (2026-10-21). | Not verified or DB-validated here. Check staging before Main; depends on orders 5 and 10 plus existing category-regeneration, transfer, import-auth and audit migrations. |
| 12 | `supabase/migrations/20261020183055_stage_venue_pin_portal.sql` | Private per-venue PIN storage, generated PINs for existing/new venues, PIN attempt throttling, admin PIN lookup, and PIN-scoped venue data/check-in/code-letter/lock RPCs. | Yes; pushed to staging Git `main` in commit `2840683` (2026-10-21). | Not applied by this release; actual Staging/Main DB migration history and live schema remain unverified. Local DDL and PIN/read/check-in/code-letter-draw/manual-update/lock smoke checks passed in a rolled-back transaction, with the prior General-entry columns shimmed because the local DB is behind. |
| 13 | `supabase/migrations/20261020190937_qualify_participant_audit_log_table.sql` | Qualifies the existing participant audit trigger's table reference as `public.audit_logs`, allowing participant updates inside functions with an empty `search_path` to write audit rows. Replaces the trigger function only; no table/data migration. | Yes; pushed in staging Git `main`, commit `fa0a535`. | Not applied or runtime-tested. Verify `public.audit_logs` and its expected columns exist on the target before applying. |
| 14 | `supabase/migrations/20261020195951_configurable_boost_sections.sql` | Stores Grade/Rank Boost as named sections, competition membership and per-section points; version-checked save and history. Prerequisite for order 16. | Yes; present in staging Git `main` at `ea44af5` and descendant `fa0a535`. | Not verified; inspect target migration ledger/schema before applying. |
| 15 | `supabase/migrations/20261020201853_default_grade_points_ignore_member_count.sql` | Earlier local attempt to make default grade points independent of member count. Its group-award selector contains `separate_agroup_brackets` typo and is superseded by order 16. | Intentionally excluded from staging Git; local untracked historical attempt. | May have been manually run; unknown. Inspect function definition and migration ledger before deciding; do not blindly apply/replay it. |
| 16 | `supabase/migrations/20261021035515_default_grade_points_ignore_member_count.sql` | Forward correction: use one universal default for all participant/group sizes, canonicalize range-shaped config on authorized save, preserve Grade Boost values under the default key, and fix group default selection while keeping item-specific Grade/Rank sections. No bulk config rewrite or published-result recalculation. | Yes; pushed in staging Git `main`, commit `fa0a535`. | Not applied or SQL-runtime-tested. Requires order 14 schema and compatible existing scoring functions/triggers; target and migration history must be confirmed first. |
| 17 | `supabase/migrations/20261021060506_fixed_code_letters_and_atomic_swap.sql` | Adds fixed manual letters, fixed-preserving draws, conflict-checked atomic swaps and scoped admin/PIN RPCs. | Yes; pushed in staging Git `main`, commit `fa0a535`. | Not applied to Staging/Main. Contract tests passed on an isolated PostgreSQL fixture; full target-schema replay remains unverified. |
| 18 | `supabase/migrations/20261021060510_code_letter_change_notifications.sql` | Emits data-free Realtime invalidation hints for affected festival/schedule/venue after code-letter changes. | Yes; pushed in staging Git `main`, commit `fa0a535`. | Not applied to Staging/Main. Full Supabase Realtime delivery remains unverified. |
| 19 | `supabase/migrations/20261021060616_code_letter_operational_reads.sql` | Adds scoped readers exposing current code-letter/fixed state to admin and PIN-authorized stage views while retaining the existing reader signatures. | Yes; pushed in staging Git `main`, commit `fa0a535`. | Not applied to Staging/Main. Confirm target RPC/schema compatibility before applying. |

**Orders 12–19 are not verified as applied to Staging or Main Supabase.** Orders 12–14 and 16–19 are present in staging Git `main`; order 13 and 16–19 were pushed in `fa0a535`. Order 15 was intentionally excluded because its known typo is superseded by order 16. Check each project's migration history and required schema before deciding what to run. A Git push is not proof that the UI is deployed or SQL is applied.

Order 12 depends on the existing Stage Management schema/RPC foundation (including the lock columns and hierarchy visibility helper) and the General team-entry registration shape from order 3. The local Supabase database is behind the checked-out migrations: the rollback smoke test had to add `registrations.entry_kind` and `registrations.entry_chest_number` inside its temporary transaction. Those shims were rolled back and are not part of the migration. Confirm the prerequisites on the actual Staging project before manually running order 12.

### Order 13 notes: participant audit trigger resolution

- **Verified from local repository:** `004_phase5_participant_management.sql` defines `audit_participant_changes()` with an unqualified `audit_logs` reference; `001_initial_schema.sql` creates `audit_logs` in the default `public` schema. The team chest-number regeneration routine runs with an empty `search_path` and updates `participants`, which fires the existing audit trigger. This is consistent with the reported `42P01 relation "audit_logs" does not exist` error; the live Staging schema has not been inspected, so actual schema drift remains unverified.
- Order 13 replaces the existing trigger function with the same behavior but explicitly targets `public.audit_logs` and `pg_catalog.row_to_json`. It does not recreate the table or change the trigger, grants, policies, or data.
- Before applying, confirm that `public.audit_logs` exists with the expected columns (`table_name`, `record_id`, `action`, `old_value`, `new_value`). If it is genuinely absent or its shape differs, stop and reconcile that schema separately rather than assuming this function-only migration creates it.
- The migration was pushed to staging Git `main` in `fa0a535`; it has not been applied to any database. Validation is static source review and `git diff --check`; no SQL runtime test was performed.

### Orders 14–16 notes: Grade/Rank sections and universal default grade points

- Order 14 provides the per-competition Grade/Rank section schema and version-checked save path. Confirm it is present before order 16; don't infer database state from its local file or Git history.
- Order 15 is an earlier local migration candidate and has a misspelled group-switch reference in its award function. Order 16 replaces that scorer and adds a save-time canonicalization trigger. Since order 15 is untracked and might have been manually executed, first inspect `scoring_private.award`, triggers on `public.points_config`, and the target migration history. Do not run order 15 simply because it sorts earlier.
- Order 16's frontend and SQL behavior use one enabled default grade-points row for all member counts; a separately configured group default remains supported. Grade Boost section maps are reduced to that default key; Grade and Rank sections remain competition-specific. Member count remains available as scoring metadata but no longer selects a grade-point range.
- Order 16 does **not** bulk-rewrite existing `points_config` rows or published results. Existing configs are evaluated with their lowest enabled row; an authorized save stores a single `min=1`, open-ended default and records a new version. Published results remain unchanged unless separately republished.
- **Validation boundary:** 17 frontend-engine tests, focused TypeScript and ESLint checks passed locally. SQL regression assertions were added but not executed: no local PostgreSQL stack was running, and no Supabase target was confirmed. Neither order 15 nor 16 has a verified database outcome.

**Separate security review required:** untracked `supabase/migrations/20261008000000_clone_parity_announcer_and_system_api_keys.sql` is not part of the above release sequence. Its older timestamp makes it easy to pick up accidentally in a bulk migration command. Repository inspection found `system_api_keys.key_value` and a `SELECT` policy using `USING (true)` for `authenticated`, plus an announcer-token read policy for active tokens. **Do not apply this file to staging or Main as-is.** Confirm whether these objects already exist, define intended access, and review/repair RLS, grants and function execution rights separately. Never assume its timestamp makes it a safe prerequisite.

### Order 11 prerequisites and activation boundary

- Confirm the target has the expected versions/equivalent definitions from `056_participant_unit_audit_logs.sql`, `097_import_rpc_authorization.sql`, `159_category_range_chest_numbers.sql`, `168_participant_team_transfer.sql`, and orders 5 and 10 above. Order 11 replaces/renames functions supplied by those migrations; an absent or different signature is a **stop**, not a reason to force-run SQL.
- A team here means one direct-child `organisations` row under the festival tenant's root organisation. Existing category-template festivals remain category-mode by default. Team slots are allocated by existing team creation order and stay stable; the admin must verify the actual team→range mapping before use.
- Applying the schema migration alone does **not** renumber existing participants. After migration, saving a different template or range atomically renumbers every existing participant in that festival; a missing team/category or full range rejects the whole settings save. Team transfer assigns a new current number; live views should follow the current participant record, but previously downloaded/exported files are immutable. This automatic switch has not yet been database-tested.
- The SQL has been prepared locally, **not executed against staging, Main, or an isolated validation database in this audit**. Do not treat static repository review as migration success.

### Order 11 implementation handoff: switching numbering templates

**Verified from local code, not from a running database:** The category and team templates use the same `festival_calendar.chest_number_category_range` (100 or 1000); the template changes only the grouping basis for participant chest numbers. A team is a direct-child sub-organisation, not an additional organisation level. The participant's ID, festival, category, team, registration and result relationships are not deliberately replaced by this conversion; only `participants.chest_number` is recalculated. This is an implementation description, **not yet a claim of end-to-end compatibility**.

| Action | Intended local behavior | Failure/compatibility boundary |
| --- | --- | --- |
| Apply order 11 SQL | Adds the festival template field with `category` as the existing-festival default; team slots, validation, audit and numbering functions become available. | Application alone does **not** change existing chest numbers or select team mode. Verify the actual target schema and migration history first. |
| Save Calendar with category → team or team → category | A database trigger calls festival-wide regeneration in the **same transaction** as the settings update. Every existing participant receives a number in the newly selected grouping. | Missing direct-child team in team mode, missing category in category mode, range capacity, plan-coverage or update-count failure aborts the **entire** Save. The prior template, range and chest numbers remain. Do not treat a UI preview as proof of a successful Save. |
| Save a different 100/1000 range without changing template | The same atomic regeneration runs, so old participants and future participant creation use one range. | Capacity failure also rolls back the entire settings Save. |
| Add a participant during a switch | Participant creation/direct insert and regeneration use a festival-scoped transaction advisory lock; the create RPC reads the template after taking the lock. | Confirm concurrent behavior on staging; static inspection alone cannot establish it under real load. |
| Return to category mode | Category regeneration includes configured festival categories and normalizes category codes, matching the category-position basis used by the create RPC. | If a participant lacks a category, the switch is rejected without partial changes. |
| Save only unrelated Calendar fields | No renumbering when template and range values are unchanged. | Other Calendar behavior remains subject to its existing validation/RLS. |

The Calendar UI asks for confirmation before a template/range change and surfaces a failed Save; the Chest Numbers screen retains manual **Regenerate All** for an explicit rerun. On successful settings Save, the festival and participant list/detail React Query caches are invalidated. The aggregate regeneration audit records the selected template and participant count. Current candidate/result/certificate views must be tested to ensure they read the participant's **new current** number; a previously downloaded static export cannot update itself. No participant IDs or historical results should be deleted as part of a mode switch.

**Known workflow limit:** Existing chest-number-based JSON/CSV dataset imports remain blocked in team mode under the earlier approved rule, because their external chest numbers are not a stable participant identity after renumbering. Normal Add and schedule imports are separate paths. Do not claim complete category/team workflow parity until a new importer identity-mapping rule is approved and implemented. The database migration itself cannot solve that ambiguity.

**User-reported conversion blocker (2026-10-21; target project/rows not independently verified):** A Calendar switch produced `Cannot regenerate: 2 participant(s) are not assigned to a team under this festival organisation.` The regeneration function checks **all** festival participants, including rows not visible in the current list page, against festival team slots derived only from direct-child organisations. The conversion correctly aborted, leaving the prior template/numbers intact. Before retrying, identify the two participant IDs and their organisation parent IDs with a read-only query on the actual connected staging project. Do not silently reassign them, relax the team definition, or force partial renumbering; any data correction needs a verified intended team and separate approval.

**Before applying to Staging or Main:** Compare the exact target schema, RPC signatures and migration ledger with this local file. If any earlier version of order 11 has already been executed on a target project (including manually through SQL Editor), **do not edit/replay that applied migration on the target**; prepare and validate a new forward-only follow-up migration for the missing trigger/function behavior, and reconcile migration history deliberately. This checklist does not establish whether staging already contains any part of order 11. Back up and record selected festival/team membership and counts; test both directions, range change, rollback and concurrent create on staging before approving Main. Record exact SQL checksum, project ref, applied version and test outcome below.

## Related prerequisite to check

The participant picker now obtains the parent organisation and active descendants through the existing `public.get_visible_organisations(p_tenant_id)` RPC. This UI fix adds no SQL. Confirm that the Main database has the hierarchy visibility migration (`supabase/migrations/116_hide_archived_organisations_from_visibility.sql`, or an equivalent later definition) before expecting the picker to include subordinate-organisation participants.

## Supabase Data API grants: October 30, 2026 change

Supabase's [official announcement](https://github.com/orgs/supabase/discussions/45329) says existing tables keep their current grants. Starting October 30, 2026, newly created tables in `public` need explicit grants to be reachable through the Data API (`supabase-js`/PostgREST/GraphQL). Therefore, a migration first applied to Main after that date must carry the appropriate grants in the same migration that creates each table. This is distinct from RLS: a GRANT makes a table reachable to a role; RLS limits which rows that role can access.

### Repository audit of today's migrations

| New table(s) | Migration | Current access setup in SQL | Assessment |
| --- | --- | --- | --- |
| `scoring_publications` | `20261019155907_configurable_points_and_grace_submissions.sql` | RLS enabled; `PUBLIC`, `anon`, and `authenticated` revoked, then `SELECT` granted only to `authenticated`; tenant-scoped read policy. | Explicit least-privilege grant exists for the app's authenticated read path. |
| `grace_workspaces`, `grace_submissions`, `grace_marks` | `20261019155907_configurable_points_and_grace_submissions.sql` | RLS enabled on all three; direct `SELECT` granted only to `authenticated` after revoking `PUBLIC`, `anon`, and `authenticated`; workspace/submission reads have tenant-scoped policies. Writes use RPCs. | Explicit grants exist for authenticated reads; no anonymous table access is granted. |
| `general_entry_number_counters` | `20261020075307_general_team_entries.sql` | RLS enabled; `PUBLIC`, `anon`, and `authenticated` revoked; no direct client-table grant. | Intentionally internal; do not expose it. The migration's RPCs own the counter workflow. |
| `program_intake_statuses` | `20261020131308_program_intake_completion.sql` | RLS enabled; `PUBLIC`, `anon`, and `authenticated` revoked, then `SELECT` granted only to `authenticated`; admin-read policy; writes go through `set_program_intake_status`. | Explicit grant exists for the authenticated read path; writes remain RPC-controlled. |
| `festival_team_chest_slots` | `20261020181313_team_chest_number_template.sql` | RLS enabled; direct `PUBLIC`/`anon`/`authenticated` table access revoked. | Internal slot allocation only; do not add blanket client CRUD grants. |
| `participant_chest_number_changes` | `20261020181313_team_chest_number_template.sql` | RLS enabled; direct access revoked, then `SELECT` granted to `authenticated` with festival-owner-tenant/superadmin read policy. | Explicit read grant is present; verify intended audit visibility and actual Data API settings before Main. |

Other migrations in the ordered list do not create new `public` tables. The existing `points_config_versions` table is explicitly granted `SELECT` to `authenticated` in the scoring migration, but is not a newly-created table there. The held clone-parity file is **not** covered by this access assessment.

Do not paste Supabase's sample blanket grants (`anon`, `authenticated`, and `service_role` CRUD) into every migration. Grant only the roles and operations the verified app/API path requires; keep internal tables private, retain RLS and policies, and separately review sequence/function privileges if future migrations create those objects. This repository review found no direct client CRUD path for the internal counter table. Verify the target project's actual Data API settings and exercise the app's authenticated flows after manually applying SQL.

## Manual run record

Fill these in while applying migrations:

- Main Supabase project name: `____________________________`
- Main Supabase project reference: `____________________________`
- Applied by / date: `____________________________`
- Migration versions already present before applying: `____________________________`
- Exact approved SQL file versions/checksums: `____________________________`
- Versions manually applied and verified: `____________________________`
- Verification notes / errors: `____________________________`

Do not put passwords, access tokens, service-role keys, or database connection strings in this document.

### Staging Supabase run record

- Project ref: `szhwkngspodujiqzblab` (confirm in dashboard before running)
- Read-only migration/schema check performed: `____________________________`
- Migrations already present before this run: `____________________________`
- Migration(s) run and verified: `____________________________`
- Applied by / date / result: `____________________________`

### Main Git and Supabase run record

- Main Git repository URL and branch (must be confirmed): `____________________________`
- Main Git commit/PR containing the approved staging changes: `____________________________`
- Main Supabase project name/ref (must be confirmed): `____________________________`
- Read-only migration/schema check performed: `____________________________`
- Migrations already present before this run: `____________________________`
- Migration(s) run and verified: `____________________________`
- Applied by / date / result: `____________________________`

## Staging-to-main handoff — updated 2026-10-21

Keep the three environments/repositories distinct:

1. **Staging Git repository**: `https://github.com/shibilikds133-spec/sahi-m-fest.git`, branch `main`.
2. **Staging Supabase**: project ref `szhwkngspodujiqzblab` (user-reported target; database migration history/schema not independently verified in this handoff).
3. **Separate Main Git repository and Main Supabase**: destination repository URL/branch and project ref are still **unknown and must be confirmed before pushing/applying**.

### Today's implementation already present in staging Git `main`

The latest remote check found staging Git `origin/main` at `fa0a5350a5b6101a084dfecd59827ac2e888c4f1` on 2026-10-21. The recent tracked commits include:

- `8fa9d41`, `3f8c659`: configurable point/scoring rules, grade/rank boosting and grace-mark submission flow, general team entries, plus the scoring request-ID helper and associated tests/migrations.
- `63e24c4`: participant Add form UI alignment.
- `5192039`: Programs page/participant assignments and completion tracking; migrations for intake status and atomic item activation/deactivation.
- `8253462`: desktop leaderboard controls layout.
- `ea9911f`, `63041f5`: festival workflow, participant/gender and chest-number handling, team credential flows, and removal of an obsolete schedule hook.
- `3f80831`: archived organisation/sub-organisation lifecycle and restore authorization migrations.
- `7243434`, `2aaea93`: venue/scheduled-event card styling.
- `5fdc4d3`: judge portal back navigation.
- `07baf60`: communication-center feature flag.
- `3f4a61d`: active sidebar item border styling.
- `4bedddd`: participant class cast correction and configurable category/team chest-number implementation, including migrations 10–11 and related UI.
- `2840683`: standalone per-stage four-digit PIN portal, venue PIN management, and participant-delete FK error guidance. Includes migration order 12 above. Remote `main` was verified at this exact commit after push.
- `fa0a535`: participant assigned-only Programs view and safe deselection, universal default Grade points, fixed/atomic code-letter assignment and redraw across admin/stage/judge/result consumers, and migrations 13 and 16–19 with focused tests. `origin/main` was verified at this commit after push. Order 15 was intentionally excluded; none of these SQL migrations was applied to Supabase by this release.

These commits are present in the **staging Git repository's remote `main`** as verified on 2026-10-21. This does not verify the separate Main Git repository or either Supabase database. Check database state independently before applying migrations.

### Current staging Git and remaining local changes

- `20261020174030_fix_participant_class_std_integer_cast.sql` and `20261020181313_team_chest_number_template.sql` were pushed to staging Git `main` in commit `4bedddd` (2026-10-21). The first keeps the participant-create RPC signature and casts `class_std` to the integer column type (blank becomes `NULL`). The second supplies the team/category numbering backend used by the Calendar and Chest Numbers UI. Neither migration's application to Staging or Main Supabase has been verified in this handoff; inspect each target before applying.
- Commit `fa0a535` pushed the default-grade-points update and Programs participant-view/deselect update to staging Git `main`. Scoring regression tests passed 17/17; focused SQL regression file was not run against a target database. Programs uses the existing `safe_unassign_registration` RPC; it retains the participant master row and blocks unlinking when protected check-in/attendance, code-letter, marks, result or other history exists. No Programs schema/API migration was added. No staging/Main database was changed or verified.
- Commit `fa0a535` also pushed the fixed-code-letter assignment/swap/draw implementation and its migrations 17–19. Isolated PostgreSQL contract tests passed 39 assertions including stale concurrent-writer rejection; UI/refresh tests passed. Full intended Supabase schema replay and real Realtime delivery remain unverified.
- Migration 13's audit-table qualification was pushed in `fa0a535` after static source review only; it has not been SQL-runtime-tested. Check the target `public.audit_logs` shape before applying it.
- The worktree still contains `.gitignore`, `package.json`, `package-lock.json`, `src/app/index.tsx`, and a **staged** change in `supabase/functions/notification-cron/index.ts` that adds a cron authorization header check. These are separate release decisions and were excluded from `fa0a535`; deploying the Edge Function would additionally require its `CRON_AUTH_KEY` secret and scheduler configuration, not a database migration. Do not assume these unrelated edits belong in the Main DB release.
- The older clone-parity SQL above is **held**, not an approved run step. Order 15's earlier typo migration also remains local and was intentionally excluded; order 16 is the corrected forward migration. Staging Git has orders 10–14 and 16–19; database application for orders 10–19 remains unverified. Do not use `git add .`; preserve unrelated/generated/untracked files.

### Next-day release sequence

1. Confirm the separate Main Git repository URL, target branch, Main Supabase project reference, and the intended release scope. Do not infer these from the staging repo/ref.
2. Orders 10–14 and 16–19 are present in staging Git `main`; orders 13 and 16–19 were pushed in `fa0a535`. Order 15 remains intentionally excluded. Review remaining local changes separately; keep held clone-parity and unrelated/generated files out unless separately approved.
3. Verify the staging Supabase schema/migration state read-only, then apply only missing migrations there and test. This release did not run orders 10–12 on Supabase; verify whether each is absent before applying. The user reports earlier SQL was applied to staging, so do not replay it blindly.
4. Review staging Git `main` against the separate Main Git branch. Transfer only approved commits/files; resolve divergence deliberately. Do not blindly merge/push the entire staging branch. The separate Main Git push has not been done/verified.
5. Before running SQL on Main, read-only inspect Main's migration ledger, `participants.class_std` type, tenant→root-organisation mapping, category range/regeneration functions, participant-create/transfer RPC signatures, seven legacy dataset-import RPC signatures, and registration/audit tables. SQL Editor runs may not be reflected in the migration ledger. Confirm the selected festival's participant counts and direct-child-team assignments; do not infer that every existing participant is already assigned to a valid team.
6. Apply only missing, schema-compatible migrations in timestamp order (orders 1–19 above), **after** staging testing, an approved data-backup/recovery plan, and a reviewed migration preview. Order 10 must precede 11; order 11 replaces the participant-create RPC. Before order 13, confirm the audit table/columns listed above. For grade points, do not apply the excluded order 15; order 16 requires order 14's boost-section schema and compatible scoring functions/triggers. Before code-letter orders 17–19, verify the target registration/schedule/PIN RPC schema and dependencies. Do not run a blanket `supabase db push` while the held clone-parity or 0-byte migration remains in the migration folder. Stop if any expected schema/function is absent or different; do not record success from an SQL Editor toast alone.
7. Do not change an existing festival to team mode or run **Regenerate All** as part of migration application. First record participant counts/team membership, ensure each team fits the configured range, agree on the renumbering window and downstream effects, and obtain explicit approval. After migration, the Calendar Save itself performs the atomic conversion; verify both category→team and team→category, capacity failure rollback, and concurrent participant creation on staging before any separate Main action.
8. Verify each result read-only and exercise focused app flows: participant create with blank/numeric class, gender modes, category-template numbering unchanged, team 1/2 range allocation and capacity, category→team→category switch with existing participants, 100→1000 range save, failed switch rollback for missing team and capacity, concurrent save/create, team transfer (including bulk/rollback) changing the current chest number, manual regeneration with existing participants, legacy JSON/CSV import rejection only in team mode, schedule import still working, scoring/grace/general-team flows, program assignment/completion, item activation/deactivation, organisation restore/archive. Check that newly generated candidate/result/certificate views read the current participant number; previously exported static files cannot update themselves. Record actual staging/Main refs, applied versions, dates, and outcomes below.
9. Keep Staging and Main Git/Supabase results recorded separately. Do not record a migration as applied based only on a successful SQL Editor toast or Git push.
