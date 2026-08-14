-- Stage Management must list tenant/festival venues even when no schedule has
-- been created for a venue yet. Keep the same admin and active-festival scope
-- as the Stage Management schedule RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_stage_management_venues(p_festival_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  festival_id uuid,
  name text,
  location text,
  capacity integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := public.stage_assert_admin_access();

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar f
    WHERE f.id = p_festival_id
      AND f.tenant_id = v_tenant_id
      AND f.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'The requested festival is not active for this tenant.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, v.tenant_id, v.festival_id, v.name, v.location, v.capacity
  FROM public.venues v
  WHERE v.tenant_id = v_tenant_id
    AND v.festival_id = p_festival_id
  ORDER BY v.name, v.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stage_management_venues(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_venues(uuid) TO authenticated;

COMMIT;
