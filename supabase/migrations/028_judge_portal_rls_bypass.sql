-- ============================================================
-- Migration 027: Judge Portal RLS Bypass and Policies
-- Allows anonymous/public judge portal sessions to select
-- registrations and manage mark entries safely.
-- ============================================================

-- 1. RPC: SECURITY DEFINER to safely read registrations for a schedule anonymously
CREATE OR REPLACE FUNCTION public.get_judge_registrations(p_schedule_id uuid)
RETURNS TABLE (
  id uuid,
  item_id uuid,
  tenant_id uuid,
  code_letter text,
  participant_name text,
  chest_number text,
  photo_url text,
  category_code text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    r.id,
    r.item_id,
    r.tenant_id,
    r.code_letter,
    p.name AS participant_name,
    p.chest_number,
    p.photo_url,
    p.category_code
  FROM registrations r
  JOIN schedules s ON s.id = p_schedule_id
  LEFT JOIN participants p ON p.id = r.participant_id
  WHERE r.item_id = s.item_id
    AND r.tenant_id = s.tenant_id
    AND r.code_letter IS NOT NULL
  ORDER BY r.code_letter;
$$;

GRANT EXECUTE ON FUNCTION public.get_judge_registrations(uuid) TO public, anon, authenticated;

-- 2. Open up mark_entries policies for public/anon roles to safely upsert criteria scores
-- Allow SELECT for all roles (including anon/public)
DROP POLICY IF EXISTS "Public select for mark entries" ON mark_entries;
CREATE POLICY "Public select for mark entries"
ON mark_entries FOR SELECT TO public, anon, authenticated
USING (true);

-- Allow INSERT for all roles (including anon/public)
DROP POLICY IF EXISTS "Public insert for judge tokens" ON mark_entries;
CREATE POLICY "Public insert for judge tokens"
ON mark_entries FOR INSERT TO public, anon, authenticated
WITH CHECK (true);

-- Allow UPDATE for all roles (including anon/public)
DROP POLICY IF EXISTS "Public update for mark entries" ON mark_entries;
CREATE POLICY "Public update for mark entries"
ON mark_entries FOR UPDATE TO public, anon, authenticated
USING (true)
WITH CHECK (true);

-- 3. Add UNIQUE constraint to mark_entries to support upsert ON CONFLICT specification
ALTER TABLE mark_entries
  ADD CONSTRAINT unique_schedule_judge_registration
  UNIQUE (schedule_id, judge_id, registration_id);

NOTIFY pgrst, 'reload schema';
