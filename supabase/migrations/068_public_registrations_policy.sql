-- ============================================================
-- Migration 067: Public Registrations SELECT Policy
-- Allows anonymous public users to select registration status and codes,
-- which is necessary for displaying check-in/reporting status on public schedules.
-- ============================================================

DROP POLICY IF EXISTS "Public select registrations basic" ON public.registrations;
CREATE POLICY "Public select registrations basic" 
ON public.registrations FOR SELECT TO anon, authenticated
USING (true);

NOTIFY pgrst, 'reload schema';
