-- Migration 154: tenant/festival-scoped General category availability.
-- Safe default: enabled for all existing and future festivals.
-- This is a category setting only; it does not alter items, registrations,
-- schedules, marks, published results, or historical data.

BEGIN;

ALTER TABLE public.festival_calendar
  ADD COLUMN IF NOT EXISTS general_category_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.festival_calendar.general_category_enabled IS
  'Whether the tenant allows General-category events for this festival. Defaults to true; existing records are never changed by toggling this setting.';

COMMIT;

NOTIFY pgrst, 'reload schema';
