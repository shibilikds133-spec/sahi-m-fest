-- Remove legacy authenticated/anonymous policies that bypass tenant-scoped
-- policies. The tenant-scoped replacements remain in place.

BEGIN;

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.festival_calendar;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.festival_calendar;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.festival_calendar;
DROP POLICY IF EXISTS festival_calendar_delete ON public.festival_calendar;
DROP POLICY IF EXISTS festival_calendar_insert ON public.festival_calendar;
DROP POLICY IF EXISTS festival_calendar_select ON public.festival_calendar;
DROP POLICY IF EXISTS festival_calendar_update ON public.festival_calendar;

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.items;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.items;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.items;

DROP POLICY IF EXISTS "Public can identify judges for login" ON public.judges;

COMMIT;
