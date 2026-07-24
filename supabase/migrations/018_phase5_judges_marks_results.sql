-- ==============================================================================
-- Migration 018: Phase 5 - Judges, Mark Entries, and Results Setup
-- This master SQL sets up all the required constraints and security policies
-- (Row Level Security) for the Judges, Mark Entries, and Results tables.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. JUDGES TABLE
-- ------------------------------------------------------------------------------
ALTER TABLE judges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON judges;
CREATE POLICY "Enable read access for all authenticated users"
ON judges FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins can manage their judges" ON judges;
CREATE POLICY "Admins can manage their judges"
ON judges FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());


-- ------------------------------------------------------------------------------
-- 2. MARK ENTRIES TABLE (Constraints & Policies)
-- ------------------------------------------------------------------------------
-- Add unique constraint for upserting mark entries (prevent duplicates per judge per participant)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mark_entries_unique') THEN
        ALTER TABLE mark_entries ADD CONSTRAINT mark_entries_unique UNIQUE (schedule_id, judge_id, registration_id);
    END IF;
END $$;

ALTER TABLE mark_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON mark_entries;
CREATE POLICY "Enable read access for all authenticated users"
ON mark_entries FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Admins and judges can manage mark entries" ON mark_entries;
CREATE POLICY "Admins and judges can manage mark entries"
ON mark_entries FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());


-- ------------------------------------------------------------------------------
-- 3. RESULTS TABLE (Constraints & Policies)
-- ------------------------------------------------------------------------------
-- Add unique constraint for upserting final results
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'results_registration_unique') THEN
        ALTER TABLE results ADD CONSTRAINT results_registration_unique UNIQUE (registration_id);
    END IF;
END $$;

ALTER TABLE results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON results;
CREATE POLICY "Enable read access for all authenticated users"
ON results FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Enable all access for admins based on tenant_id" ON results;
CREATE POLICY "Enable all access for admins based on tenant_id"
ON results FOR ALL TO authenticated
USING (tenant_id = public.get_my_tenant_id() OR public.is_superadmin())
WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_superadmin());

-- ==============================================================================
-- End of Migration 018
-- ==============================================================================
