# Supabase Migration History Reconciliation Plan

**Review mode:** Strictly read-only  
**Review date:** 2026-08-03 (Asia/Calcutta)  
**Database project ref:** `szhwkngspodujiqzblab`  
**Overall finding:** the live database contains most effects of the unrecorded migrations, but the history cannot safely be repaired or advanced until drift at `008`, `047`, and `078`, the duplicate `082`, and the missing `090` are explicitly reconciled.

> **Post-review execution update (2026-08-03):** After this read-only review,
> the user explicitly authorized reconciliation and live deployment. A verified
> temporary backup was captured; duplicate `082` was normalized; history
> `007-082` was repaired without replay; migrations `090`, `093`, `094`, and
> `095` were transaction-tested and deployed. Real-token smoke testing then
> identified and corrected two migration-093 runtime defects in forward
> migration `096` (`mark_entries.updated_at` and ambiguous/invalid mark ordering).
> Current local/remote history is gapless from `001` through `096`. Sections below preserve the original
> pre-deployment evidence and decision record.

## 1. Repository State

- Current branch: `main`
- Current commit: `92dcb8fb42e2f4e1c9c95d3282ad24bd4a3b63bc`
- Migration files: 94
- Unique migration versions: 93
- Highest local migration: `093`
- Duplicate version: `082`
- Pre-review `git status --short` (all entries pre-existed this report):

```text
 M .env.example
 M src/app/judge/marks.tsx
 M src/lib/repositories/judgeRepository.ts
 M src/providers/database/DatabaseProvider.ts
 M src/providers/database/SupabaseDatabaseProvider.ts
 M src/services/judgeService.ts
?? GEMINI_093_JUDGE_MARK_SECURITY_CROSS_CHECK.md
?? GEMINI_SCHEDULE_VENUE_RESULT_ACCESS_ANALYSIS.md
?? OPEN_CODE_JUDGE_MARK_SECURITY_IMPLEMENTATION_REPORT.md
?? OPEN_CODE_TENANT_IMPORT_REVOKE_ANALYSIS.md
?? UPDATED_PROJECT_REVALIDATION_REPORT.md
?? check-db2.js
?? openapi.json
?? supabase/migrations/093_secure_token_bound_judge_marks.sql
```

- Pre-review `git diff --stat`:

```text
 .env.example                                            |  7 +++
 src/app/judge/marks.tsx                                 | 69 ++++++++++++++++++------
 src/lib/repositories/judgeRepository.ts                 | 15 ++++++
 src/providers/database/DatabaseProvider.ts              | 11 ++++
 src/providers/database/SupabaseDatabaseProvider.ts      | 55 +++++++++++++++++++
 src/services/judgeService.ts                            | 21 ++++++++
 6 files changed, 139 insertions(+), 39 deletions(-)
```

The untracked `093` is part of the observed input state, not a file created by this review. No pre-existing worktree change was modified.

## 2. Local Migration Inventory

Legend: `RA` = RECORDED AND APPLIED; `LU` = APPLIED LIVE BUT HISTORY MISSING; `DR` = APPLIED WITH DRIFT; `AM` = AMBIGUOUS; `NA` = NOT APPLIED.

| Version | Local file | Remote history | Preliminary status |
|---:|---|:---:|---|
| 001 | `001_initial_schema.sql` | Yes | RA |
| 002 | `002_auth_profiles.sql` | Yes | RA |
| 003 | `003_add_participant_fields.sql` | Yes | RA |
| 004 | `004_phase5_participant_management.sql` | Yes | RA |
| 005 | `005_category_age_logic.sql` | Yes | RA |
| 006 | `006_fix_category_trigger.sql` | Yes | RA |
| 007 | `007_flexible_hierarchy.sql` | No | LU |
| 008 | `008_superadmin_setup.sql` | No | DR |
| 009 | `009_tenant_management_funcs.sql` | No | LU |
| 010 | `010_tenant_revocation_func.sql` | No | LU |
| 011 | `011_multi_tenant_rls.sql` | No | LU |
| 012 | `012_cleanup_old_policies.sql` | No | LU |
| 013 | `013_hierarchical_orgs.sql` | No | LU |
| 014 | `014_fix_org_rls.sql` | No | LU |
| 015 | `015_add_rejection_reason.sql` | No | LU |
| 016 | `016_add_audit_fields.sql` | No | LU |
| 017 | `017_fix_items_upsert.sql` | No | LU |
| 018 | `018_phase5_judges_marks_results.sql` | No | LU |
| 019 | `019_judge_tokens.sql` | No | LU |
| 020 | `020_complete_judge_system.sql` | No | LU |
| 021 | `021_generate_judge_token_rpc.sql` | No | LU |
| 022 | `022_scoring_rules.sql` | No | LU (superseded seed) |
| 023 | `023_expanded_points_config.sql` | No | LU |
| 024 | `024_validate_judge_token_rpc.sql` | No | LU |
| 025 | `025_public_leaderboard_rpc.sql` | No | LU |
| 026 | `026_r2_storage_metadata.sql` | No | LU |
| 027 | `027_judge_count_extension.sql` | No | LU |
| 028 | `028_judge_portal_rls_bypass.sql` | No | LU |
| 029 | `029_hybrid_participant_management.sql` | No | LU |
| 030 | `030_fix_judge_portal_hybrid.sql` | No | LU |
| 031 | `031_leaderboard_settings.sql` | No | LU |
| 032 | `032_enforce_leaderboard_visibility.sql` | No | LU |
| 033 | `033_generated_posters.sql` | No | LU |
| 034 | `034_result_visibility.sql` | No | LU |
| 035 | `035_combined_run.sql` | No | LU |
| 036 | `036_leaderboard_dedup.sql` | No | LU |
| 037 | `037_fix_published_status_backfill.sql` | No | LU |
| 038 | `038_get_festival_results_hierarchy.sql` | No | LU |
| 039 | `039_complete_leaderboard_fix.sql` | No | LU |
| 040 | `040_public_leaderboard_edge_cases.sql` | No | LU |
| 041 | `041_backfill_published_at.sql` | No | LU |
| 042 | `042_emergency_republish.sql` | No | LU |
| 043 | `043_public_published_results.sql` | No | LU |
| 044 | `044_public_individual_rankings_visibility.sql` | No | LU |
| 045 | `045_leaderboard_settings_admin_policy.sql` | No | LU |
| 046 | `046_result_workflow_public_visibility_split.sql` | No | LU |
| 047 | `047_backfill_public_visible_for_public_festivals.sql` | No | DR |
| 048 | `048_admin_leaderboard_internal_results.sql` | No | LU |
| 049 | `049_admin_festival_results_internal_published.sql` | No | LU |
| 050 | `050_candidate_profiles.sql` | No | LU |
| 051 | `051_poster_studio.sql` | No | LU |
| 052 | `052_sahityotsav_2026_event_names.sql` | No | LU |
| 053 | `053_public_result_no.sql` | No | LU |
| 054 | `054_media_center_assets.sql` | No | LU |
| 055 | `055_generated_assets_event_name.sql` | No | LU |
| 056 | `056_participant_unit_audit_logs.sql` | No | LU |
| 057 | `057_filter_rejected_registrations.sql` | No | LU |
| 058 | `058_junior_dataset_import.sql` | No | LU |
| 059 | `059_senior_dataset_import.sql` | No | LU |
| 060 | `060_schedule_import_unique_slot.sql` | No | LU |
| 061 | `061_execute_schedule_import.sql` | No | LU |
| 062 | `062_production_safety_patch.sql` | No | LU |
| 063 | `063_production_audit_views.sql` | No | LU |
| 064 | `064_official_participant_bracket.sql` | No | LU |
| 065 | `065_fix_public_leaderboard_visibility.sql` | No | LU |
| 066 | `066_public_items_policy.sql` | No | LU |
| 067 | `067_public_ai_views.sql` | No | LU |
| 068 | `068_public_registrations_policy.sql` | No | LU |
| 069 | `069_add_team_point_status.sql` | No | LU |
| 070 | `070_upper_primary_dataset_import.sql` | No | LU |
| 071 | `071_multi_category_dataset_import.sql` | No | LU |
| 072 | `072_general_category_import.sql` | No | LU |
| 073 | `073_remove_participants_name_org_constraint.sql` | No | LU |
| 074 | `074_public_unit_profile.sql` | No | LU |
| 075 | `075_communication_center.sql` | No | LU |
| 076 | `076_add_scoring_rules_guidelines.sql` | No | LU |
| 077 | `077_seed_scoring_rules.sql` | No | LU |
| 078 | `078_token_revocation_schema.sql` | No | DR |
| 079 | `079_schedule_festival_reconciliation.sql` | No | LU |
| 080 | `080_composite_boundary_constraints.sql` | No | LU |
| 081 | `081_judge_login_workflow.sql` | No | LU |
| 082 | `082_judge_token_regeneration.sql` | No | AM |
| 082 | `082_update_generate_token_rpc.sql` | No | AM |
| 083 | `083_normalize_judge_assignments.sql` | Yes | RA |
| 084 | `084_secure_judge_workflow_and_audit.sql` | Yes | RA |
| 085 | `085_reconcile_judge_activity_log_schema.sql` | Yes | RA |
| 086 | `086_force_remove_submitted_judge.sql` | Yes | RA |
| 087 | `087_fix_judge_registration_hierarchy.sql` | Yes | RA |
| 088 | `088_backfill_schedule_festivals.sql` | Yes | RA |
| 089 | `089_safe_festival_year_sync.sql` | Yes | RA |
| 090 | `090_flexible_points_system.sql` | No | NA |
| 091 | `091_dual_mode_mark_entry.sql` | Yes | RA |
| 092 | `092_harden_mark_entry_validation.sql` | Yes | RA |
| 093 | `093_secure_token_bound_judge_marks.sql` | No | NA |

## 3. Remote Migration History

The remote database was identified and queried using a direct database connection. Every catalog/data query was enclosed in `BEGIN READ ONLY` and ended with `ROLLBACK`. `supabase migration list --db-url` was also used only for listing.

Remote `supabase_migrations.schema_migrations` contains 15 versions:

```text
001 002 003 004 005 006 083 084 085 086 087 088 089 091 092
```

No remote-only migration version was found.

## 4. Local/Remote Difference

- Local files only: versions `007-082`, `090`, and `093`.
- Because version `082` has two files, this is 79 local files but 78 unique missing-history versions.
- Remote only: none.
- Recorded and applied: `001-006`, `083-089`, `091-092`.
- History order is already non-contiguous: recorded `091-092` exist after genuinely absent `090`.
- The CLI reports both `082` files with the same local version key. Migration history is keyed by version, so it has no independent slot for both files.

## 5. Duplicate 082 Analysis

1. Both files share version `082` and have different SHA-256 hashes:
   - `082_judge_token_regeneration.sql`: `958A3F70508C96A8A923AE9050F8A0E554EDEF56C72DAD3D2D08F9F287878738`
   - `082_update_generate_token_rpc.sql`: `A799DB8E13312B9AE656284B625A703E80063B111105390BB22F61EA21EA5AA1`
2. Remote history has no `082` row, so neither is represented there.
3. The files are behaviorally incompatible. The first uses token hashing/revocation semantics and grants `authenticated, anon`; the second drops an older overload and uses `is_used` regeneration semantics with a different required/default argument shape.
4. The live five-argument `generate_judge_token(uuid,uuid,uuid,uuid,boolean)` body matches the later recorded `083` canonical implementation, not either `082` body. Because `083` overwrites the body, live state cannot prove whether the first `082`, the second `082`, both sequentially, or a direct SQL equivalent ran earlier. The live explicit `anon` grant is consistent with the first `082`, but it is not proof of execution because grants can be direct and `083` revoked only `PUBLIC`, not role-specific `anon`.
5. One `migration repair 082 --status applied` row cannot truthfully identify two distinct files. Repairing it now would conceal the collision.
6. A separate, reviewed repository-history normalization plus a forward-only canonicalization is required. Neither old `082` body should be executed against this live database.

**Verdict: BLOCKING MIGRATION-HISTORY AMBIGUITY.**

## 6. Live Schema/Object Comparison

Live catalog totals were 49 public tables, 88 public functions, 184 policies, 6 views, and 94 indexes. The following table records every missing-history version. “Match” means cumulative live state contains the meaningful durable effect; superseded RPCs are matched against their later intended definition.

| Migration | Expected objects/effects | Live result | Object match |
|---:|---|---|:---:|
| 007 | Flexible organisation hierarchy, participant/registration hierarchy fields, RLS/indexes | Hierarchy tables/columns and policies present | Yes |
| 008 | `profiles.is_superadmin`; bootstrap auth user, email identity, superadmin profile | Column, one target auth user, one linked email identity, and profile exist; exact identity provider key differs from literal old SQL | Drift |
| 009 | Tenant setup RPC | Expected setup RPC/signatures present (including later overload) | Yes |
| 010 | Tenant revocation RPC | `revoke_tenant_access` present | Yes |
| 011 | Tenant helpers and multi-tenant RLS | Helpers and tenant policies present; later policies supersede definitions | Yes |
| 012 | Remove obsolete policies | Obsolete policy set absent; cumulative policy set present | Yes |
| 013 | Child-organisation setup/hierarchy | Organisation hierarchy and setup overloads present | Yes |
| 014 | Organisation RLS correction, `get_my_org_id` | Helper and corrected cumulative policies present | Yes |
| 015 | Registration rejection reason | Column present | Yes |
| 016 | Audit columns/update triggers | Audit fields and update triggers present | Yes |
| 017 | Item upsert uniqueness/policies | Constraint/policy effects present | Yes |
| 018 | Judges, marks, results, constraints/RLS | Core tables and cumulative constraints/RLS present | Yes |
| 019 | Judge tokens, index/RLS | Table and token indexes/policies present | Yes |
| 020 | Complete judge workflow objects | Judge/mark/result workflow objects present | Yes |
| 021 | Judge token generator RPC | Function exists; intentionally superseded through 082/083 | Yes, superseded |
| 022 | Recreate/seed scoring tables | Tables exist; initial seed intentionally superseded by exact 077 seed | Yes, superseded |
| 023 | Expanded points configuration fields | Legacy/expanded points fields through 023 present | Yes |
| 024 | Token validation RPC | `validate_judge_token(text)` present, later hardened | Yes, superseded |
| 025 | Public leaderboard RPC | RPC present, later replaced | Yes, superseded |
| 026 | File metadata | Table/metadata objects present | Yes |
| 027 | Expected judge count/readiness helpers | Column, view/functions present | Yes |
| 028 | Judge portal access policy/grant changes | Cumulative judge portal access exists; later migrations tighten workflow | Yes, superseded |
| 029 | Hybrid participant/organisation management | Expected helpers/policies present | Yes |
| 030 | Judge registration hierarchy RPC | UUID RPC present, later replaced | Yes, superseded |
| 031 | Leaderboard settings/poster templates | Tables/settings functions present | Yes |
| 032 | Visibility enforcement RPC | Current visibility functions enforce later cumulative logic | Yes, superseded |
| 033 | Generated posters | Table/index/policies present | Yes |
| 034 | Result visibility fields/backfill/RPCs | Columns/RPCs present; published flag/status mismatch count is 0 | Yes |
| 035 | Festival/org/result backfills and RPCs | Festival/org links present; schedule-item festival gap/mismatch both 0 | Yes |
| 036 | Leaderboard deduplication function | Cumulative function present/superseded | Yes |
| 037 | Published status backfill and unique result constraint | Constraint present; status mismatch count 0 | Yes |
| 038 | Hierarchical festival results RPC | RPC present, later replaced | Yes, superseded |
| 039 | Complete leaderboard RPC fixes | Current RPCs contain later cumulative behavior | Yes, superseded |
| 040 | Public leaderboard edge cases | Current public RPC includes later behavior | Yes, superseded |
| 041 | `published_at` and hidden-row backfill | Missing published timestamp and hidden-but-published counts are 0 | Yes |
| 042 | Republish published-status rows | Published-status/flag mismatch count is 0 | Yes |
| 043 | Public published-results RPC | RPC present, later replaced | Yes, superseded |
| 044 | Individual ranking visibility setting/RPC | Setting/function effects present | Yes |
| 045 | Admin leaderboard settings policy | Cumulative admin policy present | Yes |
| 046 | Workflow/public visibility split | Columns/policies/RPC behavior present | Yes |
| 047 | Backfill `public_visible` for public festivals | 52 currently eligible published results remain `public_visible=false` | Drift |
| 048 | Internal admin leaderboard RPC | `get_admin_leaderboard` present | Yes |
| 049 | Internal published-results RPC | `get_admin_published_results` present | Yes |
| 050 | Candidate public-profile fields/slug/RPC | Fields/functions/trigger present; 0 missing and 0 duplicate slugs | Yes |
| 051 | Poster Studio objects | Tables/policies/functions present | Yes |
| 052 | 207 event-name mappings | All 207 codes present and all 207 English names match exactly | Yes |
| 053 | Public result number, sequence/triggers/RPCs | Column/sequence/functions present; 0 visible rows missing number, 0 duplicates | Yes |
| 054 | Media center objects | Media tables/policies present | Yes |
| 055 | Generated asset event name | Column present | Yes |
| 056 | Participant/unit audit objects | Audit tables/functions/indexes present | Yes |
| 057 | Rejected registration cleanup and filtered RPCs | 0 rejected rows retain a code letter; RPCs present/later superseded | Yes |
| 058 | Import sessions and junior import RPC | Objects/function present | Yes |
| 059 | Senior import RPC | Function present | Yes |
| 060 | Unique schedule slot | Constraint/index present | Yes |
| 061 | Schedule import RPC | Function present | Yes |
| 062 | Production safety indexes | Expected indexes present | Yes |
| 063 | Production audit views | Views present | Yes |
| 064 | Official participant bracket | Schedule field present | Yes |
| 065 | Public leaderboard visibility fix | Current RPC includes later logic | Yes, superseded |
| 066 | Public items policy | Policy present | Yes |
| 067 | Public AI views | Views present | Yes |
| 068 | Public registrations policy | Policy present | Yes |
| 069 | Team point status | Column present | Yes |
| 070 | Upper-primary import RPC | Function present | Yes |
| 071 | Multi-category import RPCs | Category import functions present | Yes |
| 072 | General category/import fields | Fields/functions present | Yes |
| 073 | Remove participant name/organisation constraint | Old constraint absent | Yes |
| 074 | Public unit profile RPC | `get_public_unit_profile` present | Yes |
| 075 | Communication center | Tables/triggers/functions present | Yes |
| 076 | Scoring guidelines | `guidelines` column present | Yes |
| 077 | Destructive global scoring-rule reseed | Exact match: 71/71 rules and 282/282 criteria; no extras | Yes |
| 078 | Token hash/revocation schema, backfill, dangling-token repair, validation RPC | Schema/function/index and hash backfill match; 4 dangling schedule references currently remain | Drift |
| 079 | Schedule/festival reconciliation and constraints | Composite constraints present; schedule-item festival gap/mismatch both 0 | Yes |
| 080 | Composite tenant-boundary constraints | Expected composite constraints present | Yes |
| 081 | Judge login workflow status/policy | Status fields/workflow objects present; later hardened | Yes |
| 082 | Two conflicting token-generator definitions under one version | Live body is later 083; earlier execution sequence cannot be proven | Ambiguous |
| 090 | Flexible/versioned points system | `points_config_versions`, snapshot/version columns, functions and triggers absent | No |
| 093 | Token-bound judge marks security | `mark_entries.token_id`, text registration RPC, `upsert_judge_mark`, hardened policies/grants absent | No |

Additional checks:

- `090`-specific objects absent: `points_config_versions`; version/snapshot fields on `points_config`, `results`, and `schedules`; `calculate_festival_points`; snapshot/enforcement functions/triggers.
- `091-092` effects present: dual-mode snapshot columns and all four mark validation checks plus `validate_mark_entry_scoring_trigger`.
- `093`-specific effects absent. Current `mark_entries` still grants broad direct privileges to `anon`, and anonymous insert/update policies still use unconditional checks. This is a live security gap, not evidence that `093` partly ran.

## 7. Data and Backfill Risks

| Migration(s) | Data/auth operation | Rerun risk | Direction |
|---|---|---|---|
| 008 | Deletes/recreates a fixed auth account and embeds a bootstrap credential | Account replacement, identity breakage, credential reset | Never rerun; rotate/remove bootstrap secret through an approved secure process |
| 022 | Drops scoring tables with `CASCADE` and reseeds | Data loss, broken dependencies | Never rerun |
| 034-035, 037, 041-042 | Result publication/status/timestamp backfills | Rewrites current result workflow state | Repair history only after approval; do not rerun |
| 047 | Makes eligible results public | 52 rows would change public exposure | Business decision and forward-only targeted migration required |
| 050 | Candidate slug backfill | Could change public URLs | Do not rerun; current invariant matches |
| 052 | Updates 207 item names | Overwrites later editorial changes | Do not rerun; exact current match is already proven |
| 053 | Assigns public result numbers | Public identifier churn/sequence effects | Do not rerun; current invariants match |
| 056 | Audit backfills/functions | Duplicate/change audit semantics | Do not rerun old migration |
| 057 | Clears rejected code letters | Modifies registration workflow data | Do not rerun; invariant currently matches |
| 058-061, 070-072 | Import/session execution functions | Functions contain insert/update behavior when invoked; migration itself establishes machinery | Repair object history; do not invoke during reconciliation |
| 077 | Deletes all global rules and recreates 71 rules/282 criteria | New IDs, broken rule references, destructive replacement | Never rerun; exact data match supports history repair only |
| 078 | Hash and dangling-token repair | Alters/revokes access tokens | Forward-only targeted repair for the 4 current dangling references |
| 079, 083-089 | Festival/assignment/audit/year backfills | Could alter schedules, judge access, or audit state | Recorded/current; never replay |
| 090 | Creates first points configuration version and snapshots | New configuration rows/triggers; must be clone-tested against populated data and recorded 091-092 | Apply once only after blockers and backup |
| 093 | Adds token-bound mark security and rewrites grants/policies | Can block judge marking if token/backfill assumptions fail | Do not apply until history, 090, and preflight are complete |

## 8. Applied-Live-but-Unrecorded Migrations

Qualified by cumulative live-object and invariant comparison:

```text
007
009-046
048-077
079-081
```

These are evidence-based history-repair candidates only. They must not be repaired out of context while `008`, `047`, `078`, and `082` remain unresolved. Superseded functions do not justify replaying old definitions.

## 9. Truly Missing Migrations

- `090_flexible_points_system.sql` — NOT APPLIED. All defining table/column/function/trigger effects are absent.
- `093_secure_token_bound_judge_marks.sql` — NOT APPLIED. All distinctive token-binding and policy/grant effects are absent.

Dependencies are **not yet safe** merely because these migrations are absent: `090` sits before already-recorded `091-092`, and `093` sits after an unresolved duplicate history plus current drift.

## 10. Partially Applied Migrations

No migration was classified `PARTIALLY APPLIED` after the targeted checks. Apparent partial candidates resolved as either cumulative matches, explicit drift, or complete absence.

## 11. Drifted Migrations

- `008` — semantic user/profile/identity effects exist, but the exact old auth identity representation differs. The file is destructive and contains a plaintext bootstrap credential; replay is prohibited.
- `047` — 52 rows currently satisfy the migration predicate except for `public_visible=false`. This could be later intentional state, so no automatic exposure is safe.
- `078` — schema, hashes, function and index exist, but 4 tokens currently reference missing schedules. They may post-date the original backfill; current state nevertheless violates its repair invariant.

`082` is not “drift”; it is an unresolvable duplicate-version ambiguity.

## 12. Remote Direct Changes

Remote objects not named anywhere in local migration SQL include:

```text
judge_session_status
page_audit_logs
page_snapshots
stage_tokens
system_api_keys
system_pages
tenant_terminology
```

The live function inventory also includes page registry, stage portal, system API/terminology, and bulk unit-assignment functions not represented by the numbered migration history. This proves that the remote database has direct or otherwise untracked schema changes.

A schema-only remote dump/diff is required, but it must be produced in a clean copied workspace or temporary branch, never pulled into this dirty active repository. Review and redact secrets/security-definer bodies before any merge. Do not use the dump as an automatic source of truth.

## 13. Migration Repair Candidates

After the drift and duplicate gates are resolved, the following versions may be candidates for `--status applied` because their cumulative meaningful effects match:

```text
007
009-046
048-077
079-081
```

Important gates:

1. `007` is the only candidate before the first blocker (`008`).
2. Do not mark later versions merely to silence the CLI.
3. Generate and retain a pre-repair history export and object-evidence checklist.
4. Repair one reviewed version/bounded batch at a time, re-listing history after each batch.
5. `008`, `047`, `078`, and `082` are not repair candidates in their present state.

## 14. Migrations That Must Not Be Rerun

- Every version already recorded remotely: `001-006`, `083-089`, `091-092`.
- Every applied-live unrecorded version: `007`, `009-046`, `048-077`, `079-081`.
- Drifted old migrations: `008`, `047`, `078`.
- Both conflicting `082` files.
- Especially destructive/data-bearing: `008`, `022`, `034-035`, `037`, `041-042`, `047`, `050`, `052-053`, `056-057`, `077-089`.

`090` and `093` are not reruns: they are genuinely absent. They still must not be applied now.

## 15. Required Forward Reconciliation

A future, separately authorized change must:

1. **008:** preserve the current auth user; verify login through supported Auth APIs; remove/rotate the embedded bootstrap credential; canonicalize identity semantics without deleting/recreating the user.
2. **047:** obtain a product-owner decision for the 52 rows. Either document their non-public state as intentional or publish only an explicitly approved ID set in a forward migration.
3. **078:** revoke/quarantine the 4 dangling tokens with retained provenance (`original_schedule_id`, timestamp, actor/reason) rather than replaying the blanket old SQL.
4. **082:** normalize repository history so every executable migration has one unique version. Preserve both original hashes in an audit note; retain one unambiguous historical `082` identity or adopt a reviewed baseline/squash policy; represent the desired current token generator in a new forward-only canonical migration. Do not execute either old body.
5. **Remote-only objects:** create reviewed forward migrations that capture accepted direct objects, grants, policies and functions—or explicitly retire them. Do not blindly import a dump.
6. **Security:** explicitly review/remove the lingering role-specific anonymous grants where not required. A `REVOKE ... FROM PUBLIC` does not revoke an earlier direct grant to `anon`.

## 16. Exact Safe Ordered Plan Through 093

This is a gated plan; none of it was executed.

1. Freeze schema/data deployment. Obtain an owner-approved maintenance window.
2. Create a verified database backup plus a separate migration-history export. Restore the backup to an isolated test project and prove rollback.
3. In a copied workspace or clean temporary branch, produce a schema-only remote dump/diff. Inventory and review all remote-only objects, SECURITY DEFINER functions, RLS, ACLs, triggers and extensions.
4. Resolve `008`, `047`, and `078` through approved forward-only reconciliation decisions. Clone-test with production-shaped data and re-run the count-only invariants.
5. Resolve the duplicate `082` in repository history. Stop unless the migration directory has exactly one unambiguous executable identity per version and the normalization records both original hashes. Do not mark `082` applied while two files claim it.
6. Re-run local/remote migration listing and full schema/object comparison. The expected live state through `089` must be documented and reproducible.
7. Repair only the proven history candidates in order/bounded batches: `007`; then, after the `008` decision is formally represented, `009-046`; after the `047` decision, `048-077`; after the `078` decision, `079-081`; finally the normalized `082`. Re-list and verify after every gate. Do not use `--include-all`.
8. Clone-test `090_flexible_points_system.sql` against the reconciled schema. Validate its initial version snapshot, constraints, points calculations, triggers, and compatibility with the already-live `091-092` objects.
9. In the authorized maintenance window, apply `090` once in a single controlled transaction using the reviewed SQL, verify every `090` effect and data invariant, then record only `090` as applied. Do not use a blanket push to backfill it.
10. Re-verify the recorded/live effects of `091` and `092`; do not replay them.
11. Review the currently untracked `093` as a release artifact. On the restored clone, verify token ownership, assignment checks, mark backfill assumptions, anon/authenticated ACLs, RLS, both registration RPC overloads, and rollback.
12. Only after all prior gates pass, deploy `093` alone by the normal migration mechanism (without `--include-all`), then verify `mark_entries.token_id`, foreign keys, `upsert_judge_mark`, RPC signatures/bodies, policies, grants, and judge-portal end-to-end marking.
13. Re-export migration history and schema fingerprints; compare them to the approved manifest; monitor auth, judge login, mark writes, result publication and points calculation.

Any failed gate stops the sequence. There is no safe command sequence today that jumps directly to `093`.

## 17. Commands That Must Not Be Run

```text
supabase db push --include-all
supabase migration up --include-all
supabase db reset
supabase db pull                 # in this active dirty repository
supabase migration repair 082 --status applied   # while duplicate 082 exists
```

Also prohibited now: any `db push`, `migration up`, application of `090`/`093`, history insert/update, migration repair, or direct DDL/DML. Never commit a Supabase access token. If account-level CLI auth is later required, use `supabase login` or a temporary process-level environment variable.

## 18. Backup and Recovery Requirements

- Capture a provider backup/PITR point immediately before any future reconciliation.
- Export `supabase_migrations.schema_migrations` separately and checksum it.
- Capture schema-only definitions, role grants, RLS/policies, triggers, extensions and function bodies.
- Record count/hash invariants for scoring rules, results, tokens, schedules, assignments and mark entries without exporting secrets.
- Restore to a separate test project and run the complete ordered plan there first.
- Define rollback per step. History repair rollback is not a substitute for restoring schema/data.
- Keep auth credentials, raw judge tokens, service keys and connection strings out of reports and repository files.

## 19. Final Safety Verdict

```text
SAFE ONLY AFTER SPECIFIC RECONCILIATION
UNSAFE TO USE INCLUDE-ALL
BLOCKED BY DUPLICATE MIGRATION AMBIGUITY
BLOCKED BY PARTIAL/DRIFTED SCHEMA
```

- Can `093` be deployed now? **NO**.
- Can `--include-all` be used? **NO**.
- The first blocking version is `008`; the hard migration-history blocker is duplicate `082`; the first genuinely absent prerequisite is `090`.

## 20. Confirmation of No Changes

This review used repository reads, `git` read commands, migration listing, and database transactions explicitly set to read-only and rolled back. No migration was applied; no schema, migration-history, auth, grant, policy, function, or application-data change was made. No source or migration file was modified. The only repository file created by this task is this report.

READ-ONLY MIGRATION RECONCILIATION COMPLETED — NO DATABASE CHANGES PERFORMED
