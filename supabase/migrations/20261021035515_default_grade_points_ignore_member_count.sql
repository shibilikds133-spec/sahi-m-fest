BEGIN;

-- Canonicalize legacy range-shaped configs whenever the authorized save RPC
-- writes them. Keep the lowest enabled row's key and point values, because that
-- is the deterministic default used by the scoring function below. The
-- points_config version trigger retains the previous config snapshot.
CREATE OR REPLACE FUNCTION scoring_private.default_grade_point_map(p_map jsonb,p_key text)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_map) IS DISTINCT FROM 'object' THEN p_map
    WHEN p_key IS NOT NULL AND p_map ? p_key THEN jsonb_build_object(p_key,p_map->p_key)
    ELSE '{}'::jsonb
  END
$$;

CREATE OR REPLACE FUNCTION scoring_private.normalize_default_grade_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE participant jsonb; group_row jsonb; participant_key text; group_key text;
  sections jsonb; section jsonb; point_map jsonb;
BEGIN
  -- Compatibility columns remain present, but cannot re-enable range scoring.
  NEW.member_brackets_enabled:=false;
  NEW.allow_bracket_override:=false;

  IF jsonb_typeof(NEW.point_brackets)='array' THEN
    SELECT entry.value INTO participant FROM jsonb_array_elements(NEW.point_brackets) AS entry(value)
      WHERE COALESCE((entry.value->>'enabled')::boolean,true)
      ORDER BY (entry.value->>'min')::numeric,entry.value->>'key' LIMIT 1;
  END IF;
  IF participant IS NOT NULL AND NULLIF(btrim(participant->>'key'),'') IS NOT NULL THEN
    participant_key:=participant->>'key';
    participant:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(participant,'{label}',to_jsonb('Default grade points'::text),true),
      '{min}','1'::jsonb,true),'{max}','null'::jsonb,true),'{enabled}','true'::jsonb,true);
    NEW.point_brackets:=jsonb_build_array(participant);
    NEW.grade_boost_points:=scoring_private.default_grade_point_map(NEW.grade_boost_points,participant_key);
  END IF;

  IF COALESCE(NEW.separate_group_brackets,false) THEN
    IF jsonb_typeof(NEW.group_point_brackets)='array' THEN
      SELECT entry.value INTO group_row FROM jsonb_array_elements(NEW.group_point_brackets) AS entry(value)
        WHERE COALESCE((entry.value->>'enabled')::boolean,true)
        ORDER BY (entry.value->>'min')::numeric,entry.value->>'key' LIMIT 1;
    END IF;
    IF group_row IS NOT NULL AND NULLIF(btrim(group_row->>'key'),'') IS NOT NULL THEN
      group_key:=group_row->>'key';
      group_row:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(group_row,'{label}',to_jsonb('Default group grade points'::text),true),
        '{min}','1'::jsonb,true),'{max}','null'::jsonb,true),'{enabled}','true'::jsonb,true);
      NEW.group_point_brackets:=jsonb_build_array(group_row);
      NEW.group_grade_boost_points:=scoring_private.default_grade_point_map(NEW.group_grade_boost_points,group_key);
    END IF;
  ELSE
    group_key:=participant_key;
    NEW.group_point_brackets:=NEW.point_brackets;
    NEW.group_grade_boost_points:=scoring_private.default_grade_point_map(NEW.grade_boost_points,group_key);
  END IF;

  IF jsonb_typeof(NEW.grade_boost_sections)='array' THEN
    sections:='[]'::jsonb;
    FOR section IN SELECT entry.value FROM jsonb_array_elements(NEW.grade_boost_sections) AS entry(value) LOOP
      IF jsonb_typeof(section)='object' THEN
        IF participant_key IS NOT NULL AND jsonb_typeof(section->'points')='object' THEN
          point_map:=scoring_private.default_grade_point_map(section->'points',participant_key);
          section:=jsonb_set(section,'{points}',point_map,true);
        END IF;
        IF group_key IS NOT NULL AND jsonb_typeof(section->'group_points')='object' THEN
          point_map:=scoring_private.default_grade_point_map(section->'group_points',group_key);
          section:=jsonb_set(section,'{group_points}',point_map,true);
        END IF;
      END IF;
      sections:=sections||jsonb_build_array(section);
    END LOOP;
    NEW.grade_boost_sections:=sections;
  END IF;
  RETURN NEW;
END $$;

-- PostgreSQL fires same-timing triggers alphabetically. This name ensures the
-- canonical default is set before scoring_config_write validates the row.
DROP TRIGGER IF EXISTS points_config_normalize_default_grade_points ON public.points_config;
CREATE TRIGGER points_config_normalize_default_grade_points
BEFORE INSERT OR UPDATE ON public.points_config
FOR EACH ROW EXECUTE FUNCTION scoring_private.normalize_default_grade_points();

-- Server-authoritative award calculation applies the selected default row to
-- every entry size. Existing published result rows are not recalculated here.
CREATE OR REPLACE FUNCTION scoring_private.award(c jsonb,item uuid,grade text,place integer,size integer,teams integer,is_group boolean,bracket_key text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE b jsonb; rows jsonb; vals jsonb; gp integer:=0; rp integer:=0; gi integer; gboost boolean; rboost boolean;
  small boolean; profile text; gs jsonb; rs jsonb; BEGIN
  IF size IS NULL OR size<1 OR teams IS NULL OR teams<0 OR (place IS NOT NULL AND place<1) THEN RAISE EXCEPTION 'Invalid scoring input counts.'; END IF;
  IF grade IS NOT NULL AND grade NOT IN ('A+','A','B','C') THEN RAISE EXCEPTION 'Unknown grade.'; END IF;
  rows:=CASE WHEN is_group AND COALESCE((c->>'separate_group_brackets')::boolean,false) THEN c->'group_point_brackets' ELSE c->'point_brackets' END;
  SELECT value INTO b FROM jsonb_array_elements(rows)
    WHERE COALESCE((value->>'enabled')::boolean,true)
    ORDER BY (value->>'min')::integer,value->>'key' LIMIT 1;
  IF b IS NULL THEN RAISE EXCEPTION 'No default grade points are configured.'; END IF;
  IF bracket_key IS NOT NULL AND bracket_key IS DISTINCT FROM b->>'key' THEN
    RAISE EXCEPTION 'Only the default grade points may be used.';
  END IF;
  SELECT value INTO gs FROM jsonb_array_elements(COALESCE(c->'grade_boost_sections','[]'::jsonb)) WHERE (value->'item_ids') ? item::text LIMIT 1;
  SELECT value INTO rs FROM jsonb_array_elements(COALESCE(c->'rank_boost_sections','[]'::jsonb)) WHERE (value->'item_ids') ? item::text LIMIT 1;
  gboost:=gs IS NOT NULL OR COALESCE((c->'grade_boost_item_ids') ? item::text,false);
  rboost:=rs IS NOT NULL OR COALESCE((c->'rank_boost_item_ids') ? item::text,false);
  IF gboost AND NOT COALESCE((c->>'grade_boost_enabled')::boolean,true) THEN RAISE EXCEPTION 'Grade Boost is disabled while this competition is assigned.'; END IF;
  IF rboost AND NOT COALESCE((c->>'rank_boost_enabled')::boolean,true) THEN RAISE EXCEPTION 'Rank Boost is disabled while this competition is assigned.'; END IF;
  profile:=CASE WHEN gboost AND rboost THEN 'both' WHEN gboost THEN 'grade_boost' WHEN rboost THEN 'rank_boost' ELSE 'baseline' END;
  IF gboost THEN
    vals:=CASE WHEN gs IS NOT NULL THEN CASE WHEN is_group AND COALESCE((c->>'separate_group_brackets')::boolean,false) THEN gs->'group_points'->(b->>'key') ELSE gs->'points'->(b->>'key') END
      WHEN is_group AND COALESCE((c->>'separate_group_brackets')::boolean,false) THEN c->'group_grade_boost_points'->(b->>'key') ELSE c->'grade_boost_points'->(b->>'key') END;
  ELSE vals:=b->'points'; END IF;
  gi:=CASE grade WHEN 'A+' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE NULL END;
  IF gi IS NOT NULL THEN gp:=scoring_private.whole(vals->gi); END IF;
  IF place BETWEEN 1 AND 3 THEN
    IF rboost AND rs IS NOT NULL THEN rp:=scoring_private.whole(rs->'points'->(place-1));
    ELSIF rboost THEN rp:=scoring_private.whole(c->'rank_boost_points'->(place-1));
    ELSE rp:=scoring_private.whole(c->('rank_'||place||'_points')); END IF;
  END IF;
  small:=(c->>'less_than_3_teams_rule')::boolean AND teams<(c->>'rule12_min_teams')::integer;
  IF small AND c->>'rule12_behavior'<>'rank_and_grade' THEN rp:=0; END IF;
  IF small AND c->>'rule12_behavior'='no_points' THEN gp:=0; END IF;
  RETURN jsonb_build_object('total',rp+gp,'rank_points',rp,'grade_points',gp,'profile',profile,'bracket_key',b->>'key','bracket_label',b->>'label',
    'rule12_applied',COALESCE(small,false),'rule12_behavior',c->>'rule12_behavior','grade_only',COALESCE(small,false) AND c->>'rule12_behavior'='grade_only',
    'config_version',(c->>'config_version')::integer,'group_size',size,'competing_teams_count',teams,'is_group',is_group);
END $$;

COMMIT;
