BEGIN;

ALTER TABLE public.points_config
  ADD COLUMN grade_boost_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN rank_boost_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Preserve each existing flat configuration as one editable section.
UPDATE public.points_config
SET grade_boost_sections = jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'item_ids',to_jsonb(grade_boost_item_ids),
      'points',grade_boost_points,'group_points',group_grade_boost_points)),
    rank_boost_sections = jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid(),'item_ids',to_jsonb(rank_boost_item_ids),'points',rank_boost_points));

CREATE OR REPLACE FUNCTION scoring_private.validate_boost_sections(p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE family text; sections jsonb; section jsonb; sid text; seen_ids text[]; seen_items text[];
  item text; point_map jsonb; bracket jsonb; point_values jsonb; idx integer; point_family text; bracket_rows jsonb; BEGIN
  FOREACH family IN ARRAY ARRAY['grade_boost_sections','rank_boost_sections'] LOOP
    sections:=p->family;
    IF jsonb_typeof(sections) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid boost sections.'; END IF;
    seen_ids:='{}'; seen_items:='{}'; idx:=0;
    FOR section IN SELECT value FROM jsonb_array_elements(sections) LOOP
      idx:=idx+1; sid:=section->>'id';
      IF sid IS NULL OR sid='' OR sid=ANY(seen_ids) THEN RAISE EXCEPTION 'Boost section IDs must be unique.'; END IF;
      seen_ids:=array_append(seen_ids,sid);
      IF jsonb_typeof(section->'item_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid competition list in Section %.',idx; END IF;
      FOR item IN SELECT jsonb_array_elements_text(section->'item_ids') LOOP
        IF item=ANY(seen_items) THEN RAISE EXCEPTION 'A competition can belong to only one % section.',CASE WHEN family='grade_boost_sections' THEN 'Grade Boost' ELSE 'Rank Boost' END; END IF;
        PERFORM item::uuid; seen_items:=array_append(seen_items,item);
      END LOOP;
      IF family='rank_boost_sections' AND cardinality(ARRAY(SELECT jsonb_array_elements_text(section->'item_ids')))>0 THEN
        point_values:=section->'points';
        IF jsonb_typeof(point_values) IS DISTINCT FROM 'array' OR jsonb_array_length(point_values)<>3 THEN RAISE EXCEPTION 'Complete Rank Boost points in Section %.',idx; END IF;
        FOR bracket IN SELECT value FROM jsonb_array_elements(point_values) LOOP PERFORM scoring_private.whole(bracket); END LOOP;
      ELSIF family='grade_boost_sections' AND cardinality(ARRAY(SELECT jsonb_array_elements_text(section->'item_ids')))>0 THEN
        FOREACH point_family IN ARRAY ARRAY['points','group_points'] LOOP
          IF point_family='group_points' AND NOT (p->>'separate_group_brackets')::boolean THEN CONTINUE; END IF;
          point_map:=section->point_family;
          IF point_map IS NULL OR jsonb_typeof(point_map) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Complete Grade Boost points in Section %.',idx; END IF;
          bracket_rows:=CASE WHEN point_family='group_points' THEN p->'group_point_brackets' ELSE p->'point_brackets' END;
          FOR bracket IN SELECT value FROM jsonb_array_elements(bracket_rows) LOOP
            IF COALESCE((bracket->>'enabled')::boolean,true) THEN
              point_values:=point_map->(bracket->>'key');
              IF jsonb_typeof(point_values) IS DISTINCT FROM 'array' OR jsonb_array_length(point_values)<>4 THEN RAISE EXCEPTION 'Complete Grade Boost points in Section % for bracket %.',idx,bracket->>'key'; END IF;
              FOR item IN SELECT jsonb_array_elements_text(point_values) LOOP PERFORM scoring_private.whole(to_jsonb(item::numeric)); END LOOP;
            END IF;
          END LOOP;
        END LOOP;
      END IF;
    END LOOP;
    IF family='grade_boost_sections' THEN
      IF COALESCE((SELECT array_agg(DISTINCT value ORDER BY value) FROM jsonb_array_elements_text(p->'grade_boost_item_ids') value),'{}'::text[])
        IS DISTINCT FROM COALESCE((SELECT array_agg(DISTINCT item ORDER BY item) FROM jsonb_array_elements(p->family) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'item_ids') item),'{}'::text[])
        THEN RAISE EXCEPTION 'Grade Boost competition list does not match its sections.'; END IF;
    ELSE
      IF COALESCE((SELECT array_agg(DISTINCT value ORDER BY value) FROM jsonb_array_elements_text(p->'rank_boost_item_ids') value),'{}'::text[])
        IS DISTINCT FROM COALESCE((SELECT array_agg(DISTINCT item ORDER BY item) FROM jsonb_array_elements(p->family) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'item_ids') item),'{}'::text[])
        THEN RAISE EXCEPTION 'Rank Boost competition list does not match its sections.'; END IF;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION scoring_private.check_config_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE item uuid; BEGIN
  PERFORM scoring_private.assert_admin(NEW.tenant_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.festival_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id=NEW.festival_id AND f.tenant_id=NEW.tenant_id)
    THEN RAISE EXCEPTION 'Festival is outside configuration ownership.'; END IF;
  PERFORM scoring_private.validate_config(jsonb_set(jsonb_set(to_jsonb(NEW),'{grade_boost_item_ids}','[]'::jsonb),'{rank_boost_item_ids}','[]'::jsonb));
  PERFORM scoring_private.validate_boost_sections(to_jsonb(NEW));
  IF NOT NEW.grade_boost_enabled AND cardinality(NEW.grade_boost_item_ids)>0 THEN RAISE EXCEPTION 'Remove Grade Boost competitions before turning it off.'; END IF;
  IF NOT NEW.rank_boost_enabled AND cardinality(NEW.rank_boost_item_ids)>0 THEN RAISE EXCEPTION 'Remove Rank Boost competitions before turning it off.'; END IF;
  FOREACH item IN ARRAY (NEW.grade_boost_item_ids || NEW.rank_boost_item_ids) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id=item AND i.tenant_id=NEW.tenant_id AND i.festival_id=NEW.festival_id AND cardinality(i.category_codes)=1)
      THEN RAISE EXCEPTION 'Boost selections require an owned, single-category competition.'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.save_scoring_configuration(p_festival_id uuid,p_expected_version integer,p_config jsonb,p_reason text)
RETURNS public.points_config LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE old public.points_config; v public.points_config; owner uuid; grade_sections jsonb; rank_sections jsonb;
  grade_ids uuid[]; rank_ids uuid[]; BEGIN
  SELECT tenant_id INTO owner FROM public.festival_calendar WHERE id=p_festival_id;
  PERFORM scoring_private.assert_admin(owner);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text,0));
  SELECT * INTO old FROM public.points_config WHERE festival_id=p_festival_id AND tenant_id=owner FOR UPDATE;
  IF COALESCE(old.config_version,0) IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Reload before saving.' USING ERRCODE='40001'; END IF;
  IF old.id IS NOT NULL AND NOT (p_config ? 'grade_boost_sections') AND
    (jsonb_array_length(old.grade_boost_sections)>1 OR jsonb_array_length(old.rank_boost_sections)>1)
    THEN RAISE EXCEPTION 'This client cannot edit multiple boost sections. Reload with the latest app before saving.'; END IF;
  v:=jsonb_populate_record(NULL::public.points_config,p_config);
  grade_sections:=CASE WHEN p_config ? 'grade_boost_sections' THEN v.grade_boost_sections ELSE
    jsonb_build_array(jsonb_build_object('id',COALESCE(old.grade_boost_sections->0->>'id',gen_random_uuid()::text),
      'item_ids',to_jsonb(v.grade_boost_item_ids),'points',v.grade_boost_points,'group_points',v.group_grade_boost_points)) END;
  rank_sections:=CASE WHEN p_config ? 'rank_boost_sections' THEN v.rank_boost_sections ELSE
    jsonb_build_array(jsonb_build_object('id',COALESCE(old.rank_boost_sections->0->>'id',gen_random_uuid()::text),
      'item_ids',to_jsonb(v.rank_boost_item_ids),'points',v.rank_boost_points)) END;
  SELECT COALESCE(array_agg(DISTINCT item::uuid),'{}'::uuid[]) INTO grade_ids
    FROM jsonb_array_elements(grade_sections) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'item_ids') item;
  SELECT COALESCE(array_agg(DISTINCT item::uuid),'{}'::uuid[]) INTO rank_ids
    FROM jsonb_array_elements(rank_sections) s CROSS JOIN LATERAL jsonb_array_elements_text(s->'item_ids') item;
  v.grade_boost_item_ids:=grade_ids; v.rank_boost_item_ids:=rank_ids;
  IF old.id IS NULL THEN
    INSERT INTO public.points_config(tenant_id,festival_id,rank_1_points,rank_2_points,rank_3_points,points_mode,
      grade_thresholds,point_brackets,group_point_brackets,separate_group_brackets,auto_bracket_selection,allow_bracket_override,
      less_than_3_teams_rule,rule12_min_teams,rule12_behavior,enable_grace_marks,grade_boost_points,group_grade_boost_points,
      rank_boost_points,grade_boost_item_ids,rank_boost_item_ids,grace_fields,grade_boost_enabled,rank_boost_enabled,
      member_brackets_enabled,grade_boost_sections,rank_boost_sections,config_version,change_reason)
    VALUES(owner,p_festival_id,v.rank_1_points,v.rank_2_points,v.rank_3_points,v.points_mode,v.grade_thresholds,v.point_brackets,
      v.group_point_brackets,v.separate_group_brackets,v.auto_bracket_selection,v.allow_bracket_override,v.less_than_3_teams_rule,
      v.rule12_min_teams,v.rule12_behavior,v.enable_grace_marks,v.grade_boost_points,v.group_grade_boost_points,v.rank_boost_points,
      v.grade_boost_item_ids,v.rank_boost_item_ids,v.grace_fields,COALESCE(v.grade_boost_enabled,true),COALESCE(v.rank_boost_enabled,true),
      COALESCE(v.member_brackets_enabled,true),grade_sections,rank_sections,1,p_reason) RETURNING * INTO v;
  ELSE
    UPDATE public.points_config SET rank_1_points=v.rank_1_points,rank_2_points=v.rank_2_points,rank_3_points=v.rank_3_points,
      points_mode=v.points_mode,grade_thresholds=v.grade_thresholds,point_brackets=v.point_brackets,group_point_brackets=v.group_point_brackets,
      separate_group_brackets=v.separate_group_brackets,auto_bracket_selection=v.auto_bracket_selection,allow_bracket_override=v.allow_bracket_override,
      less_than_3_teams_rule=v.less_than_3_teams_rule,rule12_min_teams=v.rule12_min_teams,rule12_behavior=v.rule12_behavior,
      enable_grace_marks=v.enable_grace_marks,grade_boost_points=v.grade_boost_points,group_grade_boost_points=v.group_grade_boost_points,
      rank_boost_points=v.rank_boost_points,grade_boost_item_ids=v.grade_boost_item_ids,rank_boost_item_ids=v.rank_boost_item_ids,
      grace_fields=v.grace_fields,grade_boost_sections=grade_sections,rank_boost_sections=rank_sections,
      grade_boost_enabled=COALESCE(v.grade_boost_enabled,old.grade_boost_enabled),rank_boost_enabled=COALESCE(v.rank_boost_enabled,old.rank_boost_enabled),
      member_brackets_enabled=COALESCE(v.member_brackets_enabled,old.member_brackets_enabled),config_version=old.config_version+1,
      change_reason=p_reason WHERE id=old.id RETURNING * INTO v;
  END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION scoring_private.award(c jsonb,item uuid,grade text,place integer,size integer,teams integer,is_group boolean,bracket_key text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE b jsonb; rows jsonb; vals jsonb; gp integer:=0; rp integer:=0; gi integer; gboost boolean; rboost boolean;
  small boolean; profile text; gs jsonb; rs jsonb; section jsonb; BEGIN
  IF size IS NULL OR size<1 OR teams IS NULL OR teams<0 OR (place IS NOT NULL AND place<1) THEN RAISE EXCEPTION 'Invalid scoring input counts.'; END IF;
  IF grade IS NOT NULL AND grade NOT IN ('A+','A','B','C') THEN RAISE EXCEPTION 'Unknown grade.'; END IF;
  rows:=CASE WHEN is_group AND (c->>'separate_group_brackets')::boolean THEN c->'group_point_brackets' ELSE c->'point_brackets' END;
  IF NOT COALESCE((c->>'member_brackets_enabled')::boolean,true) THEN
    SELECT value INTO b FROM jsonb_array_elements(rows) WHERE COALESCE((value->>'enabled')::boolean,true) ORDER BY (value->>'min')::integer,value->>'key' LIMIT 1;
    IF bracket_key IS NOT NULL AND bracket_key IS DISTINCT FROM b->>'key' THEN RAISE EXCEPTION 'Member-based bracket selection is disabled for this festival.'; END IF;
  ELSIF bracket_key IS NOT NULL AND (c->>'allow_bracket_override')::boolean THEN
    SELECT value INTO b FROM jsonb_array_elements(rows) WHERE value->>'key'=bracket_key AND COALESCE((value->>'enabled')::boolean,true);
  ELSE
    SELECT value INTO b FROM jsonb_array_elements(rows) WHERE COALESCE((value->>'enabled')::boolean,true) AND size>=(value->>'min')::integer AND (value->'max'='null'::jsonb OR size<=(value->>'max')::integer);
  END IF;
  IF b IS NULL THEN RAISE EXCEPTION 'No configured bracket matches this entry.'; END IF;
  SELECT value INTO gs FROM jsonb_array_elements(COALESCE(c->'grade_boost_sections','[]'::jsonb)) WHERE (value->'item_ids') ? item::text LIMIT 1;
  SELECT value INTO rs FROM jsonb_array_elements(COALESCE(c->'rank_boost_sections','[]'::jsonb)) WHERE (value->'item_ids') ? item::text LIMIT 1;
  gboost:=gs IS NOT NULL OR COALESCE((c->'grade_boost_item_ids') ? item::text,false);
  rboost:=rs IS NOT NULL OR COALESCE((c->'rank_boost_item_ids') ? item::text,false);
  IF gboost AND NOT COALESCE((c->>'grade_boost_enabled')::boolean,true) THEN RAISE EXCEPTION 'Grade Boost is disabled while this competition is assigned.'; END IF;
  IF rboost AND NOT COALESCE((c->>'rank_boost_enabled')::boolean,true) THEN RAISE EXCEPTION 'Rank Boost is disabled while this competition is assigned.'; END IF;
  profile:=CASE WHEN gboost AND rboost THEN 'both' WHEN gboost THEN 'grade_boost' WHEN rboost THEN 'rank_boost' ELSE 'baseline' END;
  IF gboost THEN
    vals:=CASE WHEN gs IS NOT NULL THEN CASE WHEN is_group AND (c->>'separate_group_brackets')::boolean THEN gs->'group_points'->(b->>'key') ELSE gs->'points'->(b->>'key') END
      WHEN is_group AND (c->>'separate_group_brackets')::boolean THEN c->'group_grade_boost_points'->(b->>'key') ELSE c->'grade_boost_points'->(b->>'key') END;
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

REVOKE ALL ON FUNCTION scoring_private.validate_boost_sections(jsonb) FROM PUBLIC,anon,authenticated;

COMMIT;
