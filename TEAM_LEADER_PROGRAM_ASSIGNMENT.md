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
  assignment and verifies the supplied student belongs to that team's festival,
  tenant, and organisation.
- `team_leader_assign_program(p_participant_id, p_item_id)` validates the
  participant, active individual item, category, gender, and registration ban
  before adding a pending participant registration.
- `team_leader_create_general_entry(p_item_id, p_participant_ids)` validates
  the active festival's General setting, active General group item, configured
  group size, gender, and every student's membership in the caller's team. It
  creates an approved `general_team` registration, allocates the existing
  `GE-` chest number, and links members through `group_members`.
- These functions are `SECURITY DEFINER` with a fixed search path, reject
  unauthenticated calls, derive team scope from `get_team_leader_context()`,
  and are executable only by `authenticated`. General entry counters remain
  inaccessible directly to authenticated users.

## Database migration

Apply `supabase/migrations/20261021081159_team_leader_program_assignment.sql`
after the Team Leader security foundation and General category setting are
present. This staging branch does not have the separate General team entry
migration, so this migration also adds the shared `entry_kind`, entry chest
number, and counter schema needed by its General creation RPC. Existing
registrations receive the default `participant` kind. The SQL has not been
applied to Supabase. Verify the target project and migration ledger before
running it; the repository handoff warns against a blind `supabase db push`.

## Validation status

- Targeted ESLint for the page, service, route layout, and Team Leader shell:
  passed.
- Repository-wide `tsc --noEmit`: does not pass because of existing errors in
  unrelated files; no diagnostics were reported for the program page, service,
  route layout, or Team Leader shell.
- Supabase migration execution and authenticated browser flows: not run.
