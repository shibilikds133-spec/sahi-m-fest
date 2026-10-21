# Team Leader Program Assignment

## Current behavior

The Team Leader portal now has a Programs page at `/team/programs`. Managers can
assign an active individual program to one existing student in their assigned
team, or create an active General group entry from multiple existing students
in that team. Student creation remains an Admin portal action.

The page uses the existing Team Leader shell and portal service. On mobile, the
student roster and General member selection use compact pickers; on wide screens,
individual assignments show the roster beside the program list and General
member selection uses a centered dialog. Both layouts call the same RPCs.

## Data and authorization

- `get_team_leader_programs(p_participant_id)` returns eligible individual and
  General group programs. The server resolves the caller's active Team Leader
  assignment and verifies the supplied student belongs to that team's festival
  and exact organisation. Parent-tenant and organisation-tenant participant
  records are supported, matching the Admin registration ownership model.
- `team_leader_assign_program(p_participant_id, p_item_id)` validates the
  participant, active individual item, category aliases, the optional post-HS
  religious category flag when present, gender, registration ban, duplicate
  registration, and the Admin dual-team rule before adding a pending
  participant registration. The registration keeps the participant's tenant
  and the assigned organisation.
- `team_leader_create_general_entry(p_item_id, p_participant_ids)` validates
  the active festival's General setting, active General group item, configured
  group size, gender, and every student's membership in the caller's team. It
  creates an approved `general_team` registration, allocates the existing
  `GE-` chest number, stores the registration under the assigned organisation's
  tenant like Admin, and links members through `group_members`.
- The Team Leader roster, schedule, and published-result RPCs include only the
  caller's assigned organisation. General group entries also appear in Admin
  stage/schedule reads and Team Leader schedule/results. Admin General member
  reads are allowed through visible organisation scope; the existing restrictive
  Team Leader table policy still blocks direct table access.
- These functions are `SECURITY DEFINER` with a fixed search path, reject
  unauthenticated calls, derive team scope from `get_team_leader_context()`,
  and are executable only by `authenticated`. General entry counters remain
  inaccessible directly to authenticated users.

## Database migration

Apply these migrations in timestamp order after the Team Leader security
foundation and General category setting are present:

1. `supabase/migrations/20261021081159_team_leader_program_assignment.sql`
   adds the shared `entry_kind`, General entry chest number, counter schema,
   and the Team Leader assignment RPCs. Existing registrations default to
   `participant`.
2. `supabase/migrations/20261021085726_team_leader_admin_flow_parity.sql`
   aligns eligibility and tenant ownership, updates team-scoped roster/schedule/
   result reads, includes General entries in stage/schedule reads, and allows
   Admins to read General members from visible child organisations.

Neither migration has been applied to Supabase. Verify the target project and
migration ledger before running them; the repository handoff warns against a
blind `supabase db push`.

## Validation status

- Targeted ESLint for the page, service, route layout, and Team Leader shell:
  passed.
- The feature and parity migrations passed a local PostgreSQL transaction dry-run
  and were rolled back. Authenticated Team Leader/Admin runtime flows remain
  unverified, and neither migration has been applied to the staging project.
- Repository-wide `tsc --noEmit`: does not pass because of existing errors in
  unrelated files; no diagnostics were reported for the program page, service,
  route layout, or Team Leader shell.
- Supabase migration execution and authenticated browser flows: not run.
