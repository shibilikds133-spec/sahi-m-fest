-- Flexible, version-ready points configuration.
-- Existing rows retain the current official values through backward-compatible defaults.

ALTER TABLE public.points_config
  ADD COLUMN IF NOT EXISTS points_mode text NOT NULL DEFAULT 'hybrid',
  ADD COLUMN IF NOT EXISTS grade_thresholds jsonb NOT NULL
    DEFAULT '{"a_plus":90,"a":75,"b":60,"c":50}'::jsonb,
  ADD COLUMN IF NOT EXISTS point_brackets jsonb NOT NULL
    DEFAULT '[
      {"key":"1","label":"1","min":1,"max":1,"points":[6,5,3,1],"enabled":true},
      {"key":"2","label":"2","min":2,"max":2,"points":[7,6,4,2],"enabled":true},
      {"key":"3","label":"3","min":3,"max":3,"points":[10,9,6,3],"enabled":true},
      {"key":"4-5","label":"4–5","min":4,"max":5,"points":[18,15,10,5],"enabled":true},
      {"key":"6-10","label":"6–10","min":6,"max":10,"points":[25,20,12,6],"enabled":true}
    ]'::jsonb,
  ADD COLUMN IF NOT EXISTS group_point_brackets jsonb NOT NULL
    DEFAULT '[
      {"key":"1","label":"1","min":1,"max":1,"points":[6,5,3,1],"enabled":true},
      {"key":"2","label":"2","min":2,"max":2,"points":[7,6,4,2],"enabled":true},
      {"key":"3","label":"3","min":3,"max":3,"points":[10,9,6,3],"enabled":true},
      {"key":"4-5","label":"4–5","min":4,"max":5,"points":[18,15,10,5],"enabled":true},
      {"key":"6-10","label":"6–10","min":6,"max":10,"points":[25,20,12,6],"enabled":true}
    ]'::jsonb,
  ADD COLUMN IF NOT EXISTS separate_group_brackets boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_bracket_selection boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_bracket_override boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS rule12_min_teams integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS rule12_behavior text NOT NULL DEFAULT 'grade_only',
  ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS change_reason text;

ALTER TABLE public.points_config
  DROP CONSTRAINT IF EXISTS points_config_points_mode_check,
  ADD CONSTRAINT points_config_points_mode_check
    CHECK (points_mode IN ('official', 'hybrid', 'custom')),
  DROP CONSTRAINT IF EXISTS points_config_rule12_behavior_check,
  ADD CONSTRAINT points_config_rule12_behavior_check
    CHECK (rule12_behavior IN ('grade_only', 'rank_and_grade', 'no_points')),
  DROP CONSTRAINT IF EXISTS points_config_rule12_min_teams_check,
  ADD CONSTRAINT points_config_rule12_min_teams_check
    CHECK (rule12_min_teams >= 1);

ALTER TABLE public.results
  ADD COLUMN IF NOT EXISTS points_config_version integer,
  ADD COLUMN IF NOT EXISTS points_calculation jsonb;

ALTER TABLE public.schedules
  DROP CONSTRAINT IF EXISTS chk_official_participant_bracket;

CREATE TABLE IF NOT EXISTS public.points_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar(id) ON DELETE CASCADE,
  config_version integer NOT NULL,
  config_snapshot jsonb NOT NULL,
  change_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (festival_id, config_version)
);

ALTER TABLE public.points_config_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant admins can read points config versions"
  ON public.points_config_versions;
CREATE POLICY "Tenant admins can read points config versions"
ON public.points_config_versions
FOR SELECT TO authenticated
USING (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

DROP POLICY IF EXISTS "Tenant admins can create points config versions"
  ON public.points_config_versions;
CREATE POLICY "Tenant admins can create points config versions"
ON public.points_config_versions
FOR INSERT TO authenticated
WITH CHECK (
  tenant_id = public.get_my_tenant_id()
  OR public.is_superadmin()
);

CREATE OR REPLACE FUNCTION public.snapshot_points_config_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.config_version IS DISTINCT FROM OLD.config_version THEN
    INSERT INTO public.points_config_versions (
      tenant_id,
      festival_id,
      config_version,
      config_snapshot,
      change_reason,
      created_by
    ) VALUES (
      NEW.tenant_id,
      NEW.festival_id,
      NEW.config_version,
      to_jsonb(NEW),
      NEW.change_reason,
      auth.uid()
    )
    ON CONFLICT (festival_id, config_version)
    DO UPDATE SET
      config_snapshot = EXCLUDED.config_snapshot,
      change_reason = EXCLUDED.change_reason;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_points_config_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.config_version <> OLD.config_version + 1 THEN
    RAISE EXCEPTION
      'Points configuration is stale. Reload the latest version before saving.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_points_config_version
  ON public.points_config;
CREATE TRIGGER trg_enforce_points_config_version
BEFORE UPDATE ON public.points_config
FOR EACH ROW
EXECUTE FUNCTION public.enforce_points_config_version();

DROP TRIGGER IF EXISTS trg_snapshot_points_config_version
  ON public.points_config;
CREATE TRIGGER trg_snapshot_points_config_version
AFTER INSERT OR UPDATE ON public.points_config
FOR EACH ROW
EXECUTE FUNCTION public.snapshot_points_config_version();

INSERT INTO public.points_config_versions (
  tenant_id,
  festival_id,
  config_version,
  config_snapshot,
  change_reason
)
SELECT
  pc.tenant_id,
  pc.festival_id,
  pc.config_version,
  to_jsonb(pc),
  COALESCE(pc.change_reason, 'Initial flexible points configuration')
FROM public.points_config pc
WHERE pc.tenant_id IS NOT NULL
  AND pc.festival_id IS NOT NULL
ON CONFLICT (festival_id, config_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_result_points_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rank_points numeric;
  v_grade_points numeric;
  v_rule12_applied boolean;
  v_rule12_behavior text;
BEGIN
  IF NEW.published IS NOT TRUE OR NEW.points_calculation IS NULL THEN
    RETURN NEW;
  END IF;

  v_rank_points := COALESCE((NEW.points_calculation->>'rank_points')::numeric, 0);
  v_grade_points := COALESCE((NEW.points_calculation->>'grade_points')::numeric, 0);
  v_rule12_applied := COALESCE((NEW.points_calculation->>'rule12_applied')::boolean, false);
  v_rule12_behavior := COALESCE(NEW.points_calculation->>'rule12_behavior', 'grade_only');

  IF v_rank_points < 0 OR v_grade_points < 0 THEN
    RAISE EXCEPTION 'Calculated points cannot be negative.';
  END IF;

  IF COALESCE(NEW.points_awarded, 0) <> v_rank_points + v_grade_points THEN
    RAISE EXCEPTION 'Published points do not match the calculation snapshot.';
  END IF;

  IF v_rule12_applied
    AND v_rule12_behavior = 'grade_only'
    AND v_rank_points <> 0 THEN
    RAISE EXCEPTION 'Rule 12 grade-only results cannot contain rank points.';
  END IF;

  IF NEW.points_config_version IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.points_config_versions pcv
      WHERE pcv.festival_id = NEW.festival_id
        AND pcv.config_version = NEW.points_config_version
    ) THEN
    RAISE EXCEPTION 'Points configuration version does not exist for this festival.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_result_points_snapshot
  ON public.results;
CREATE TRIGGER trg_validate_result_points_snapshot
BEFORE INSERT OR UPDATE ON public.results
FOR EACH ROW
EXECUTE FUNCTION public.validate_result_points_snapshot();

CREATE OR REPLACE FUNCTION public.calculate_festival_points(
  p_festival_id uuid,
  p_grade text,
  p_rank integer,
  p_participant_count integer,
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

  v_brackets := CASE
    WHEN p_is_group AND v_config.separate_group_brackets
      THEN v_config.group_point_brackets
    ELSE v_config.point_brackets
  END;

  IF p_bracket_override IS NOT NULL AND v_config.allow_bracket_override THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND bracket.value->>'key' = p_bracket_override
    LIMIT 1;
  END IF;

  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND p_participant_count >= (bracket.value->>'min')::integer
      AND (
        bracket.value->'max' IS NULL
        OR bracket.value->'max' = 'null'::jsonb
        OR p_participant_count <= (bracket.value->>'max')::integer
      )
    ORDER BY (bracket.value->>'min')::integer DESC
    LIMIT 1;
  END IF;

  IF v_bracket IS NULL THEN
    SELECT bracket.value
    INTO v_bracket
    FROM jsonb_array_elements(v_brackets) bracket
    WHERE COALESCE((bracket.value->>'enabled')::boolean, true)
      AND (bracket.value->>'min')::integer <= p_participant_count
    ORDER BY (bracket.value->>'min')::integer DESC
    LIMIT 1;
  END IF;

  IF v_bracket IS NULL THEN
    RAISE EXCEPTION 'No enabled point bracket matches the participant count.';
  END IF;

  v_grade_index := CASE p_grade
    WHEN 'A+' THEN 0
    WHEN 'A' THEN 1
    WHEN 'B' THEN 2
    WHEN 'C' THEN 3
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

  v_rule12_applies :=
    v_config.less_than_3_teams_rule
    AND p_participant_count < v_config.rule12_min_teams;
  v_rule12_behavior := COALESCE(v_config.rule12_behavior, 'grade_only');

  IF v_rule12_applies AND v_rule12_behavior = 'grade_only' THEN
    v_rank_points := 0;
  ELSIF v_rule12_applies AND v_rule12_behavior = 'no_points' THEN
    v_rank_points := 0;
    v_grade_points := 0;
  END IF;

  RETURN jsonb_build_object(
    'total', v_rank_points + v_grade_points,
    'rank_points', v_rank_points,
    'grade_points', v_grade_points,
    'bracket_key', v_bracket->>'key',
    'bracket_label', v_bracket->>'label',
    'rule12_applied', v_rule12_applies,
    'rule12_behavior', v_rule12_behavior,
    'grade_only', v_rule12_applies AND v_rule12_behavior = 'grade_only',
    'config_version', v_config.config_version,
    'points_mode', v_config.points_mode,
    'participant_count', p_participant_count,
    'is_group', p_is_group
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_festival_points(
  uuid, text, integer, integer, boolean, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_festival_points(
  uuid, text, integer, integer, boolean, text
) TO authenticated;
