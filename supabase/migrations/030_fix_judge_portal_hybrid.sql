-- ============================================================
-- Migration 029: Fix Judge Portal Hybrid Registrations
-- Removes the strict tenant_id match so that registrations from 
-- child units (which have different tenant_ids) are visible in the 
-- judge portal for the scheduled item.
-- ============================================================

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
    AND r.code_letter IS NOT NULL
  ORDER BY r.code_letter;
$$;

NOTIFY pgrst, 'reload schema';
