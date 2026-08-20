-- ============================================================
-- Migration 065: Public Items SELECT Policy
-- Allows anonymous public users to select active items,
-- which is necessary for displaying scheduled event names
-- anonymously on the public schedule portal page.
-- ============================================================

DROP POLICY IF EXISTS "Public can select items" ON public.items;
CREATE POLICY "Public can select items" 
ON public.items FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

NOTIFY pgrst, 'reload schema';
