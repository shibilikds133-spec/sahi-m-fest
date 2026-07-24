-- 054_generated_assets_event_name.sql
-- Add event_name column to generated_assets for direct poster labeling
ALTER TABLE public.generated_assets
  ADD COLUMN IF NOT EXISTS event_name TEXT;
