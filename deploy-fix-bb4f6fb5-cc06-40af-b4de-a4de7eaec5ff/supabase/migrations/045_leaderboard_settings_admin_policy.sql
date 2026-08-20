-- Allow operational leaderboard admin roles to persist settings without weakening tenant isolation.
-- The public read policy remains unchanged; public/anon users still cannot insert or update.

DROP POLICY IF EXISTS "Admins can manage leaderboard settings"
  ON public.festival_leaderboard_settings;
DROP POLICY IF EXISTS "Leaderboard settings admins can read"
  ON public.festival_leaderboard_settings;
DROP POLICY IF EXISTS "Leaderboard settings admins can insert"
  ON public.festival_leaderboard_settings;
DROP POLICY IF EXISTS "Leaderboard settings admins can update"
  ON public.festival_leaderboard_settings;

CREATE POLICY "Leaderboard settings admins can read"
  ON public.festival_leaderboard_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
        AND (
          profiles.role = 'super_admin'
          OR profiles.tenant_id = festival_leaderboard_settings.tenant_id
        )
    )
  );

CREATE POLICY "Leaderboard settings admins can insert"
  ON public.festival_leaderboard_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
        AND (
          profiles.role = 'super_admin'
          OR profiles.tenant_id = festival_leaderboard_settings.tenant_id
        )
    )
  );

CREATE POLICY "Leaderboard settings admins can update"
  ON public.festival_leaderboard_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
        AND (
          profiles.role = 'super_admin'
          OR profiles.tenant_id = festival_leaderboard_settings.tenant_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'tenant_admin', 'festival_admin', 'admin')
        AND (
          profiles.role = 'super_admin'
          OR profiles.tenant_id = festival_leaderboard_settings.tenant_id
        )
    )
  );
