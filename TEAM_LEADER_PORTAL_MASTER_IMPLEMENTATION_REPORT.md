# Team Leader Competition-Day Portal — Architecture Audit

## Status

The architecture audit is complete and the local security/data foundation is
implemented. No migration was applied, and no production data, deployment, or
Edge Function was changed.

## Repository state

- Branch HEAD at audit: `d931969` (`keep tenant filter checked across navigation`).
- Existing unrelated worktree change: `src/app/(admin)/settings/items.tsx` (preserved).
- Applied migration history in the repository currently extends through 117.
- New local forward-only migration prepared: `118_team_leader_security_foundation.sql`.

## Existing architecture audited

- Expo Router with `(admin)`, `(super)`, `(public)`, `judge`, and
  `stage-management` route areas.
- Root `useProtectedRoute` uses the existing profile role and tenant fields.
- Existing roles are `admin`, `judge`, `volunteer`, and `participant`; there is
  no `team_leader` role or assignment resolver.
- Username login already uses the trusted `resolve-login-identifier` Edge
  Function and does not perform public username lookup.
- Core operational tables already exist for tenants, festivals, organisations,
  participants, registrations, group members, schedules, attendance, results,
  point tables, announcements, notifications, and audit logs.
- `organisations` is the current hierarchy model. There is no separate team,
  house, department, or team-leader table.
- Public leaderboard/result and schedule screens already provide reusable
  published-data patterns.
- Check-in is represented through existing schedule/attendance flows and is
  currently admin/stage-management oriented.
- `components.json`, NativeWind/Tailwind, Lucide, and existing UI components
  were inspected. The shadcn preset was inspected conceptually but was not
  applied and no global UI files were changed.

## Critical design findings

1. A Team Leader account cannot be safely implemented by adding only a route or
   frontend role string. The database needs a festival-scoped assignment that
   binds `auth.uid()` to the parent tenant, festival, and organisation/team.
2. The existing `organisations` table is the safest candidate for the team
   concept, subject to confirming the intended `org_type` values. Creating a
   duplicate `teams` table would create conflicting ownership models.
3. Existing organisation RLS includes broad prototype-era policies. Team Leader
   access must use new restricted policies or secure read-only RPCs and must not
   inherit broad admin/public access.
4. Team Leader must be added to the session/route model without weakening the
   existing admin, super-admin, judge, or public isolation.
5. Team Leader writes should be limited to notification read receipts in the
   MVP. Participants, registrations, schedules, attendance, marks, results,
   points, categories, users, templates, and settings remain read-only/denied.
6. The existing `announcements` table and newer notification inbox are not
   automatically interchangeable. Reuse the established notification delivery
   path where possible instead of creating a duplicate announcement system.
7. Portal settings need a festival-scoped record with server-side validation;
   UI visibility must never be treated as the authorization boundary.

## Safe implementation order

### Phase 1 — Data/security foundation

- Confirm whether `organisations` will represent teams for College Fest and
  Sahithyolsav without changing existing semantics.
- Add a forward-only assignment/settings migration after verifying the current
  highest migration.
- Add minimal `team_leader` profile/role support, assignment validity checks,
  portal enabled/open/close checks, and strict RLS/RPC access.
- Add secure read-only data contracts for own-team participants/events,
  check-in status, standings, published results, and announcements.
- Extend secure account provisioning and revocation using existing username
  login infrastructure.

### Phase 2 — Admin Festival Settings

- Add Festival Admin-only Team Leader Portal Management under existing settings.
- Implement portal status, assignment, access disable/re-enable, page
  visibility, and display settings.
- Audit important actions through the existing trusted audit path.

### Phase 3 — Isolated portal shell

- Add a dedicated `(team-leader)` route group and layout.
- Add session/assignment resolver, access-denied state, logout cache cleanup,
  and explicit denial of admin/super/judge/core routes.

### Phase 4 — Read-only portal pages

- Dashboard, My Team, Schedule, Results, Participants, Announcements, and Team
  Profile.
- Support multiple participants per event and highlight the assigned team.
- Display only officially published results and existing official rankings.

### Phase 5 — Verification

- Run cross-team, cross-tenant, revoked-assignment, disabled-portal,
  unpublished-result, route-isolation, cache-isolation, responsive,
  accessibility, TypeScript, focused lint, and web-export checks.

## Local foundation implementation status

- `festival_teams` mapping: implemented. It references existing
  `organisations` and validates the parent tenant/festival hierarchy.
- `team_leader_assignments`: implemented. It references `festival_team_id`,
  validates the `team_leader` role, active team, validity window, and active
  assignment uniqueness.
- Festival-scoped portal settings: implemented with disabled-by-default state,
  open/close window, messages, and JSON display configuration.
- Secure read-only RPCs: implemented for context, participants, schedule,
  published results, standings, and announcements. RPCs resolve the assignment
  from `auth.uid()` and accept no client team/tenant identifiers.
- Strict RLS: implemented for the new tables. Restrictive policies deny direct
  Team Leader access to core tables; the approved SECURITY DEFINER RPCs are the
  intended read path.
- Route isolation: implemented at the root guard with a dedicated `/team/*`
  namespace placeholder. Team Leaders are blocked from core route rendering and
  are redirected to `/team/dashboard`.
- Typed local service wrapper: implemented in
  `src/services/teamLeaderPortalService.ts`.

The full competition-day UI and Festival Settings management UI remain pending
until the foundation is independently reviewed and its migration is approved
for a non-production test environment.

## Shadcn/UI decision

Preset command and compatibility were inspected. The preset was **not applied**
because the app is Expo/React Native Web with existing NativeWind/Tailwind
tokens and there is no evidence that a global preset run is safe. The portal
should use the existing compatible UI primitives or a narrowly scoped subset
after the data/security layer is proven.

## Deployment safety

- No migration applied.
- No production data or Auth user changed.
- No frontend or Edge Function deployed.
- Existing dirty worktree changes were not reset, cleaned, staged, or modified.

## Verification

- `git diff --check`: PASS.
- Focused ESLint on foundation files: 0 errors; existing root-layout unused
  import warnings remain.
- `npx tsc --noEmit`: existing baseline errors remain; zero errors reference
  the Team Leader foundation files.
- Migration structure checks: one top-level `BEGIN`, one `COMMIT`, all new
  functions have fixed search paths, and PUBLIC/anon/authenticated execute is
  revoked from internal helpers.
- Runtime SQL/RLS tests: NOT RUN because the migration was intentionally not
  applied and no local database container is available.

## Immediate blocker

Before implementation can be completed, the product owner must confirm that
existing `organisations` rows are the intended Team/House/Department records for
the portal. If yes, they can be reused with a festival-scoped assignment. If
not, a separate team model must be designed before any UI work.

## UI Redesign

- Shadcn preset inspected: YES. `components.json`, Tailwind tokens, global CSS,
  Expo Router, and React Native Web compatibility were reviewed.
- Preset applied safely: NO. A global preset apply would risk existing
  Admin/Judge/Public surfaces, so the existing compatible shadcn primitives and
  NativeWind tokens remain in use.
- Team Leader shell refined with compact desktop navigation, notification/profile
  affordances, and a fixed mobile bottom navigation with a More drawer.
- Dashboard summary now consumes the secure standings RPC for current rank and
  total points, while upcoming events and next event time remain derived from
  the existing Team Leader schedule RPC output.
- Existing Results, Participants, Announcements, My Team, Schedule, and Profile
  screens continue to use read-only service/RPC outputs and shadcn Card, Badge,
  Tabs, Skeleton, Button, Label, and Separator primitives.
- No Admin, Judge, Public, RLS, authentication, assignment, or database logic
  was changed.
- Verification: focused ESLint and Expo web export/build PASS; `git diff --check`
  PASS. Browser screenshot verification and dark-theme verification remain
  NOT_RUN in this pass.

## Team Leader Data Delivery Fix

- Root cause: the context RPC treated a missing `team_portal_settings` row as
  disabled, so an otherwise valid active assignment returned no context. The
  same failure blocked downstream Team Leader data RPCs.
- Fix: migration `136_team_leader_context_default_settings.sql` preserves the
  assignment, role, active festival/team, validity-window, and tenant/festival
  checks while treating only an absent settings row as enabled. An explicit
  disabled row or configured open/close window still blocks access.
- Branding is optional presentation data now; a branding read failure no
  longer hides a valid portal context.
- No client-supplied tenant, festival, organisation, or team filters were
  introduced.
- Migration has been created but not applied to production or deployed.
