CREATE TABLE IF NOT EXISTS public.poster_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.poster_templates(id) ON DELETE CASCADE,
  editor_id uuid REFERENCES public.profiles(id),
  content jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS poster_drafts_template_editor_idx
  ON public.poster_drafts(template_id, editor_id);

ALTER TABLE public.poster_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editors can manage their own drafts" ON public.poster_drafts;
CREATE POLICY "Editors can manage their own drafts"
  ON public.poster_drafts FOR ALL TO authenticated
  USING (editor_id = auth.uid());

-- poster_versions: explicit save versions
CREATE TABLE IF NOT EXISTS public.poster_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.poster_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL,
  editor_id uuid REFERENCES public.profiles(id),
  label text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poster_versions_template_idx ON public.poster_versions(template_id);

ALTER TABLE public.poster_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage poster versions" ON public.poster_versions;
CREATE POLICY "Admins can manage poster versions"
  ON public.poster_versions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role IN ('super_admin', 'tenant_admin', 'admin') OR profiles.is_superadmin = true)
    )
  );

-- poster_approval_requests: publish approval workflow
CREATE TABLE IF NOT EXISTS public.poster_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.poster_templates(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES public.profiles(id),
  reviewed_by uuid REFERENCES public.profiles(id),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  reviewer_comment text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.poster_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage approval requests" ON public.poster_approval_requests;
CREATE POLICY "Admins can manage approval requests"
  ON public.poster_approval_requests FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role IN ('super_admin', 'tenant_admin', 'admin') OR profiles.is_superadmin = true)
    )
  );

-- Add status column to existing poster_templates if not present
ALTER TABLE public.poster_templates
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'published'));

-- Add layers column to store rich Konva layer JSON
ALTER TABLE public.poster_templates
  ADD COLUMN IF NOT EXISTS layers jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.poster_templates
  ADD COLUMN IF NOT EXISTS schema_version text DEFAULT '1.0';
