-- Migration 017: Comprehensive Fix for Items Upsert & Tenant Helpers
-- This migration ensures helper functions exist, adds the required unique constraint for upsert, 
-- and configures RLS policies correctly.

-- 1. Ensure profiles has the required superadmin flag
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_superadmin boolean DEFAULT false;

-- 2. Define/Update Helper Functions for RLS
CREATE OR REPLACE FUNCTION public.get_my_tenant_id() RETURNS uuid AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_superadmin() RETURNS boolean AS $$
  SELECT COALESCE(is_superadmin, false) FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. Add Unique Constraint to Items for Upsert Logic
-- (Targets festival_id + item_code combination)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'items_festival_item_unique') THEN
        ALTER TABLE items ADD CONSTRAINT items_festival_item_unique UNIQUE (festival_id, item_code);
    END IF;
END $$;

-- 4. Set RLS Policies for Items table
-- Allow Admins to manage their own items
DROP POLICY IF EXISTS "Admins can manage their own items" ON items;
CREATE POLICY "Admins can manage their own items" 
ON items FOR ALL TO authenticated 
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- Allow all authenticated users to view items (local or global)
DROP POLICY IF EXISTS "View local or global items" ON items;
CREATE POLICY "View local or global items" 
ON items FOR SELECT TO authenticated 
USING (tenant_id IS NULL OR tenant_id = public.get_my_tenant_id() OR public.is_superadmin());
