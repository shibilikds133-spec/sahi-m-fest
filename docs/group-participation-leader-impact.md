# Group participation and leader identity

Local implementation, 2026-10-22. Database deployment is not verified. This document
describes the code and migration; it does not claim a staging or production rollout.

## Confirmed decisions

- General is a category. Individual/group comes from `items.participation_type`.
- A new group has one registration and a roster. Its first selected member is its
  check-in leader. No new group chest number is allocated.
- The leader uses their existing participant chest number and participant QR.
- Removing the persisted leader requires explicitly selecting a replacement at Save.
- Existing General entries retain their legacy number until an admin selects a
  leader in Edit members. Original printed numbers remain stored as history.
- Old non-General registrations, marks and results are preserved. Conflicting or
  legacy registrations are reported instead of being combined automatically.
- Existing points formulas/configuration remain in use. Group registrations keep
  `participant_id=NULL`, so the representative does not receive individual points.
- Configured group member count is descriptive; at least one eligible member is
  needed to identify a group. It is not an exact-size creation/scheduling gate.

## Impact map and compatibility

| Area | Change / preserved contract |
| --- | --- |
| Admin Programs | Individual and Group tabs, including General in either type; legacy assignments stay visible for review |
| Team Leader portal | Group eligibility extends beyond General; first selection is the group leader |
| Enrollment from participant page | Group items use the same group creation RPC, starting with that participant as leader |
| Group roster editor | All group categories; explicit leader selection; concurrent member/leader changes reject stale saves |
| Schedule / check-in / code letters | Existing scoped reads resolve the leader's display identity; the registration ID and code-letter APIs stay unchanged |
| QR / chest cards | Leader ID/profile slug and existing chest identify the group; other members' QR cannot check in that group |
| Candidate profile / category search | Group membership is separate from General category; existing published-result visibility rules remain |
| Unit-assignment filter / recent entries / announcer | Roster membership is included in item filtering and representative names are resolved through the leader relation |
| Points / results | Existing registration/result identity, formulas, awarded values and publication records remain |
| Legacy imports | Existing import formats remain legacy records; they are not silently converted or re-scored |
| Program completion | Legacy group completion is read until a current group status exists; subsequent completion updates follow participation type |

The stored `general_team` entry-kind string, existing route name
`participants/general-entries`, and old RPC names remain for compatibility. Their
new group creation behavior follows participation type. The hidden route continues
to support Programs -> Edit members; no new duplicate navigation is introduced.

The new FK to participants creates a second relationship from registrations.
Existing participant embeds explicitly select `registrations_participant_id_fkey`;
the leader embed explicitly selects `registrations_group_leader_participant_id_fkey`.

## Data and API flow

Programs / portal selection -> ordered participant IDs -> existing create RPC ->
server resolves admin or portal assignment, festival and team -> validates roster
category/gender/ownership -> team/item lock + duplicate guard -> one group registration
with `group_leader_participant_id` and ordered member links -> existing query caches
are invalidated. The database is the source of truth.

Edit members -> member IDs + expected IDs + explicit leader + expected leader ->
`update_group_team_roster` -> row lock, tenant/team checks and stale-save validation ->
atomic membership/leader update + audit -> affected profiles, schedule and roster
queries refresh. Marks, results, code letters and participant chest numbers are not
rewritten by this RPC.

| Call | Classification | Reason |
| --- | --- | --- |
| Items, participants, visible organisations, festival registrations | REQUIRED | Eligibility, assigned members and legacy visibility |
| Group entries list | CONDITIONAL | Group tab / roster / group cards |
| Create group RPC | REQUIRED on submit | Server validation, representative and single-entry concurrency guard |
| Update group roster RPC | REQUIRED on save | Atomic roster/leader edit with optimistic concurrency |
| Scoped registration read with metadata | REQUIRED | One consistent group identity across schedule/check-in/results |
| Older scoped read | CONDITIONAL | Only when the newer RPC is missing from schema cache |

## Database and security

Migration: `20261022120000_group_participation_leader_identity.sql`.

- Adds `registrations.group_leader_participant_id` (FK, restrict delete),
  `group_members.member_order`, a leader-kind check and a partial team/item unique
  index for entries with an assigned leader.
- Keeps the legacy entry chest field and all old rows unchanged during migration.
- New creation is serialized per festival/item/team and rejects an existing team
  registration, including legacy assignments. Selecting a leader on a legacy entry
  with conflicting team registrations is blocked for explicit review.
- Keeps the existing private transaction capability for roster edits after check-in,
  letters or results. Deferred checks require the leader to remain a roster member.
- Moving a current leader to another team/festival requires choosing a replacement
  first. Ordinary name/chest edits continue to use the existing participant flow.
- All public mutations validate the actual actor or resolve the portal assignment
  server-side. Private helpers are not granted to application roles.
- Existing read RPC definitions retain their authorization and visibility predicates;
  only group identity display fields and participation-type checks are adapted.

## Regression and rollout gates

Use `supabase/tests/group_participation_read_only_diagnostic.sql` before rollout.
Its NULL scope inspects active festivals; provide a festival UUID to restrict it.
It reports existing legacy registrations, multiple team entries, marks/results and
entries needing explicit leader assignment. It performs no writes.

Required checks: creation order, all category/type combinations, leader replacement,
stale saves, cross-team/cross-tenant rejection, QR matching, operational scoped
reads, legacy marks/results retention, existing scoring tests, and mobile editor
layout. Disposable PostgreSQL fixture tests and browser fixtures are separate from
validation against the actual Supabase schema/RLS/PostgREST metadata.

Install test-only runtimes outside project dependencies:

```powershell
npm.cmd install --prefix output/group-flow-db --no-save --package-lock=false --ignore-scripts --no-audit --no-fund @electric-sql/pglite puppeteer-core
node tests/group-participation-db.cjs
node --test tests/group-participation.test.cjs tests/check-in-identity.test.cjs tests/participant-competition-filter.test.cjs tests/scoring.test.cjs tests/general-membership-cache.test.cjs tests/code-letter-updates.test.cjs
```

The browser fixture requires an Expo web export built with the synthetic URL
`https://group-flow-test.invalid` and `EXPO_NO_DOTENV=1`, in `output/group-flow-web`.
It intercepts all external requests and never accesses a live database. Run with
`node tests/group-participation-browser.cjs`.

Before application rollout: inspect actual deployed function/schema versions, run
the read-only report, apply/replay the migration in the agreed environment, confirm
PostgREST exposes both explicitly named participant relationships, then deploy the
matching app. Existing legacy conflicts require separate review; the migration
does not choose or delete historical results. No persistent database apply, commit,
push or deployment is part of the current local implementation.

This worktree also retains the earlier Item Activation delete draft and its
independent `20261022091102_delete_inactive_competition_item.sql` migration. A
combined deployment must include its matching RPCs; do not deploy its UI alone.

## Validation actually run

- 40 Node focused/regression tests passed (group/category mapping, QR, category
  filtering, membership cache, existing scoring and code-letter updates).
- The new migration and actual scoped read/completion/roster functions executed in
  disposable in-memory PostgreSQL via PGlite. Assertions cover admin/portal creates,
  ordered leader selection, duplicate rejection, member/leader concurrency tokens,
  cross-team/tenant denial, operational reads, old number/awarded-points retention,
  current-only member links, and the read-only diagnostic query.
- The browser fixture passed General Individual and all-category Group enrollment,
  explicit replacement, portal enrollment and API payload checks. Roster overflow
  and Save action visibility were checked at 320/375/768/1024/1440px and on a
  320x568 phone. Generated phone/desktop screenshots were inspected.
- Expo web export passed with synthetic Supabase configuration.
- Full TypeScript check failed with 208 existing diagnostics. Two diagnostics in
  touched files concern pre-existing `ui.colors.destructive` / `destructiveSoft`
  accesses also present in HEAD; these unrelated token definitions were preserved.
- Actual Supabase runtime/RLS/PostgREST metadata, token-bound judge execution and
  two simultaneous independent PostgreSQL sessions remain unverified. The private
  team/item lock and partial unique index are present, but the in-memory test is
  not evidence of an independently connected concurrency stress test.
