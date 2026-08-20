-- Remove the legacy 2025 default. New records should derive the year from
-- start_date when callers omit festival_year, while preserving an explicitly
-- supplied year.

ALTER TABLE public.festival_calendar
  ALTER COLUMN festival_year DROP DEFAULT;

CREATE OR REPLACE FUNCTION public.sync_festival_year_from_start_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.festival_year IS NULL THEN
    NEW.festival_year := EXTRACT(YEAR FROM NEW.start_date)::int;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.start_date IS DISTINCT FROM OLD.start_date
    AND NEW.festival_year IS NOT DISTINCT FROM OLD.festival_year
  THEN
    NEW.festival_year := EXTRACT(YEAR FROM NEW.start_date)::int;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_festival_year
  ON public.festival_calendar;

CREATE TRIGGER trg_sync_festival_year
BEFORE INSERT OR UPDATE OF start_date, festival_year
ON public.festival_calendar
FOR EACH ROW
EXECUTE FUNCTION public.sync_festival_year_from_start_date();

-- Correct only the verified PANDIKKAD record. Other mismatches may represent
-- an explicitly chosen festival year and are intentionally left untouched.
UPDATE public.festival_calendar
SET festival_year = EXTRACT(YEAR FROM start_date)::int
WHERE id = '15c4f402-8539-4230-8823-b36892ca0eed'::uuid
  AND tenant_id = 'ad55a632-05db-45d4-b6ca-aac5876ef570'::uuid
  AND start_date IS NOT NULL
  AND festival_year IS DISTINCT FROM EXTRACT(YEAR FROM start_date)::int;

NOTIFY pgrst, 'reload schema';
