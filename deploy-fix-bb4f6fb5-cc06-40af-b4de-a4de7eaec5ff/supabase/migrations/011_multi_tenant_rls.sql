-- ============================================================
-- Migration 011: Multi-Tenant Row Level Security (RLS)
-- Enforces data isolation so each tenant only sees their own data.
-- ============================================================

-- 1. Enable RLS on core tables
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_calendar ENABLE ROW LEVEL SECURITY;

-- 2. Helper function to get current user's tenant_id and superadmin status efficiently
CREATE OR REPLACE FUNCTION public.get_my_tenant_id() RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_superadmin() RETURNS boolean AS $$
  SELECT is_superadmin FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Define Policies

-- --- Organisations ---
CREATE POLICY "Superadmins can see all organisations" 
ON organisations FOR ALL TO authenticated 
USING (public.is_superadmin());

CREATE POLICY "Admins can see their own organisation" 
ON organisations FOR SELECT TO authenticated 
USING (tenant_id = public.get_my_tenant_id());

-- --- Profiles ---
CREATE POLICY "Users can see their own profile" 
ON profiles FOR SELECT TO authenticated 
USING (id = auth.uid());

CREATE POLICY "Superadmins can see all profiles" 
ON profiles FOR ALL TO authenticated 
USING (public.is_superadmin());

-- --- Tenants ---
CREATE POLICY "Users can see their own tenant record" 
ON tenants FOR SELECT TO authenticated 
USING (id = public.get_my_tenant_id());

CREATE POLICY "Superadmins can see all tenants" 
ON tenants FOR ALL TO authenticated 
USING (public.is_superadmin());

-- --- Participants ---
CREATE POLICY "Admins can manage their own participants" 
ON participants FOR ALL TO authenticated 
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- --- Registrations ---
CREATE POLICY "Admins can manage their own registrations" 
ON registrations FOR ALL TO authenticated 
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- --- Global Data (Items, Categories, Calendar) ---
-- If tenant_id is NULL, it's global data (from handbook). 
-- Otherwise, it's tenant-specific.
CREATE POLICY "View local or global items" 
ON items FOR SELECT TO authenticated 
USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY "View local or global categories" 
ON categories FOR SELECT TO authenticated 
USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

CREATE POLICY "View local or global calendar" 
ON festival_calendar FOR SELECT TO authenticated 
USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin());
