# Group participation flow

## Rules

- `items.participation_type` selects Individual or Group. General (`GN` / `GENERAL`) is a program category and does not change the registration or scoring identity.
- Individual registration and results belong to the participant. Group registration is one `registrations` row with `entry_kind = 'general_team'`, `participant_id = NULL`, and roster links in `group_members`.
- The first participant selected when creating a group is its operational leader. An authorized admin can replace the leader while editing the roster. The leader's existing participant ID, QR/profile identity, and chest number identify the group at check-in. No group-only chest number is allocated.
- General group programs may use eligible participants from different categories. Other group programs validate each member against that program's category and eligibility rules.
- Group results and points belong to the team registration once. Group membership must not add the same result to each participant's individual ranking.
- The database is the source of truth for tenant/team scope, eligibility, member links, the group leader, check-in locks, marks, and results.

## Flow

1. Admin or Team Leader opens a Group program and selects eligible participants from one team.
2. The server resolves the active festival and actor/team scope, validates the program's participation type, roster eligibility and duplicate-entry rule, and serializes concurrent creation for the same festival/program/team.
3. One group registration and its ordered member links are written in one transaction. The first selected participant is stored as `group_leader_participant_id`; no `entry_chest_number` is written for the new registration.
4. Admin, Team Leader, schedule and stage views load the registration through their existing scoped APIs. They display the leader's current participant chest number and show the roster. Check-in records the registration once; a member's QR does not independently resolve the group.
5. Marks, published results and team points continue to use the group registration identity. Individual rankings continue to exclude group results.
6. An authorized admin can edit the roster through `update_group_team_roster`. The request includes the previously loaded member and leader IDs; the server rejects stale edits, checks eligibility and authorization, and updates the roster and leader atomically. Existing marks, results, code letters and points are not rewritten.

General Individual programs continue through the normal participant registration and individual scoring flow. General group programs use the same group flow as other Group programs, with the General-category eligibility rule.

## Database and API compatibility

`20261022120000_group_participation_leader_identity.sql` defines the shared group registration and leader behavior. The forward migration `20261022154229_remove_group_entry_chest_allocator.sql` removes the unused private group chest allocator, its participant chest collision guard, unique index, and counter table. It preserves the legacy `entry_chest_number` column and API key for compatibility; the migration aborts if numbered legacy group entries exist. New group registrations use the participant's existing chest number through the leader relationship.

The stored `general_team` value, existing creation RPC names, routes, schedule/check-in APIs and results contracts remain for compatibility. The database enforces team/tenant authorization and group-member constraints; client filtering is only a convenience.

## Validation status

The code flow is present on `origin/main`. The allocator cleanup migration is recorded and verified on the configured target Supabase project. See `docs/group-participation-leader-impact.md` for validation and runtime evidence.
