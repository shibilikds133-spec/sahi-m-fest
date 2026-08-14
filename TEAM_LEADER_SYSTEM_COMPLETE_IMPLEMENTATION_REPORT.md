# Team Leader System Audit and Safe Implementation Report

Date: 2026-08-09
Repository: `D:\work\fest\web-for-sahi--main\web-for-sahi--main`
Branch: `staging`
Starting commit: `e654c40`
Final commit: not created

## Executive status

The repository contains both Admin Team Leader Management and the `/team/*`
portal. The existing staging database reports migrations 118 through 123 as
applied. No applied migration was replayed or modified.

This audit produced safe application-layer fixes and an additive migration
124. Per the latest instruction, migration 124 was applied to the configured
Supabase project and the updated Edge Function was deployed. The task is still
not marked fully complete because the Docker daemon was not running, so
disposable local RLS validation and authenticated browser checks could not be
performed.

## Findings

### Admin Team Leader Management

- Participant source: participants table, filtered by the active festival and
  protected by existing RLS. The UI now keeps this source.
- Team source: previously visible organisations were mapped to temporary team
  IDs. This was unsafe/inaccurate. The UI now reads active `festival_teams`
  joined to organisations for the selected festival.
- Participant organisation auto-selection: implemented using the canonical
  `organisation_id` field.
- Account link status: implemented through `participants.user_id` and the
  linked profile.
- Role safety: assignment now blocks linked accounts whose role is not
  `team_leader`; existing Admin/Judge/Superadmin roles are not overwritten.
- Revoke: the UI previously deleted assignment history. It now updates the
  active row to `status = 'revoked'` with `revoked_at` and `updated_at`.
- Missing/partial: portal settings controls, password reset, disable-account,
  and a dedicated reassign workflow are not complete in the current UI.

### Team Leader User Portal

- Routes exist for login, dashboard, my-team/standings, participants, schedule,
  full schedule, results, announcements, and profile.
- Portal reads use the secure no-argument Team Leader RPC service.
- Published results use the triple visibility gate in the applied foundation
  migration: `published`, `result_status = 'published'`, and `public_visible`.
- Standings use `get_public_leaderboard` through the Team Leader RPC.
- Check-in counts use `registrations.is_verified`.
- `/team/login` is now explicitly allowed as an unauthenticated entry route.
- Authenticated non-Team-Leader users are redirected out of `/team/*`.
- A non-Team-Leader login is signed out immediately after role rejection.

## Database and migrations

- Remote migration list observed: 001 through 123 applied.
- Migration 118: not modified.
- Migration 119: not modified.
- Migration 121 provides nullable `participants.user_id`, an Auth FK with
  `ON DELETE SET NULL`, and a partial unique index scoped to
  `(festival_id, user_id)`.
- Migration 122 provides the provisioning finalisation RPC.
- New migration 124: applied successfully to the configured Supabase project.
  It hardens the finalisation RPC with caller-admin authorization,
  participant-link conflict protection, and explicit function grants.
- Existing rows backfilled: NO.
- Existing participants, registrations, results, schedules, organisations,
  festivals, and Auth users were not deleted or modified by this audit.

## Provisioning security

The `provision-team-leader` Edge Function already keeps the service-role key
server-side. This audit additionally makes it authorize the caller and target
participant before creating an Auth user. It checks the caller profile, target
participant accessibility, existing participant link, and active festival.
Compensation still deletes only the Auth user created in the current request
when final database linkage fails.

Frontend search found service-role references only in server-side Edge
Functions; no `EXPO_PUBLIC_SERVICE_ROLE` usage was found.

## Validation

- Focused `git diff --check`: passed for the files changed in this audit.
- `npx expo export -p web`: passed; `dist/index.html` exists.
- Localhost: restarted and returned HTTP 200 on port 8081.
- Full TypeScript check: existing unrelated errors remain, including Deno
  imports/types in Edge Functions and other pre-existing import/UI typing
  errors. No new error was identified in the route/login changes.
- Browser authenticated Admin → Team Leader and Team Leader end-to-end tests:
  not completed.
- Disposable local Supabase/RLS tests: blocked because Docker Desktop's Linux
  engine was not running.
- Production Supabase migration 124: applied successfully; a follow-up dry-run
  reported the database is up to date.
- `provision-team-leader` Edge Function: deployed successfully and is ACTIVE
  (version 1) in the configured Supabase project.
- Git push: not performed.

## Files touched by this audit

- `src/app/(admin)/settings/team-leader-portal.tsx` — real festival-team
  dropdown, festival-scoped assignments, role-safe assignment, revoke instead
  of deleting history.
- `supabase/functions/provision-team-leader/index.ts` — authorization before
  service-role Auth creation.
- `src/core/hooks/useProtectedRoute.ts` — Team Leader route isolation and
  public Team Leader login entry.
- `src/app/team/login.tsx` — sign out rejected non-Team-Leader sessions.
- `supabase/migrations/124_harden_team_leader_provisioning.sql` — additive,
  unapplied provisioning RPC hardening.

## Final status

Production SQL and Edge Function deployment completed; full system
verification remains pending.

**BLOCKER REMAINS — DO NOT CLAIM COMPLETION.**

Start Docker Desktop and run disposable local Supabase/RLS validation, then
run authenticated Admin and Team Leader browser flows. No `main` push was
performed.
