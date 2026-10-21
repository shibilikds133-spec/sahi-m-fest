# Points and Grace Marks — Implementation Plan

Status: LOCAL IMPLEMENTATION COMPLETE; PRODUCTION RELEASE GATED. Scope: the main repository checkout. Remote database writes, commits, pushes and production deployment are not part of this implementation run. Evidence and release blockers: `POINTS_AND_GRACE_IMPLEMENTATION_REPORT.md`.

## Confirmed requirements

- Competition identity is one item ID and one category, scoped to its festival/tenant. Bulk category selection creates separate competitions.
- Preserve the existing baseline scoring behaviour and saved values. Remove numerical scoring fallbacks; never manufacture missing rules.
- Reuse the baseline participant/group-size bracket ranges for boosted grade values.
- Points Configuration owns baseline, configurable grade percentages, grade boost values/item membership, rank boost values/item membership, and grace field definitions.
- Exactly four effective item profiles: baseline, grade boost, rank boost, both. Both composes the two components; it is not another configuration or an extra addition of baseline points.
- Grace field definitions start empty. An admin supplies a name and maximum for every field. No seeded field names, maximums or awarded marks.
- Reuse the existing Grace Marks route. Draft entries are separate from final totals. All Submit publishes one complete matrix of participating teams and configured fields atomically. Its enablement uses actual team records, never a fixed count.
- Preserve judge token/QR access, final submission locks, and tenant-authorized administrator reset/reopen rules. Scoring changes must not broaden reset or mark-write authority.
- Published competition awards remain tied to the exact configuration/calculation snapshot. Configuration editing alone must not rewrite old awards.
- Preserve integer point awards used by the existing system. Grade percentage thresholds may be decimal percentages. Missing input is not an implicit zero.

## Verified repository impact

Runtime numerical defaults exist in `flexiblePointsEngine.ts`, `pointCalculator.ts`, and mark maximum resolution. SQL rank fallbacks exist in migration 169. Migration 090 snapshots configuration but accepts a null result snapshot and does not verify the actual scoring formula. Publishing currently calculates each result separately, then writes browser-composed result rows, and separately updates the schedule bracket. Individual rankings choose the highest points when duplicate candidates exist. Grace marks currently write directly to the totals source.

The item schema permits category arrays, but the current handbook catalog already uses single-category item rows. Runtime multi-category counts and ambiguous historical references must be measured, not presumed.

## Tasks and completion evidence

- [x] T01 — Record final requirements, impact boundary, and task sequence in this plan.
- [x] T02 — Inspect local schema/runtime and record pre-existing checks; identify admin ownership checks, team source, result publication paths, and immutable judge-lock functions. Existing reset authorization gap is a separate release blocker, not a verified secure invariant.
- [x] T03 — Implement explicit, validated points contracts and shared bracket boost composition; remove live numerical fallbacks and unused parallel scoring paths.
- [x] T04 — Add versioned database configuration/assignment/grace-field storage and atomic save. Enforce item/festival ownership and admin-only writes. Drop active column score defaults through a new migration, preserving migration history and existing configured data. Rehearsed locally only.
- [x] T05 — Implement one authoritative database scoring function, batch preview and transactional publish. Pin expected config versions, validate inputs and snapshots, prevent forged direct awards and duplicate publications. Preserve historical visibility edits; newly publishing unsealed legacy drafts requires reviewed republish.
- [x] T06 — Update Points Configuration UI with editable baseline/thresholds, grade/rank boost values and competition lists, and dynamic grace definitions. Preserve existing tokens/components and responsive layout.
- [x] T07 — Replace Grace Marks UI/service with team/field draft entry, configured maximum validation, completeness checks and atomic All Submit. Only submitted snapshots update the existing totals source; drafts never do.
- [x] T08 — Route judge/admin grade previews through authorized, versioned config context; use recorded/configured mark maxima. Preserve final-submit/reset/token logic and grants; patch only numerical maximum defaults/validation. Full target reset security remains unverified and release-gated.
- [x] T09 — Implement safe category expansion for new item creation, reject ambiguous scoring identities, and produce a read-only preflight for historical records instead of guessing relationships. Target data review remains pending.
- [x] T10 — Verify downstream stored-award consumption, reduced republishing, unchanged group aggregation and targeted cache invalidation. Test grace-only team totals in admin/public 166 and preview 174; newer public 172 runtime needs target-shaped verification.
- [x] T11 — Run focused scoring/SQL/tenant/concurrency/lock regression checks and web/type/lint checks; distinguish pre-existing failures. Nine engine tests, SQL/real-role concurrency and five browser widths passed; full-project typecheck is blocked by other diagnostics.
- [x] T12 — Update verified Data/API Flow, regression map, and handover notes; record limitations and exact deployment/migration prerequisites in the implementation report.

## Proposed data and API design

Extend the single `points_config` row per tenant/festival. Keep baseline grade thresholds and bracket ranges, add grade boost point values keyed by the same bracket keys, rank boost values, and item membership lists. Include grace field IDs/names/maxima in the same versioned configuration snapshot. A validated config-save RPC performs optimistic version checking and saves the complete snapshot in one transaction.

Keep `results.points_awarded` and existing result output shapes as the downstream contract. A schedule-scoped calculation RPC resolves the real item and memberships, then applies grade/rank components and existing configured minimum-team rules. Transactional publishing calls that same calculation, snapshots inputs/configuration, and writes results and the schedule bracket together. Browser-supplied total points are never authoritative. Existing direct result-write paths are validated at the database boundary as well.

Grace drafts and submissions use separate tables from `grace_marks`. Draft rows have no leaderboard effect. All Submit locks the configuration and relevant draft rows, validates every actual participating team and field, records an immutable submission snapshot, and replaces final grace totals in the existing `grace_marks` contract atomically. Configuration changes cannot publish drafts or silently reinterpret an earlier submitted total.

Judge previews receive only the scoring context authorized by their existing token; raw marks can be retained while incomplete configuration blocks grade/point publication. Existing judge token/finalization and admin reset logic is not rewritten. Only installed mark maximum defaults/restrictions are narrowly patched, preserving their authorization/lock code.

## Verification and migration gates

- Compare baseline calculations using stored configurations before/after; never populate missing settings from old code constants.
- Exercise four profiles, distinct category identities, bracket boundaries, threshold boundaries, zero versus missing values, minimum-team rules, incomplete configs and denied cross-tenant requests.
- Verify draft grace has no effect; incomplete matrices cannot publish; valid zero is explicit; submitted totals are exact sums; repeat submit cannot double-add; configured maximum changes invalidate stale drafts.
- Verify expected-version conflicts, publish retries, rollback on one invalid result, immutable snapshots, and downward point corrections.
- Verify judge token finalization cannot be repeated or reset by a judge; compare protected function definitions/privileges before and after.
- Use an isolated local database for migration rehearsal. Do not reset the user's database or apply changes remotely.
- Historical multi-category rows or marks without a valid maximum need an explicit mapping/review report; no automatic rewrite of ambiguous records.
- Applied migrations retain historical constants; final current schema/runtime cannot use these as scoring defaults. New configurations require explicit values.

## Work log

- Plan created from the confirmed conversation and inspected repository. Implementation and verification results will be appended as tasks complete.
- Local implementation and isolated rehearsal completed. Shared ranges drive the four derived profiles; no numerical scoring defaults were seeded.
- Added immutable previous-row snapshots for result republishing and final grace replacement. Removed judges are excluded from the authoritative calculation, matching the existing read path.
- Updated grace-only leaderboard coverage without changing visibility/item-limit gates. Replaced highest-award duplicate selection with newest-publication selection.
- Browser clipping found at narrow widths and fixed within the changed screens; existing shared form components were not redesigned.
- Production preflight, baseline equivalence, current reset RPC authorization and latest public item-limit runtime remain release gates. See the report for evidence, exact files and repeatable tests.
