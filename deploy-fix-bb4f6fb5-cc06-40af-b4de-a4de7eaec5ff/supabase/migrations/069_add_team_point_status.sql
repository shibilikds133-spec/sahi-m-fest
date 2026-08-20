-- Add a persisted admin setting for Official Team Point Status
ALTER TABLE public.festival_leaderboard_settings
ADD COLUMN IF NOT EXISTS team_point_status text DEFAULT NULL;

-- Update the RPC to return this new column
DROP FUNCTION IF EXISTS public.get_public_leaderboard_settings(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_public_leaderboard_settings(
  p_tenant_id uuid DEFAULT NULL,
  p_festival_id uuid DEFAULT NULL
)
RETURNS TABLE (
  festival_id uuid,
  festival_level text,
  is_public_visible boolean,
  show_individual_rankings boolean,
  team_point_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_festival_id uuid;
BEGIN
  IF p_festival_id IS NOT NULL THEN
    v_festival_id := p_festival_id;
  ELSE
    SELECT id INTO v_festival_id
    FROM festival_calendar
    WHERE is_active IS TRUE
      AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ORDER BY festival_year DESC, start_date DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_festival_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    fc.id AS festival_id,
    fc.level AS festival_level,
    COALESCE(settings.is_public_visible, false) AS is_public_visible,
    COALESCE(settings.show_individual_rankings, true) AS show_individual_rankings,
    settings.team_point_status AS team_point_status
  FROM festival_calendar fc
  LEFT JOIN festival_leaderboard_settings settings
    ON settings.festival_id = fc.id
  WHERE fc.id = v_festival_id
    AND COALESCE(settings.is_public_visible, false) IS TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_leaderboard_settings(uuid, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
