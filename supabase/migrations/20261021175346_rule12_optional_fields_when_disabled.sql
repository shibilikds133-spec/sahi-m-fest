BEGIN;

-- Rule 12 values are only required while the minimum-team rule is enabled.
-- The write validator still requires the switch itself to be a boolean.
-- Existing rows and values are preserved; disabled rules may store NULL values.
ALTER TABLE public.points_config
  ALTER COLUMN rule12_min_teams DROP NOT NULL,
  ALTER COLUMN rule12_behavior DROP NOT NULL,
  ALTER COLUMN rule12_behavior DROP DEFAULT;

ALTER TABLE public.points_config
  DROP CONSTRAINT IF EXISTS points_config_rule12_min_teams_check,
  ADD CONSTRAINT points_config_rule12_min_teams_check
    CHECK (
      NOT COALESCE(less_than_3_teams_rule, false)
      OR (rule12_min_teams IS NOT NULL AND rule12_min_teams >= 1)
    ),
  DROP CONSTRAINT IF EXISTS points_config_rule12_behavior_check,
  ADD CONSTRAINT points_config_rule12_behavior_check
    CHECK (
      NOT COALESCE(less_than_3_teams_rule, false)
      OR (rule12_behavior IS NOT NULL AND rule12_behavior IN ('grade_only', 'rank_and_grade', 'no_points'))
    );

-- Keep every existing validation; only skip Rule 12 fields when its switch is
-- false. The shared save/write triggers still validate the rest of the config.
CREATE OR REPLACE FUNCTION scoring_private.validate_config(p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE k text; a numeric; prev numeric; b jsonb; f jsonb; rows jsonb; max_end integer; first_row boolean;
  min_start integer; max_value integer; keys text[]; names text[]; boost_key text; i integer;
BEGIN
  FOREACH k IN ARRAY ARRAY['rank_1_points','rank_2_points','rank_3_points'] LOOP PERFORM scoring_private.whole(p->k); END LOOP;
  prev := NULL;
  FOREACH k IN ARRAY ARRAY['a_plus','a','b','c'] LOOP
    IF jsonb_typeof(p->'grade_thresholds'->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Complete grade percentage thresholds.'; END IF;
    a := (p->'grade_thresholds'->>k)::numeric;
    IF a<0 OR a>100 OR (prev IS NOT NULL AND a>=prev) THEN RAISE EXCEPTION 'Grade percentages must be ordered A+ > A > B > C.'; END IF;
    prev := a;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['separate_group_brackets','auto_bracket_selection','allow_bracket_override','less_than_3_teams_rule','enable_grace_marks'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Complete scoring switches: %', k; END IF;
  END LOOP;
  IF (p->>'less_than_3_teams_rule')::boolean THEN
    PERFORM scoring_private.whole(p->'rule12_min_teams',true);
    IF p->>'rule12_behavior' IS NULL OR p->>'rule12_behavior' NOT IN ('grade_only','rank_and_grade','no_points') THEN
      RAISE EXCEPTION 'Complete minimum-team behaviour.';
    END IF;
  END IF;
  FOREACH k IN ARRAY ARRAY['grade_boost_item_ids','rank_boost_item_ids','grace_fields'] LOOP
    IF jsonb_typeof(p->k) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid configuration list: %',k; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['point_brackets','group_point_brackets'] LOOP
    IF k='group_point_brackets' AND NOT (p->>'separate_group_brackets')::boolean THEN CONTINUE; END IF;
    rows:=p->k; keys:='{}'; max_end:=NULL; first_row:=true;
    IF jsonb_typeof(rows) IS DISTINCT FROM 'array' OR jsonb_array_length(rows)=0 THEN RAISE EXCEPTION 'Add configured participant brackets.'; END IF;
    boost_key:=CASE WHEN k='point_brackets' THEN 'grade_boost_points' ELSE 'group_grade_boost_points' END;
    FOR b IN SELECT value FROM jsonb_array_elements(rows) ORDER BY (value->>'min')::numeric LOOP
      min_start:=scoring_private.whole(b->'min',true);
      IF NOT b ? 'max' THEN RAISE EXCEPTION 'A bracket maximum or explicit open end is required.'; END IF;
      max_value:=CASE WHEN b->'max'='null'::jsonb THEN NULL ELSE scoring_private.whole(b->'max',true) END;
      IF max_value<min_start OR nullif(btrim(b->>'key'),'') IS NULL OR (b->>'key')=ANY(keys) THEN RAISE EXCEPTION 'Invalid or duplicate bracket.'; END IF;
      keys:=array_append(keys,b->>'key');
      IF jsonb_typeof(b->'points') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'points')<>4 THEN RAISE EXCEPTION 'Complete every grade value in each bracket.'; END IF;
      FOR i IN 0..3 LOOP PERFORM scoring_private.whole(b->'points'->i); END LOOP;
      IF COALESCE((b->>'enabled')::boolean,true) THEN
        IF NOT first_row AND (max_end IS NULL OR min_start<=max_end) THEN RAISE EXCEPTION 'Enabled bracket ranges overlap.'; END IF;
        first_row:=false; max_end:=max_value;
        IF jsonb_array_length(p->'grade_boost_item_ids')>0 THEN
          f:=p->boost_key->(b->>'key');
          IF jsonb_typeof(f) IS DISTINCT FROM 'array' OR jsonb_array_length(f)<>4 THEN RAISE EXCEPTION 'Complete boosted grade values for bracket %.',b->>'key'; END IF;
          FOR i IN 0..3 LOOP PERFORM scoring_private.whole(f->i); END LOOP;
        END IF;
      END IF;
    END LOOP;
    IF first_row THEN RAISE EXCEPTION 'At least one bracket must be enabled.'; END IF;
  END LOOP;
  IF jsonb_array_length(p->'rank_boost_item_ids')>0 THEN
    IF jsonb_typeof(p->'rank_boost_points') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rank_boost_points')<>3 THEN RAISE EXCEPTION 'Complete boosted rank values.'; END IF;
    FOR i IN 0..2 LOOP PERFORM scoring_private.whole(p->'rank_boost_points'->i); END LOOP;
  END IF;
  keys:='{}'; names:='{}';
  FOR f IN SELECT value FROM jsonb_array_elements(p->'grace_fields') LOOP
    PERFORM (f->>'id')::uuid;
    IF nullif(f->>'id','') IS NULL OR (f->>'id')=ANY(keys) OR nullif(btrim(f->>'name'),'') IS NULL OR lower(btrim(f->>'name'))=ANY(names) THEN RAISE EXCEPTION 'Grace fields need unique IDs and names.'; END IF;
    PERFORM scoring_private.whole(f->'max_marks',true);
    keys:=array_append(keys,f->>'id'); names:=array_append(names,lower(btrim(f->>'name')));
  END LOOP;
END $$;

COMMIT;
