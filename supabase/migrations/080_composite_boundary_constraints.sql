-- STAGING ONLY — NOT APPROVED FOR PRODUCTION
-- Target Environment: Disposable / Cloned Staging Supabase Database ONLY

BEGIN;

-- 1. Add composite unique keys to enforce boundary integrity in staging for sector entities
-- COMPATIBLE WITH HYBRID TENANT MODEL: Enforces composite key scope on sector schedules and items
ALTER TABLE public.schedules
ADD CONSTRAINT uq_schedules_boundary UNIQUE (id, tenant_id, festival_id);

ALTER TABLE public.items
ADD CONSTRAINT uq_items_boundary UNIQUE (id, tenant_id, festival_id);

ALTER TABLE public.registrations
ADD CONSTRAINT uq_registrations_boundary UNIQUE (id, tenant_id, festival_id);

-- NOTE ON HYBRID TENANT OWNERSHIP (GATE-07):
-- Incompatible multi-column tenant foreign keys on registrations are omitted.
-- Under the accepted hybrid tenant model:
--   - participant tenant = unit
--   - registration tenant = sector festival owner
-- Single-column FK registrations.participant_id -> participants.id is retained.

COMMIT;
