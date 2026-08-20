-- 059_schedule_import_unique_slot.sql
-- Create unique constraint for schedules to enforce idempotent slots

CREATE UNIQUE INDEX IF NOT EXISTS unique_schedule_slot
ON public.schedules(
  festival_id,
  venue_id,
  item_id,
  start_time,
  end_time
);
