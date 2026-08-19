-- Make one points configuration authoritative per tenant/festival.
-- Read-only preflight completed before this migration: no duplicate non-null
-- tenant_id/festival_id pairs were found in the current data.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.points_config'::regclass
      AND conname = 'points_config_tenant_festival_key'
  ) THEN
    ALTER TABLE public.points_config
      ADD CONSTRAINT points_config_tenant_festival_key
      UNIQUE (tenant_id, festival_id);
  END IF;
END;
$$;

COMMENT ON CONSTRAINT points_config_tenant_festival_key ON public.points_config
  IS 'One active points configuration row per tenant and festival; required for deterministic upsert and reads.';

-- Points calculation is an authenticated operational RPC, never an anonymous
-- public endpoint. The function itself also validates tenant ownership.
REVOKE ALL ON FUNCTION public.calculate_festival_points(
  uuid, text, integer, integer, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_festival_points(
  uuid, text, integer, integer, boolean, text
) TO authenticated;

COMMIT;
