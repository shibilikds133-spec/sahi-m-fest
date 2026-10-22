# General group identity and participation

## Approved rules and implementation plan

One General team/program entry is one `registrations` row (`entry_kind=general_team`, `participant_id=NULL`). Its `group_members` rows link the participating children for roster/profile display and scheduling conflict detection only. A child's public participation list may show the group program; the child's published-results/individual-points list must not inherit the group's result.

Operational identity is the registration UUID. Staff find it through its group chest number in the selected schedule and confirm that entry once. Member UUIDs never substitute for this identity. Existing stage ownership, lock, audit, marks and result APIs remain authoritative. Public individual ranking already excludes `is_group` rows and rows without a participant ID.

### Impact and compatibility

- Database: a private shared numeric allocator, cross-table chest collision guards, group identity/member integrity triggers, additive operational JSON metadata, and a compatible public profile RPC. Existing General entries/cards keep their GE numbers. No result rows or points are copied or recalculated.
- API: preserve creation/check-in signatures and authorization. Admin and Team Leader creation use the same allocator. Profile participation rows gain optional entry kind/chest fields; published-results shape remains unchanged.
- UI: existing Chest Cards page gets a Group mode; existing check-in screens show the roster and use group registration actions. Candidate profile labels General participation as team points only. Group cards do not generate a candidate-profile QR.
- Numbering: new numbers start at 1000 when the festival participant range is 100, otherwise at 100 when the range is 1000. The per-festival counter skips occupied numbers. Both participant and group writes share a transaction lock and reject cross-table collisions. A conflicting deterministic participant renumbering fails atomically; existing cards are never silently renumbered.
- Privacy: public profile eligibility/organisation visibility remains in the existing RPC. Only that child's membership is exposed, without roster/member IDs or group points. Admin roster metadata is added only after the existing scoped registration read authorizes the schedule.
- Migration is additive and transactional. It requires the General entries, team leader program assignment and operational letter-read migrations. Runtime deployment/history must be checked separately before applying. Source work does not authorize a database deployment or Git push.

### Validation and rollout

Use disposable PostgreSQL fixtures for numbering/collisions, cross-festival/team membership rejection, identity immutability, member profile visibility with no individual results/points, restored auth/tenant behavior, and duplicate/concurrent allocation. Verify QR matching cannot select a group through an absent/member participant ID. Typecheck/build and test responsive profile/card/check-in screens. Publish only observed results below.

## Validation status

Implemented in repository source. Live Supabase deployment and production data have not been verified or changed.

### Verified data/API flow

1. Admin or Team Leader creates a General team/program registration through the existing RPC. The server checks admin/own-team scope, festival, roster and member limits, then allocates a festival-unique group chest number.
2. `group_members` links every child to the registration. The public candidate RPC includes that membership in `participated_items`; it does not add the group award to `published_results`. Existing individual ranking and team leaderboard contracts remain unchanged.
3. Scoped stage reads return the entry identity and roster. Manual search uses the group chest number; verification submits only the registration UUID to the existing stage API. A student QR cannot resolve a General group. No student attendance rows are written.
4. The existing Chest Cards page has Group cards and program filtering, using the existing template/printing controls. Group cards show the group chest, program and team without a child-profile QR.
5. Creation invalidates the affected festival's group/check-in caches and the selected members' cached profiles/results. Unrelated candidate profiles are not invalidated. Existing team/program queries are refreshed after Team Leader creation.
6. Admin can open an existing General entry from General Entries or the Programs group details and edit only its current member links. General Entries searches loaded entries by group chest number, member name/chest number, or program name/code. Save calls `update_general_team_roster` with the originally loaded member IDs for stale-edit protection; the RPC locks the registration, checks admin/tenant/team scope, eligibility and configured member count, then atomically updates `group_members` and `raw_group_members`. It records an audit row but does not replace the registration, chest number, check-in, code letter, marks or result. A private transaction-scoped capability permits this RPC alone to edit a finished entry; direct member writes retain the lock. Only current members appear in the entry and their participation lists; removed members are not retained as historical participation. Old and new members' caches and operational roster/entry-size caches are invalidated.

### Observed validation

- `node tests/general-group-db.cjs`: **66 PostgreSQL assertions passed**, including real two-session group/group, participant/group and stale roster-edit races. Tests load the actual migrations, stage update, profile, public individual feed and team leaderboard SQL into a disposable PostgreSQL 15 fixture. This is not a full staging-schema rehearsal.
- `node --test tests/check-in-identity.test.cjs tests/general-membership-cache.test.cjs tests/code-letter-updates.test.cjs tests/scoring.test.cjs`: **25 tests passed**.
- `node tests/code-letters-db.cjs`: **39 existing PostgreSQL assertions passed**, plus the concurrent stale-swap regression.
- Expo web export passed with synthetic `.invalid` Supabase configuration. Browser fixtures cover 320/375/768/1024/1440px, a short 375x667 verification modal, member profile/privacy, group check-in identity/locks, cards' empty/error states, and General Entries search/edit/current-roster behavior. Requests to real services are blocked. These are mocked browser checks, not live E2E tests.
- A General card was exported to PDF and its content/render inspected separately. Physical printing was not performed.
- Full repository `tsc --noEmit` remains blocked by existing source/nested-checkout diagnostics; the edited UI/service files have no reported TypeScript diagnostics. Focused ESLint passed. This does not claim that the full project typecheck passes.

### Deployment boundary and compatibility

For roster editing, apply `supabase/migrations/20261022034136_general_team_roster_edit.sql` only after the original `20261021172215_general_group_identity_and_profile.sql` migration and after verifying the target project/migration ledger. Deploy the updated frontend after the edit migration. No Edge Function changes are needed. Live database migration state and runtime behavior are unverified here.

Existing General chest numbers and results are retained. Historical participant-backed group rows are not automatically converted to native General team entries. The migration does not rewrite existing group rosters. Published group entries keep their operational locks for direct writes; an authorized admin roster edit is the narrow exception. A child leaving a team later does not silently transfer that group's ownership or result. Editing a roster does not recalculate or republish existing points; future calculations use the current member count from `raw_group_members`.

The main-branch change is scoped to this feature's UI, SQL migration, tests and architecture notes. The live Supabase migration state has not been checked or changed. Apply the migration and deploy the frontend to activate the feature.
