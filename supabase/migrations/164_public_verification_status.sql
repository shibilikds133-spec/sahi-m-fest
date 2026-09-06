-- Security Definer function to safely check if a schedule has marks or results without exposing sensitive data
CREATE OR REPLACE FUNCTION public.get_public_verification_status(p_tenant_id uuid)
RETURNS TABLE (
  schedule_id uuid,
  has_results boolean,
  has_marks boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    s.id AS schedule_id,
    EXISTS (SELECT 1 FROM results r WHERE r.item_id = s.item_id) AS has_results,
    EXISTS (SELECT 1 FROM mark_entries m WHERE m.schedule_id = s.id AND m.is_final = true) AS has_marks
  FROM schedules s
  WHERE s.tenant_id = p_tenant_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_verification_status(uuid) TO anon, authenticated;
