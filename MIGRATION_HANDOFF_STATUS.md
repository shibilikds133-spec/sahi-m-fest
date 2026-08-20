# Supabase Migration Handoff Status

Updated: 2026-08-16

## Scope

This handoff records the exact database/source state for the next agent. It is
secret-free and must be read before applying any further migration.

## Applied in the current session

The following SQL migrations were dry-run inside a transaction and then applied
atomically to the Supabase database:

- `143_section4_audit_scope_hardening.sql`
- `144_team_leader_team_branding.sql`
- `145_public_leaderboard_festival_name.sql`
- `146_public_leaderboard_tenant_scope.sql`
- `147_harden_points_config_upsert.sql`
- `148_remove_legacy_broad_policies.sql`

Migration 143 was corrected before application:

- Replaced invalid `min(uuid)` with ordered `array_agg(...)[1]`.
- Preserved the existing `profile_slug` column in `get_team_leader_participants()`.

## Post-apply read-only evidence

- `points_config` rows: 4
- Duplicate non-null `(tenant_id, festival_id)` pairs: 0
- `points_config_tenant_festival_key`: present
- `calculate_festival_points` execute: `anon=false`, `authenticated=true`
- Legacy broad policies checked by migration 148: absent
- Team branding columns: present
- Public leaderboard scoped functions: present
- Results rows: 94 total; 80 have `schedule_id` after the unambiguous backfill
- No rows were deleted by migrations

## Audit log evidence

The application `public.audit_logs` table exists and contains current activity.
Latest observed entry:

- action: `UPDATE`
- table: `participants`
- created_at: `2026-08-16T08:35:10.240Z`

DDL, policy, function, and grant changes do not automatically create
application `audit_logs` rows.

## Migration ledger warning

The remote `supabase_migrations.schema_migrations` ledger currently reports
through version `142` with historical gaps. Versions `143`–`148` were applied
directly in one transaction but were intentionally **not** inserted manually
into the ledger. Do not fabricate ledger rows and do not run a blind
`supabase db push`.

Before the next production migration, reconcile the ledger using the official
Supabase migration workflow. Verify versions `136`–`148` one by one against
remote schema/function/policy state, then record only migrations whose exact
SQL has been confirmed applied.

## Source changes

- `src/providers/database/SupabaseDatabaseProvider.ts`
  - reads the latest points config version safely
  - uses `onConflict: 'tenant_id,festival_id'` for points config upsert
- `supabase/migrations/147_harden_points_config_upsert.sql`
- `supabase/migrations/148_remove_legacy_broad_policies.sql`

## Validation already completed

- Targeted ESLint: pass
- Web export build: pass
- `git diff --check`: pass
- Migrations 143–146: transaction dry-run pass
- Migration 148: transaction dry-run pass
- Post-apply read-only schema, policy, grant, duplicate, and audit checks: pass

## Next-agent rules

1. Read this file first.
2. Never insert fake rows into `supabase_migrations.schema_migrations`.
3. Never run all pending migrations blindly.
4. Use a transaction dry-run before every migration.
5. Keep a before/after read-only evidence record.
6. Do not delete or merge existing application data without explicit approval.
