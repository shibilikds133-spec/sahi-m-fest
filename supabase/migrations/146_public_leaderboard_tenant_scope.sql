-- Public leaderboard tenant-scope hardening.
--
-- The legacy public RPCs accept nullable tenant/festival arguments for
-- backwards compatibility. The public web page now uses these required-scope
-- wrappers so a mismatched tenant/festival pair can never return another
-- tenant's public results.

CREATE OR REPLACE FUNCTION public.get_public_leaderboard_scoped(
  p_tenant_id uuid,
  p_festival_id uuid
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_festival_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar fc
    WHERE fc.id = p_festival_id
      AND fc.tenant_id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(row_data)
  FROM public.get_public_leaderboard(p_tenant_id, p_festival_id) AS row_data;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_published_results_scoped(
  p_tenant_id uuid,
  p_festival_id uuid,
  p_include_participant_details boolean DEFAULT true
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_festival_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.festival_calendar fc
    WHERE fc.id = p_festival_id
      AND fc.tenant_id = p_tenant_id
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT to_jsonb(row_data)
  FROM public.get_public_published_results(
    p_tenant_id,
    p_festival_id,
    p_include_participant_details
  ) AS row_data;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_scoped(uuid, uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_published_results_scoped(uuid, uuid, boolean)
  TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
