# Participant editing and award ownership

Local implementation, 2026-10-23. The migration has **not** been applied to a
remote database. This document does not establish the deployed schema/state.

## Changed files

- `src/app/(admin)/participants/[id]/index.tsx`: in-sheet team/chest editing,
  original edit snapshot, atomic save, protected draft, real confirmation/error
  modal above the sheet.
- `src/services/participantService.ts`, `src/core/hooks/useParticipants.ts`:
  profile RPC and identity-consumer refresh; existing non-profile mutations stay
  available. Public profile type includes its festival for refresh subscription.
- `src/core/utils/invalidateParticipantProfiles.ts`,
  `src/core/hooks/useParticipantProfileUpdates.ts`: scoped and coalesced refresh.
- `src/core/hooks/useCodeLetterUpdates.ts`: extract its existing shared listener
  into a reusable hook; old code-letter topic behavior remains compatible.
- `src/app/_layout.tsx`, `src/core/hooks/useLeaderboard.ts`,
  `src/core/contexts/TeamLeaderContext.tsx`: subscribe existing readers to profile
  changes, without introducing polling or an extra active-festival API read.
- The new migration below: atomic editing, numbering plan/audits, private award
  ownership, compatible result-reader joins and empty broadcast hints.
- `tests/participant-edit-db.cjs`, `tests/participant-edit-browser.cjs`,
  `tests/participant-profile-cache.test.cjs`: local scenario, responsive/UI and
  invalidation regression checks. Local evidence is under
  `output/participant-edit-*`.

## Confirmed behavior

- Profile editing preserves participant ID, registrations, marks and results.
  The existing editable profile fields remain editable. Team and numeric chest
  placement are now inside the same edit sheet.
- For team-template festivals, moving a participant closes their old numeric
  gap by decrementing later numbers in that team. Destination insertion shifts
  the occupied run through its first free number. Numbers beyond that free slot
  remain unchanged. An unused destination number needs no additional shift.
- Empty destination number on team transfer uses its first available number.
  Source/destination range overflow, invalid legacy numbering or final chest
  lock rejects the entire edit. Ordinary profile edits still work under final
  chest lock; an individually locked participant must first be unlocked.
- Category-template festivals retain their existing chest-number behavior.
  This change does not add individual number placement to that template or add
  a separate class/category ordering system.
- Solo registrations follow the new team; group registrations remain with the
  original team. Group roster, representative ID, raw roster snapshots and marks
  are not rewritten. Existing ID-linked readers resolve current participant names
  and representative numbers. Previously exported/printed documents must be
  generated again.
- Existing awards stay with their original recorded team. New solo awards after
  transfer use the new team. Corrections/republication of an already awarded
  result retain its first recorded team; they do not create an additional award.

## Data/API flow

`Edit sheet -> useParticipants.editProfile -> participantService.editProfile ->
edit_participant_profile -> owner/stale/lock/input checks -> number plan ->
profile update + existing transfer RPC + numbering/audits -> returned participant
-> identity query invalidation`.

The one profile save RPC is REQUIRED. Its internal call to the existing
`transfer_participant_team` is CONDITIONAL on an actual team change. The former
client-side transfer request followed by a separate profile update is replaced
by one transaction. A failed step rolls back profile, transfers, numbers and
audits. Photo upload/removal remains a CONDITIONAL separate operation, with the
existing explicit partial-photo-failure message.

The RPC accepts an allow-list of editable fields and the original timestamp,
team and chest number. It derives permission from `auth.uid()` and festival
ownership, rejects stale snapshots and preserves the existing subordinate-team
transfer checks. A single festival advisory lock serializes numbering edits,
allocation, final locking and award attribution. The existing unique constraint
remains the final collision guard. Replaying a successful changed edit with its
old snapshot fails instead of shifting numbers again.

## Database and points history

Migration: `supabase/migrations/20261023120000_atomic_participant_edit_and_award_ownership.sql`.

`result_team_awards` is the private source of truth for award team attribution,
keyed by result ID. Backfill freezes currently observable team attribution for
published, calculated or awarded legacy results. It cannot reconstruct team
ownership before earlier transfers. Deployment must review that historical-data
limitation; the migration does not invent or repair that missing history.

The result trigger captures first attribution under the same festival lock and
keeps it through corrections, visibility changes and reopening. It rejects
reassigning an awarded result to another registration/item/festival. Clients have
no direct ledger privileges; RLS is enabled. The ledger references results with
delete cascade and organisations with delete restrict, protecting a recorded
award team from hard deletion. Archive behavior is unchanged.

The migration patches the installed public/admin leaderboards, preview,
published/festival result readers, public result/leaderboard views and team
leader published result list to join the ledger by result ID. Their output
shapes, visibility filters, result deduplication, grace rules, ranking limits and
scoring formulas are preserved. Scoped public wrappers still delegate to their
existing readers. Sealed scoring payloads and publication request IDs are not
changed. Unknown supported reader shapes cause migration failure for review.
The modified result readers also qualify their existing organisation tenant
predicates to avoid the original ambiguous `tenant_id` output-variable reference
under PostgreSQL's default conflict policy; the predicate itself is unchanged.

The migration takes write-blocking table locks during backfill/installation;
plan deployment for that short maintenance window. Review and apply only to the
explicitly approved target database after its actual schema is verified.

## Live refresh and draft safety

Statement-level broadcasts contain empty invalidation hints only. Current
participant data still passes through each screen's existing authorized reads.
Relevant cached lists, profiles, group/registration labels, result names,
leaderboards and numbering settings are refreshed. Raw judge mark queries are
not invalidated by a profile edit. Shared listeners debounce multi-row changes;
same-hint profile callbacks merge into one refresh. There is no new polling.

Admin layout observes the already-loaded active-festival query without an extra
API call. Public leaderboard/result hooks and public candidate profiles subscribe
to their festival; team portal refreshes its existing context/local-state reads.
Existing stage/PIN consumers receive their existing code-letter label hints.
Reconnect/app focus also refreshes. An open profile draft is not overwritten by
refetched data; its original snapshot remains the save concurrency guard.

## Validation and limits

- `node tests/participant-edit-db.cjs`: new network-isolated PostgreSQL 15
  container, using actual existing transfer/numbering functions and result
  readers plus the complete new migration. Tests cover transfer/rename, both
  numbering directions, original/new award teams, corrections, role/tenant/input
  checks, stale writes, range capacity, locks, rollback, audit/privacy and
  concurrent edits. This reduced fixture is not a full Supabase deployment.
- `node --test tests/participant-profile-cache.test.cjs`: consumer targeting,
  no mark-draft invalidation, festival scoping and duplicate-hint coalescing.
- Existing scoring, category-filter, membership-cache and code-letter broadcast
  unit regressions are also run. The original dirty checkout had independent QR check-in and old chest-order
  test mismatches. The clean main integration preserves the newer group/leader
  flows and its QR regression suite passes; the old chest-order harness is not
  repaired by this task.
- Browser validation uses an Expo export with synthetic credentials and every
  external request intercepted. It cannot establish real Realtime delivery,
  deployed RLS, remote migration state or production behavior.
- Full-project typecheck currently includes unrelated errors from nested copies,
  old files and Deno edge functions. Treat focused changed-file results and the
  whole-project result separately.

Verified results: the new PostgreSQL scenario groups and browser suite pass;
the original focused unit/regression command passed 24 tests. After porting only
this task to clean main at `2abbda7`, the expanded unit/regression command discovers
and passes 32 tests, including the current QR/group-leader behavior. Browser
screenshots were inspected at narrow-phone and confirmation states, with all
five widths exercised. Focused ESLint has zero errors and six existing warnings.

An existing cross-tenant portal limitation remains outside this change: the
participant/program/schedule RPCs still contain parent-tenant-only assumptions
(`get_team_leader_participants`, `get_team_leader_schedule`, and program assignment
functions). Transfers to an organisation with its own tenant are accepted by the
existing transfer RPC, but that portal workflow needs a separate scoped review.
The historical result reader follows the frozen award owner through its
registration join and joins the participant to that registration's current team
and tenant. This preserves the reader's team and tenant checks after transfer;
other portal permissions/workflows are not broadened.

Review an exact target schema and run full Supabase staging integration before
production release, including existing historical transfers, result corrections,
subordinate tenants, group membership and actual multi-device delivery.
