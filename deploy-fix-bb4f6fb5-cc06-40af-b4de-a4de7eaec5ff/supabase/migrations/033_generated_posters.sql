-- Migration 032: Generated Posters Metadata and Historical Snapshots

CREATE TABLE IF NOT EXISTS public.generated_posters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.poster_templates(id) ON DELETE SET NULL,
  template_version int NOT NULL,
  file_url text NOT NULL,
  object_key text NOT NULL,
  leaderboard_snapshot jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generated_posters ENABLE ROW LEVEL SECURITY;

-- 1. Admins can manage generated posters
CREATE POLICY "Admins can manage generated posters"
  ON public.generated_posters
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('super_admin', 'tenant_admin')
      AND (profiles.tenant_id = generated_posters.tenant_id OR profiles.role = 'super_admin')
    )
  );

-- 2. Public can read generated posters
CREATE POLICY "Public can read generated posters"
  ON public.generated_posters
  FOR SELECT
  TO anon, authenticated
  USING (true);
