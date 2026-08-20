-- Per-team visual branding for the Team Leader portal.
-- Additive only: existing teams receive the current portal defaults.
ALTER TABLE public.festival_teams
  ADD COLUMN IF NOT EXISTS portal_primary_color text NOT NULL DEFAULT '#0F766E',
  ADD COLUMN IF NOT EXISTS portal_accent_color text NOT NULL DEFAULT '#14B8A6';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'festival_teams_portal_primary_color_hex'
  ) THEN
    ALTER TABLE public.festival_teams
      ADD CONSTRAINT festival_teams_portal_primary_color_hex
      CHECK (portal_primary_color ~* '^#[0-9A-F]{6}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'festival_teams_portal_accent_color_hex'
  ) THEN
    ALTER TABLE public.festival_teams
      ADD CONSTRAINT festival_teams_portal_accent_color_hex
      CHECK (portal_accent_color ~* '^#[0-9A-F]{6}$');
  END IF;
END;
$$;
