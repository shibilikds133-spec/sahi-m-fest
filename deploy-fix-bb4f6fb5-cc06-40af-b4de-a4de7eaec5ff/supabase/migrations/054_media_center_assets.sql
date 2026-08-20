-- 053_media_center_assets.sql

-- Types for generated assets (safe idempotent creation)
DO $$ BEGIN
  CREATE TYPE asset_type_enum AS ENUM ('poster', 'certificate', 'leaderboard');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE export_status_enum AS ENUM ('queued', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE export_resolution_enum AS ENUM ('thumb', 'share', 'standard', 'hd', 'print');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Table: generated_assets (stores the final successful media records)
CREATE TABLE IF NOT EXISTS public.generated_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    festival_id UUID REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.items(id) ON DELETE CASCADE,
    result_id UUID REFERENCES public.results(id) ON DELETE CASCADE,
    asset_type asset_type_enum NOT NULL DEFAULT 'poster',
    template_id TEXT,
    render_hash TEXT,
    resolution export_resolution_enum NOT NULL,
    storage_path TEXT NOT NULL,
    public_url TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: export_jobs (stores the async persistent queue for the browser to pick up)
CREATE TABLE IF NOT EXISTS public.export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    festival_id UUID REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    status export_status_enum NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_generated_assets_result_id ON public.generated_assets(result_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_festival_id ON public.generated_assets(festival_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_render_hash ON public.generated_assets(render_hash);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON public.export_jobs(status);
CREATE INDEX IF NOT EXISTS idx_export_jobs_festival_id ON public.export_jobs(festival_id);

-- RLS Policies
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.export_jobs ENABLE ROW LEVEL SECURITY;

-- Admins can manage generated_assets
DROP POLICY IF EXISTS "Admins can manage generated_assets" ON public.generated_assets;
CREATE POLICY "Admins can manage generated_assets"
  ON public.generated_assets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role IN ('super_admin', 'tenant_admin', 'admin') OR profiles.is_superadmin = true)
    )
  );

-- Admins can manage export_jobs
DROP POLICY IF EXISTS "Admins can manage export_jobs" ON public.export_jobs;
CREATE POLICY "Admins can manage export_jobs"
  ON public.export_jobs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role IN ('super_admin', 'tenant_admin', 'admin') OR profiles.is_superadmin = true)
    )
  );
