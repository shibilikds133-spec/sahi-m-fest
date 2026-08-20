# Team Leader Portal Foundation Findings Fix Report

## Executive Summary

Migration 118 was corrected locally before runtime testing. The RLS regression
now has tenant-scoped permissive paths for existing authenticated flows, while
Team Leader restrictive policies remain in force. Published results follow the
official public contract. Check-in counts use `registrations.is_verified`, the
source used by Admin and Stage Management.

No migration was applied and no deployment or data change was performed.

## Findings Fixed

- `schedules`, `venues`, `attendance`, `point_table`, and `announcements` use
  tenant-scoped authenticated policies.
- `group_members` is scoped through its registration tenant.
- Team Leader restrictive policies remain the direct-table gate.
- Public schedules/venues require an active festival and visible schedule
  status (`scheduled`, `ongoing`, or `in_progress`); public access is SELECT-only.
- Team Leader results require `published IS TRUE`,
  `result_status = 'published'`, and `public_visible IS TRUE`.
- Standings reuse `get_public_leaderboard`, preserving its publication,
  deduplication, points, and ordering rules.
- Announcements are limited to the current festival/tenant and target roles
  `all`, `team_leader`, and `participant`. The schema has no team-target column,
  so team-specific targeting is not claimed.

## Policy and Privilege Review

The six newly protected tables receive permissive policies before the Team
Leader restrictive policies. Existing tenant helpers are used; no broad
authenticated `USING (true)` or `WITH CHECK (true)` policy was added. Team
Leader RPCs remain SECURITY DEFINER with fixed search paths, and internal
helper execution remains revoked from PUBLIC, anon, and authenticated.

## Runtime Test Assets

Prepared but not executed:
`supabase/tests/team_leader_foundation_runtime_plan.sql`.

## Static Verification

`git diff --check` passes. Full TypeScript verification contains pre-existing
unrelated errors outside this foundation change. Runtime RLS testing remains
required in a disposable/local database.

## Confirmation

- Migration 118 applied: **NO**
- Deployment: **NO**
- Production data changed: **NO**
- Team Leader UI started: **NO**
- Shadcn preset applied: **NO**

**READY FOR SECOND INDEPENDENT REVIEW**
