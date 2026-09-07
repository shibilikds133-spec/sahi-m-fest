-- Fix: Points Calculation Logic
-- Separates `group_size` (determines bracket) from `competing_teams_count` (determines Rule 12).
-- Previously both used a single `p_participant_count` which caused wrong bracket & Rule 12 results.

CREATE OR REPLACE FUNCTION public.calculate_festival_points(
  p_festival_id uuid,
  p_grade text,
  p_rank integer,
  p_group_size integer,             -- How many members per team entry (e.g., 10 for Daf team)
  p_competing_teams_count integer,  -- How many teams competed (for Rule 12 check)
  p_is_group boolean DEFAULT false,
  p_bracket_override text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.points_config%ROWTYPE;
  v_brackets jsonb;
  v_bracket jsonb;
  v_grade_index integer;
  v_grade_points integer := 0;
  v_rank_points integer := 0;
  v_rule12_applies boolean := false;
  v_rule12_behavior text;
BEGIN
  SELECT pc.*
  INTO v_config
  FROM public.points_config pc
  WHERE pc.festival_id = p_festival_id
  ORDER BY pc.config_version DESC
  LIMIT 1;

  IF v_config.id IS NULL THEN
    RAISE EXCEPTION 'Points configuration is missing for this festival.';
  END IF;

  IF NOT (
    public.is_superadmin()
    OR v_config.tenant_id = public.get_my_tenant_id()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to calculate points for this festival.';
  END IF;

  -- Choose bracket list based on whether this is a group item with separate brackets
  v_brackets := CASE
    WHEN p_is_group AND v_config.separate_group_brackets
      THEN v_config.group_point_brackets
    ELSE v_config.point_brackets
  END;

  -- Try bracket override first
  IF p_bracket_override IS NOT NULL AND v_config.allow_bracket_override THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND bracket.value->>'key' = p_bracket_override
    LIMIT 1;
  END IF;

  -- Auto-select bracket based on GROUP SIZE (how many members per team entry)
  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND p_group_size >= (bracket.value->>'min')::integer
      AND (
        bracket.value->'max' IS NULL
        OR bracket.value->'max' = 'null'::jsonb
        OR p_group_size <= (bracket.value->>'max')::integer
      )
    ORDER BY (bracket.value->>'min')::integer DESC
    LIMIT 1;
  END IF;

  -- Fallback: pick largest bracket with min <= group_size
  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND (bracket.value->>'min')::integer <= p_group_size
    ORDER BY (bracket.value->>'min')::integer DESC
    LIMIT 1;
  END IF;

  -- Last resort: first enabled bracket
  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
    ORDER BY (bracket.value->>'min')::integer ASC
    LIMIT 1;
  END IF;

  IF v_bracket IS NULL THEN
    RAISE EXCEPTION 'No enabled point bracket matches the group size.';
  END IF;

  v_grade_index := CASE p_grade
    WHEN 'A+' THEN 0
    WHEN 'A'  THEN 1
    WHEN 'B'  THEN 2
    WHEN 'C'  THEN 3
    ELSE NULL
  END;

  IF v_grade_index IS NOT NULL THEN
    v_grade_points := COALESCE(
      (v_bracket->'points'->>v_grade_index)::integer,
      0
    );
  END IF;

  v_rank_points := CASE p_rank
    WHEN 1 THEN COALESCE(v_config.rank_1_points, 5)
    WHEN 2 THEN COALESCE(v_config.rank_2_points, 3)
    WHEN 3 THEN COALESCE(v_config.rank_3_points, 1)
    ELSE 0
  END;

  -- Rule 12: based on COMPETING TEAMS COUNT (not group size!)
  v_rule12_applies :=
    v_config.less_than_3_teams_rule
    AND p_competing_teams_count < v_config.rule12_min_teams;
  v_rule12_behavior := COALESCE(v_config.rule12_behavior, 'grade_only');

  IF v_rule12_applies AND v_rule12_behavior = 'grade_only' THEN
    v_rank_points := 0;
  ELSIF v_rule12_applies AND v_rule12_behavior = 'no_points' THEN
    v_rank_points := 0;
    v_grade_points := 0;
  END IF;

  RETURN jsonb_build_object(
    'total',                v_rank_points + v_grade_points,
    'rank_points',          v_rank_points,
    'grade_points',         v_grade_points,
    'bracket_key',          v_bracket->>'key',
    'bracket_label',        v_bracket->>'label',
    'rule12_applied',       v_rule12_applies,
    'rule12_behavior',      v_rule12_behavior,
    'grade_only',           v_rule12_applies AND v_rule12_behavior = 'grade_only',
    'config_version',       v_config.config_version,
    'points_mode',          v_config.points_mode,
    'group_size',           p_group_size,
    'competing_teams_count',p_competing_teams_count,
    'is_group',             p_is_group
  );
END;
$$;

-- Keep backward-compatible overloaded signature with old single param for safety
-- (Will be removed in future migration once all callers are updated)
CREATE OR REPLACE FUNCTION public.calculate_festival_points(
  p_festival_id uuid,
  p_grade text,
  p_rank integer,
  p_participant_count integer,
  p_is_group boolean DEFAULT false,
  p_bracket_override text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Legacy shim: treats participant_count as group_size.
  -- competing_teams_count defaults to participant_count to preserve old behavior.
  SELECT public.calculate_festival_points(
    p_festival_id,
    p_grade,
    p_rank,
    p_participant_count,
    p_participant_count,
    p_is_group,
    p_bracket_override
  );
$$;

REVOKE ALL ON FUNCTION public.calculate_festival_points(uuid, text, integer, integer, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_festival_points(uuid, text, integer, integer, integer, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.calculate_festival_points(uuid, text, integer, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_festival_points(uuid, text, integer, integer, boolean, text) TO authenticated;
