# Team Leader Portal Data Flow Fix Report

## 1. Exact symptom

The Team Leader portal shell opens, but Schedule/Dashboard remain in loading or
empty states and the expected festival data is not visible.

## 2. Root cause(s)

1. The context RPC used `COALESCE(s.is_enabled, false)`. For assigned teams
   without a `team_portal_settings` row, the valid assignment resolved to no
   context, so all downstream secure RPCs had no context.
2. The first context fix was named `134_...`, but the repository already had
   `134_team_leader_team_branding.sql`. Duplicate migration versions can stop
   migration application. The forward-only fix is now `136_...`.
3. Source audit shows no schedules for the currently assigned `7ebe...`
   festival. Therefore upcoming events cannot appear until that festival has
   canonical schedule rows. This is source-data absence, not a UI mock-data
   problem.

## 3. Database data existence checks

Service-role read-only audit of the configured database found active Team
Leader assignments, active festival-team mappings, participants, and
registrations. For assigned teams: participants were 2, 1, 14, 13, and 13;
registrations were 7, 1, 79, 0, and 68. Total schedule rows were 68, but zero
matched the assigned teams' active festivals in the audit. Published results
and announcements vary by festival; no published results were present for the
currently assigned `7ebe...` festival.

| Portal section | Source data exists? | Evidence/status |
| --- | --- | --- |
| Active context | YES in base tables / blocked by old RPC settings condition | assignments and teams are active |
| Participants | YES | assigned teams have participant rows |
| Item assignments | YES | registrations exist for some assigned teams |
| Schedule/events | NO for assigned festivals | no matching schedule rows |
| Reporting/check-in | NOT VERIFIED | no scoped runtime Team Leader RPC test |
| Published results | NO for current assigned festival | source audit found none |
| Standings | NOT VERIFIED | official RPC needs authenticated runtime test |
| Announcements | NO matching current notices found | source audit found none |

## 4–15. Trace findings

- Context chain is `auth.uid()` → active assignment → `festival_teams` →
  organisation/tenant/festival. The secure RPCs derive this server-side.
- Participant RPC is scoped by context festival and organisation.
- Canonical item assignment is `registrations`; no duplicate assignment source
  is used by the portal.
- Schedule RPC joins `schedules` to context festival and registrations to the
  context organisation. Its current return shape has no reporting-time field.
- Published results RPC applies published/result-status/public-visible filters.
- Standings RPC delegates points to the existing official leaderboard helper.
- Announcements RPC is festival/context scoped and role targeted.
- Service wrapper calls the expected zero-argument secure RPCs. Branding is
  optional and no longer masks a valid context when its read fails.
- Schedule page has a loading/error distinction issue: its catch only stops
  loading and renders an empty state, so RPC errors can look like no data.

## 16. Exact fixes made

- Added `136_team_leader_context_default_settings.sql`: absent settings rows
  default to enabled; explicit disabled/open/close settings still apply.
- Preserved all assignment, role, validity, active festival/team, and tenant
  isolation predicates.
- Made branding fallback non-blocking in `teamLeaderPortalService.ts`.
- Corrected the migration version collision by renaming the fix from `134` to
  `136`.

## 17–20. Verification

- Focused ESLint: PASS.
- Web export/build: PASS.
- `git diff --check`: PASS.
- Database source audit: PASS as read-only evidence gathering.
- Runtime authenticated RPC/RLS matrix: NOT RUN; no local Supabase CLI/runtime
  was available and no production migration was applied.
- Browser visual check: observed loading/empty state; authenticated RPC errors
  were not exposed in the UI.

## 21. Remaining risks

- The migration must be applied in a controlled migration environment before
  the context fix can affect the running database.
- Schedule/reporting/check-in fields require source rows and a runtime contract
  test; no mock fallback should be added.
- Schedule RPC currently does not expose reporting time because the existing
  contract has no such field.

## 22–23. Deployment

No deployment, production migration application, data mutation, Edge Function
deployment, or RLS weakening was performed for this audit task.
