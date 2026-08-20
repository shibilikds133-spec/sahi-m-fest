-- ============================================================
-- Migration 012: Clean Up Old Policies and Enforce RLS Strictly
-- Drops any overly permissive default policies that might exist
-- from earlier development.
-- ============================================================

-- 1. Ensure RLS is enabled
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- 2. Drop any potentially existing public read policies (common in early dev)
DO $$
DECLARE
    pol record;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') 
    LOOP
        -- We want to drop old policies that might be allowing everything.
        -- We won't drop the ones starting with "Admins can" or "Superadmins can" or "Users can" 
        -- which we just created, but we will drop things like "Enable public read access"
        IF pol.tablename IN ('participants', 'organisations', 'profiles', 'tenants') 
           AND pol.policyname NOT LIKE 'Admins can%' 
           AND pol.policyname NOT LIKE 'Superadmins can%'
           AND pol.policyname NOT LIKE 'Users can%' THEN
            EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
        END IF;
    END LOOP;
END
$$;

-- 3. Also ensure that our tenant helper function is strictly tied to the CURRENT logged in user's tenant
-- It is already correct, but just as a sanity check:
CREATE OR REPLACE FUNCTION public.get_my_tenant_id() RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;
