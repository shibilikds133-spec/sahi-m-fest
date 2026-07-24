-- ============================================================
-- Migration 007: Flexible Adjacency List Hierarchy
-- Introduces a single 'organisations' table using parent_id
-- for arbitrary hierarchy depths and updates participants
-- to use a single 'organisation_id' foreign key.
-- ============================================================

-- 1. Create organisations table
CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name text NOT NULL,
  org_type text NOT NULL, -- e.g., 'UNIT', 'SECTOR', 'DIVISION', 'DISTRICT', 'STATE'
  parent_id uuid REFERENCES organisations(id),
  created_at timestamptz DEFAULT now()
);

-- 2. Add 'organisation_id' and 'competition_level' to participants
ALTER TABLE participants ADD COLUMN organisation_id uuid REFERENCES organisations(id);
ALTER TABLE participants ADD COLUMN competition_level text;

-- 3. Safety Check: If there are existing participants with 'unit_org_id',
-- we can't reliably map them to actual organisations if the organisations don't exist yet.
-- Given this is new development, we will just prepare the table structure.
-- We will DROP unit_org_id to enforce the new strict schema.

-- Remove index that depends on unit_org_id
DROP INDEX IF EXISTS idx_participants_name_unit;

-- Create new index on the new field
CREATE UNIQUE INDEX idx_participants_name_org ON participants(name, organisation_id) WHERE organisation_id IS NOT NULL;

-- Remove old unit_org_id
ALTER TABLE participants DROP COLUMN unit_org_id;

-- 4. Also update registrations table
ALTER TABLE registrations ADD COLUMN organisation_id uuid REFERENCES organisations(id);

-- Depending on constraints, we might need to drop registrations.unit_org_id as well
ALTER TABLE registrations DROP COLUMN IF EXISTS unit_org_id;

-- 5. Enable RLS on organisations
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of organisations" ON organisations
  FOR SELECT USING (true);

CREATE POLICY "Admins full access to organisations" ON organisations
  FOR ALL USING (true); -- Simplify for prototype, adjust strictly for production

-- Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
