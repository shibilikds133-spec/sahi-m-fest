-- Migration 029: Leaderboard Settings and Poster Templates

-- 1. Leaderboard Settings Table
CREATE TABLE IF NOT EXISTS public.festival_leaderboard_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  is_public_visible boolean DEFAULT false,
  auto_refresh_enabled boolean DEFAULT false,
  auto_refresh_interval int DEFAULT 30,
  show_rank_movement boolean DEFAULT true,
  show_timestamps boolean DEFAULT true,
  show_grade_summary boolean DEFAULT true,
  is_frozen boolean DEFAULT false,
  preview_visibility text DEFAULT 'draft', -- draft, public
  poster_enabled boolean DEFAULT true,
  certificate_enabled boolean DEFAULT false,
  poster_top_count int DEFAULT 3,
  theme_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid,
  UNIQUE(tenant_id, festival_id)
);

ALTER TABLE public.festival_leaderboard_settings ENABLE ROW LEVEL SECURITY;

-- 2. Poster Templates Table
CREATE TABLE IF NOT EXISTS public.poster_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  name text NOT NULL,
  version int DEFAULT 1,
  background_url text NOT NULL,
  width int DEFAULT 1080,
  height int DEFAULT 1080,
  aspect_ratio text DEFAULT '1:1',
  field_mappings jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.poster_templates ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Admins can read and write settings
CREATE POLICY "Admins can manage leaderboard settings"
  ON public.festival_leaderboard_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'tenant_admin')
      AND (profiles.tenant_id = festival_leaderboard_settings.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- Public can read settings if public visible
CREATE POLICY "Public can read visible leaderboard settings"
  ON public.festival_leaderboard_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    is_public_visible = true
  );

-- Admins can manage poster templates
CREATE POLICY "Admins can manage poster templates"
  ON public.poster_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'tenant_admin')
      AND (profiles.tenant_id = poster_templates.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now(); 
   RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_leaderboard_settings_modtime') THEN
    CREATE TRIGGER update_leaderboard_settings_modtime
      BEFORE UPDATE ON public.festival_leaderboard_settings
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_poster_templates_modtime') THEN
    CREATE TRIGGER update_poster_templates_modtime
      BEFORE UPDATE ON public.poster_templates
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
