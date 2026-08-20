-- ============================================================
-- SQL Script to Clear ALL Test Data & Make Production Ready
-- Wipes all transient participant registrations, judge mark entries,
-- results, certificates, and log history across ALL tenants.
-- Keeps setup configuration (tenants, units, items, categories, venues, schedules) intact.
-- ============================================================

BEGIN;

-- 1. Clear logs and audit tables
DELETE FROM public.transfer_logs;
DELETE FROM public.audit_logs;
DELETE FROM public.system_events;
DELETE FROM public.participant_unit_audit_logs;
DELETE FROM public.participant_unit_batches;

-- 2. Clear leaderboard points cache
DELETE FROM public.point_table;

-- 3. Clear generated certificates and poster studio assets
DELETE FROM public.generated_posters;
DELETE FROM public.generated_assets;
DELETE FROM public.certificates;

-- 4. Clear check-in attendance records
DELETE FROM public.attendance;

-- 5. Clear results
DELETE FROM public.results;

-- 6. Clear judge mark entries and access tokens
DELETE FROM public.mark_entries;
DELETE FROM public.judge_tokens;

-- 7. Clear group member mappings
DELETE FROM public.group_members;

-- 8. Clear event registrations
DELETE FROM public.registrations;

-- 9. Clear participants
DELETE FROM public.participants;

COMMIT;
