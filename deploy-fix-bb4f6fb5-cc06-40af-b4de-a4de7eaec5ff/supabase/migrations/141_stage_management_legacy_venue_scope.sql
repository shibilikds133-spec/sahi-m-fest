-- Legacy Schedule Management venues were created without festival_id. When a
-- tenant has exactly one active festival, safely expose those legacy venues
-- in Stage Management under that unambiguous active-festival context.

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
  SELECT v.id, v.tenant_id, p_festival_id, v.name, v.location, v.capacity
  FROM public.venues v
  WHERE v.tenant_id = v_tenant_id
    AND (
      v.festival_id = p_festival_id
      OR (
        v.festival_id IS NULL
        AND (
          SELECT count(*)
          FROM public.festival_calendar legacy_festival
          WHERE legacy_festival.tenant_id = v_tenant_id
            AND legacy_festival.is_active IS TRUE
        ) = 1
      )
    )
  ORDER BY v.name, v.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stage_management_venues(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stage_management_venues(uuid) TO authenticated;

COMMIT;
