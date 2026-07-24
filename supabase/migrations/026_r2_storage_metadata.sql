-- Migration 025: Cloudflare R2 file_metadata
CREATE TABLE file_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  festival_id uuid REFERENCES festival_calendar(id),
  asset_type text NOT NULL, -- 'poster', 'certificate', 'template', 'export', 'logo'
  file_url text NOT NULL,
  bucket_name text NOT NULL,
  object_key text NOT NULL,
  content_type text NOT NULL,
  file_size bigint NOT NULL,
  visibility text DEFAULT 'private', -- 'public', 'private', 'signed'
  is_public boolean DEFAULT false,
  expires_at timestamptz,
  uploaded_at timestamptz DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE file_metadata ENABLE ROW LEVEL SECURITY;

-- 1. Public can read public assets (posters, logos)
CREATE POLICY "Public can read public assets" ON file_metadata
  FOR SELECT USING (visibility = 'public' OR is_public = true);

-- 2. Authenticated users can read certificates
CREATE POLICY "Authenticated users can read certificates" ON file_metadata
  FOR SELECT TO authenticated USING (asset_type = 'certificate');

-- 3. Tenant Admins can do everything
CREATE POLICY "Enable all access for admins based on tenant_id" ON file_metadata
  FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());
