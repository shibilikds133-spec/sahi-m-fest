BEGIN;

-- Existing festivals retain their current scoring behaviour until an administrator changes it.
ALTER TABLE public.points_config
  ADD COLUMN grade_boost_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN rank_boost_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN member_brackets_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION scoring_private.check_config_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE item uuid; BEGIN
  PERFORM scoring_private.assert_admin(NEW.tenant_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.festival_id::text,0));
  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id=NEW.festival_id AND f.tenant_id=NEW.tenant_id)
    THEN RAISE EXCEPTION 'Festival is outside configuration ownership.'; END IF;
  PERFORM scoring_private.validate_config(to_jsonb(NEW));
  IF NOT NEW.grade_boost_enabled AND cardinality(NEW.grade_boost_item_ids)>0
    THEN RAISE EXCEPTION 'Remove Grade Boost competitions before turning it off.'; END IF;
  IF NOT NEW.rank_boost_enabled AND cardinality(NEW.rank_boost_item_ids)>0
    THEN RAISE EXCEPTION 'Remove Rank Boost competitions before turning it off.'; END IF;
  FOREACH item IN ARRAY (NEW.grade_boost_item_ids || NEW.rank_boost_item_ids) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id=item AND i.tenant_id=NEW.tenant_id
      AND i.festival_id=NEW.festival_id AND cardinality(i.category_codes)=1)
      THEN RAISE EXCEPTION 'Boost selections require an owned, single-category competition.'; END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- The existing RPC uses an explicit column list, so persist the switches there as well.
CREATE OR REPLACE FUNCTION public.save_scoring_configuration(p_festival_id uuid,p_expected_version integer,p_config jsonb,p_reason text)
RETURNS public.points_config LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE old public.points_config; v public.points_config; owner uuid; BEGIN
  SELECT tenant_id INTO owner FROM public.festival_calendar WHERE id=p_festival_id;
  PERFORM scoring_private.assert_admin(owner);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text,0));
  SELECT * INTO old FROM public.points_config WHERE festival_id=p_festival_id AND tenant_id=owner FOR UPDATE;
  IF COALESCE(old.config_version,0) IS DISTINCT FROM p_expected_version
    THEN RAISE EXCEPTION 'Configuration changed. Reload before saving.' USING ERRCODE='40001'; END IF;
  v:=jsonb_populate_record(NULL::public.points_config,p_config);
  IF old.id IS NULL THEN
    INSERT INTO public.points_config(tenant_id,festival_id,rank_1_points,rank_2_points,rank_3_points,points_mode,
      grade_thresholds,point_brackets,group_point_brackets,separate_group_brackets,auto_bracket_selection,
      allow_bracket_override,less_than_3_teams_rule,rule12_min_teams,rule12_behavior,enable_grace_marks,
      grade_boost_points,group_grade_boost_points,rank_boost_points,grade_boost_item_ids,rank_boost_item_ids,
      grace_fields,grade_boost_enabled,rank_boost_enabled,member_brackets_enabled,config_version,change_reason)
    VALUES(owner,p_festival_id,v.rank_1_points,v.rank_2_points,v.rank_3_points,v.points_mode,
      v.grade_thresholds,v.point_brackets,v.group_point_brackets,v.separate_group_brackets,v.auto_bracket_selection,
      v.allow_bracket_override,v.less_than_3_teams_rule,v.rule12_min_teams,v.rule12_behavior,v.enable_grace_marks,
      v.grade_boost_points,v.group_grade_boost_points,v.rank_boost_points,v.grade_boost_item_ids,v.rank_boost_item_ids,
      v.grace_fields,COALESCE(v.grade_boost_enabled,true),COALESCE(v.rank_boost_enabled,true),
      COALESCE(v.member_brackets_enabled,true),1,p_reason) RETURNING * INTO v;
  ELSE
    UPDATE public.points_config SET rank_1_points=v.rank_1_points,rank_2_points=v.rank_2_points,
      rank_3_points=v.rank_3_points,points_mode=v.points_mode,grade_thresholds=v.grade_thresholds,
      point_brackets=v.point_brackets,group_point_brackets=v.group_point_brackets,
      separate_group_brackets=v.separate_group_brackets,auto_bracket_selection=v.auto_bracket_selection,
      allow_bracket_override=v.allow_bracket_override,less_than_3_teams_rule=v.less_than_3_teams_rule,
      rule12_min_teams=v.rule12_min_teams,rule12_behavior=v.rule12_behavior,enable_grace_marks=v.enable_grace_marks,
      grade_boost_points=v.grade_boost_points,group_grade_boost_points=v.group_grade_boost_points,
      rank_boost_points=v.rank_boost_points,grade_boost_item_ids=v.grade_boost_item_ids,
      rank_boost_item_ids=v.rank_boost_item_ids,grace_fields=v.grace_fields,
      grade_boost_enabled=COALESCE(v.grade_boost_enabled,old.grade_boost_enabled),
      rank_boost_enabled=COALESCE(v.rank_boost_enabled,old.rank_boost_enabled),
      member_brackets_enabled=COALESCE(v.member_brackets_enabled,old.member_brackets_enabled),
      config_version=old.config_version+1,change_reason=p_reason WHERE id=old.id RETURNING * INTO v;
  END IF;
  RETURN v;
END $$;

-- A new custom group item has one exact planned team size. Handbook/legacy rows are unchanged.
CREATE OR REPLACE FUNCTION scoring_private.check_item_scoring_contract() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE check_size boolean; BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.festival_id::text,0));
  IF TG_OP='INSERT' THEN check_size:=true;
  ELSE check_size:=NEW.source IS DISTINCT FROM OLD.source OR NEW.participation_type IS DISTINCT FROM OLD.participation_type
    OR NEW.group_min_members IS DISTINCT FROM OLD.group_min_members OR NEW.group_max_members IS DISTINCT FROM OLD.group_max_members;
  END IF;
  IF check_size AND NEW.source='custom' AND NEW.participation_type='group' AND
    (NEW.group_min_members IS NULL OR NEW.group_max_members IS NULL OR NEW.group_min_members<1
      OR NEW.group_max_members<>NEW.group_min_members)
    THEN RAISE EXCEPTION 'A new custom group competition requires an exact positive member count.'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER item_scoring_contract_insert BEFORE INSERT ON public.items FOR EACH ROW
  EXECUTE FUNCTION scoring_private.check_item_scoring_contract();
CREATE TRIGGER item_scoring_contract_update BEFORE UPDATE OF source,participation_type,group_min_members,group_max_members
  ON public.items FOR EACH ROW EXECUTE FUNCTION scoring_private.check_item_scoring_contract();

CREATE OR REPLACE FUNCTION public.save_competition_items(p_festival_id uuid,p_codes text[],p_records jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE owner uuid; code text; rec jsonb; BEGIN
  SELECT tenant_id INTO owner FROM public.festival_calendar WHERE id=p_festival_id;
  PERFORM scoring_private.assert_admin(owner);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text,0));
  IF p_codes IS NULL OR (SELECT count(DISTINCT c) FROM unnest(p_codes) c)<>cardinality(p_codes)
    THEN RAISE EXCEPTION 'Competition selections must be unique.'; END IF;
  UPDATE public.items SET is_active=item_code=ANY(p_codes) WHERE festival_id=p_festival_id AND tenant_id=owner;
  FOREACH code IN ARRAY p_codes LOOP
    IF EXISTS(SELECT 1 FROM public.items WHERE festival_id=p_festival_id AND item_code=code AND tenant_id=owner) THEN CONTINUE; END IF;
    SELECT value INTO rec FROM jsonb_array_elements(p_records) WHERE value->>'item_code'=code LIMIT 1;
    IF rec IS NULL OR nullif(btrim(rec->>'item_name_ml'),'') IS NULL OR jsonb_array_length(rec->'category_codes')<>1
      THEN RAISE EXCEPTION 'A complete single-category competition is required.'; END IF;
    INSERT INTO public.items(tenant_id,festival_id,item_code,item_name_ml,item_name_en,category_codes,
      participation_type,source,is_active,duration_minutes,group_min_members,group_max_members)
      VALUES(owner,p_festival_id,code,rec->>'item_name_ml',COALESCE(rec->>'item_name_en',rec->>'item_name_ml'),
        ARRAY(SELECT jsonb_array_elements_text(rec->'category_codes')),rec->>'participation_type',
        COALESCE(rec->>'source','custom'),true,(rec->>'duration_minutes')::integer,
        (rec->>'group_min_members')::integer,(rec->>'group_max_members')::integer);
  END LOOP;
END $$;

-- This is the one numerical award path used by preview, publish and the compatibility RPC.
CREATE OR REPLACE FUNCTION scoring_private.award(c jsonb,item uuid,grade text,place integer,size integer,teams integer,is_group boolean,bracket_key text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE b jsonb; rows jsonb; vals jsonb; gp integer:=0; rp integer:=0; gi integer; gboost boolean; rboost boolean;
  small boolean; profile text; BEGIN
  IF size IS NULL OR size<1 OR teams IS NULL OR teams<0 OR (place IS NOT NULL AND place<1)
    THEN RAISE EXCEPTION 'Invalid scoring input counts.'; END IF;
  IF grade IS NOT NULL AND grade NOT IN ('A+','A','B','C') THEN RAISE EXCEPTION 'Unknown grade.'; END IF;
  rows:=CASE WHEN is_group AND (c->>'separate_group_brackets')::boolean THEN c->'group_point_brackets' ELSE c->'point_brackets' END;
  IF NOT COALESCE((c->>'member_brackets_enabled')::boolean,true) THEN
    SELECT value INTO b FROM jsonb_array_elements(rows)
      WHERE COALESCE((value->>'enabled')::boolean,true)
      ORDER BY (value->>'min')::integer, value->>'key' LIMIT 1;
    IF bracket_key IS NOT NULL AND bracket_key IS DISTINCT FROM b->>'key'
      THEN RAISE EXCEPTION 'Member-based bracket selection is disabled for this festival.'; END IF;
  ELSIF bracket_key IS NOT NULL AND (c->>'allow_bracket_override')::boolean THEN
    SELECT value INTO b FROM jsonb_array_elements(rows)
      WHERE value->>'key'=bracket_key AND COALESCE((value->>'enabled')::boolean,true);
  ELSE
    SELECT value INTO b FROM jsonb_array_elements(rows) WHERE COALESCE((value->>'enabled')::boolean,true)
      AND size>=(value->>'min')::integer AND (value->'max'='null'::jsonb OR size<=(value->>'max')::integer);
  END IF;
  IF b IS NULL THEN RAISE EXCEPTION 'No configured bracket matches this entry.'; END IF;
  gboost:=COALESCE((c->'grade_boost_item_ids') ? item::text,false);
  rboost:=COALESCE((c->'rank_boost_item_ids') ? item::text,false);
  IF gboost AND NOT COALESCE((c->>'grade_boost_enabled')::boolean,true)
    THEN RAISE EXCEPTION 'Grade Boost is disabled while this competition is assigned.'; END IF;
  IF rboost AND NOT COALESCE((c->>'rank_boost_enabled')::boolean,true)
    THEN RAISE EXCEPTION 'Rank Boost is disabled while this competition is assigned.'; END IF;
  profile:=CASE WHEN gboost AND rboost THEN 'both' WHEN gboost THEN 'grade_boost'
    WHEN rboost THEN 'rank_boost' ELSE 'baseline' END;
  vals:=CASE WHEN NOT gboost THEN b->'points' WHEN is_group AND (c->>'separate_group_brackets')::boolean
    THEN c->'group_grade_boost_points'->(b->>'key') ELSE c->'grade_boost_points'->(b->>'key') END;
  gi:=CASE grade WHEN 'A+' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE NULL END;
  IF gi IS NOT NULL THEN gp:=scoring_private.whole(vals->gi); END IF;
  IF place BETWEEN 1 AND 3 THEN
    rp:=CASE WHEN rboost THEN scoring_private.whole(c->'rank_boost_points'->(place-1))
      ELSE scoring_private.whole(c->('rank_'||place||'_points')) END;
  END IF;
  small:=(c->>'less_than_3_teams_rule')::boolean AND teams<(c->>'rule12_min_teams')::integer;
  IF small AND c->>'rule12_behavior'<>'rank_and_grade' THEN rp:=0; END IF;
  IF small AND c->>'rule12_behavior'='no_points' THEN gp:=0; END IF;
  RETURN jsonb_build_object('total',rp+gp,'rank_points',rp,'grade_points',gp,'profile',profile,
    'bracket_key',b->>'key','bracket_label',b->>'label','rule12_applied',COALESCE(small,false),
    'rule12_behavior',c->>'rule12_behavior','grade_only',COALESCE(small,false) AND c->>'rule12_behavior'='grade_only',
    'config_version',(c->>'config_version')::integer,'group_size',size,'competing_teams_count',teams,'is_group',is_group);
END $$;

CREATE OR REPLACE FUNCTION scoring_private.prepare_results(p_schedule uuid,p_expected_version integer,p_entries jsonb,p_mode text,p_bracket text,p_size integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE s public.schedules; item public.items; c public.points_config; reg public.registrations;
  entry jsonb; input jsonb; inputs jsonb:='[]'; scores jsonb:='{}'; pct numeric; raw numeric; maximum numeric;
  total numeric; count_entries integer; teams integer; size integer; grade text; placement integer; row record; calc jsonb;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id=p_schedule;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Schedule was not found.'; END IF;
  PERFORM scoring_private.assert_admin(s.tenant_id);
  SELECT * INTO c FROM public.points_config WHERE festival_id=s.festival_id AND tenant_id=s.tenant_id FOR SHARE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Configure points before publishing results.'; END IF;
  IF c.config_version IS DISTINCT FROM p_expected_version
    THEN RAISE EXCEPTION 'Configuration changed. Refresh the preview.' USING ERRCODE='40001'; END IF;
  PERFORM scoring_private.validate_config(to_jsonb(c));
  SELECT * INTO item FROM public.items WHERE id=s.item_id AND festival_id=s.festival_id AND tenant_id=s.tenant_id;
  IF item.id IS NULL OR cardinality(item.category_codes) IS DISTINCT FROM 1
    THEN RAISE EXCEPTION 'Resolve this competition to one owned item/category before publishing.'; END IF;
  IF p_mode NOT IN ('judges','manual') OR p_mode IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Invalid results entry mode.'; END IF;
  SELECT count(*) INTO teams FROM scoring_private.eligible(s);
  IF teams=0 OR jsonb_array_length(p_entries)<>teams OR
    (SELECT count(DISTINCT value->>'registration_id') FROM jsonb_array_elements(p_entries))<>teams
    THEN RAISE EXCEPTION 'Every eligible registration must be included exactly once.'; END IF;
  SELECT greatest(1,COALESCE(max(CASE WHEN jsonb_typeof(r.raw_group_members)='array'
    AND jsonb_array_length(r.raw_group_members)>0 THEN jsonb_array_length(r.raw_group_members)
    ELSE 1+(SELECT count(*) FROM public.group_members g WHERE g.registration_id=r.id) END),1))::integer
    INTO size FROM scoring_private.eligible(s) r;
  IF item.participation_type<>'group' THEN size:=1;
  ELSIF item.source='custom' AND item.group_min_members>0 AND item.group_min_members=item.group_max_members
    THEN size:=item.group_min_members;
  END IF;
  IF p_size IS NOT NULL THEN
    IF NOT c.member_brackets_enabled THEN RAISE EXCEPTION 'Member-based scoring is disabled for this festival.'; END IF;
    IF item.source='custom' AND item.participation_type='group' AND item.group_min_members>0
      AND item.group_min_members=item.group_max_members
      THEN RAISE EXCEPTION 'This competition already has a configured group size.'; END IF;
    IF NOT (item.category_codes && ARRAY['GN','GENERAL']) OR p_size<1
      THEN RAISE EXCEPTION 'Only a General competition permits a manual group-size override.'; END IF;
    size:=p_size;
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    SELECT * INTO reg FROM scoring_private.eligible(s) WHERE id=(entry->>'registration_id')::uuid;
    IF reg.id IS NULL THEN RAISE EXCEPTION 'Registration is outside this event or is ineligible.'; END IF;
    pct:=0; raw:=0; count_entries:=0; inputs:='[]';
    IF p_mode='manual' THEN
      IF jsonb_typeof(entry->'raw_marks') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'raw_marks')=0
        THEN RAISE EXCEPTION 'Enter raw marks and their maximum for every registration.'; END IF;
      FOR input IN SELECT value FROM jsonb_array_elements(entry->'raw_marks') LOOP
        IF jsonb_typeof(input->'total') IS DISTINCT FROM 'number' OR jsonb_typeof(input->'maximum') IS DISTINCT FROM 'number'
          THEN RAISE EXCEPTION 'Invalid raw marks.'; END IF;
        total:=(input->>'total')::numeric; maximum:=(input->>'maximum')::numeric;
        IF maximum<=0 OR total<0 OR total>maximum THEN RAISE EXCEPTION 'Marks must be within their recorded maximum.'; END IF;
        pct:=pct+total/maximum*100; raw:=raw+total; count_entries:=count_entries+1; inputs:=inputs||jsonb_build_array(input);
      END LOOP;
    ELSE
      FOR row IN SELECT m.* FROM public.mark_entries m WHERE m.schedule_id=s.id AND m.registration_id=reg.id
        AND m.tenant_id=s.tenant_id AND m.is_final IS TRUE
        AND EXISTS(SELECT 1 FROM public.schedule_judge_assignments a WHERE a.schedule_id=s.id AND a.judge_id=m.judge_id
          AND a.tenant_id=s.tenant_id AND a.status='active') FOR SHARE OF m LOOP
        IF row.total_mark IS NULL OR row.max_mark_snapshot IS NULL OR row.max_mark_snapshot<=0
          OR row.total_mark<0 OR row.total_mark>row.max_mark_snapshot
          THEN RAISE EXCEPTION 'A final mark has no valid maximum snapshot. An administrator must review it.'; END IF;
        pct:=pct+row.total_mark/row.max_mark_snapshot*100; raw:=raw+row.total_mark; count_entries:=count_entries+1;
        inputs:=inputs||jsonb_build_array(jsonb_build_object('mark_id',row.id,'total',row.total_mark,'maximum',row.max_mark_snapshot));
      END LOOP;
    END IF;
    IF count_entries=0 THEN RAISE EXCEPTION 'No final marks exist for an eligible registration.'; END IF;
    pct:=pct/count_entries; raw:=round(raw/count_entries,2);
    SELECT key INTO grade FROM jsonb_each(c.grade_thresholds) WHERE pct>=value::text::numeric
      ORDER BY value::text::numeric DESC LIMIT 1;
    grade:=CASE grade WHEN 'a_plus' THEN 'A+' WHEN 'a' THEN 'A' WHEN 'b' THEN 'B' WHEN 'c' THEN 'C' ELSE NULL END;
    scores:=scores||jsonb_build_object(reg.id::text,jsonb_build_object('percentage',pct,'total_score',raw,'grade',grade,'inputs',inputs));
  END LOOP;
  FOR row IN SELECT key,value,rank() OVER(ORDER BY (value->>'percentage')::numeric DESC)::integer AS position FROM jsonb_each(scores) LOOP
    placement:=CASE WHEN (row.value->>'percentage')::numeric>0 AND row.position<=5 THEN row.position ELSE NULL END;
    calc:=scoring_private.award(to_jsonb(c),item.id,row.value->>'grade',placement,size,teams,item.participation_type='group',p_bracket);
    scores:=jsonb_set(scores,ARRAY[row.key],row.value||jsonb_build_object('rank',placement,'calculation',calc));
  END LOOP;
  RETURN jsonb_build_object('results',scores,'config_version',c.config_version,'tenant_id',s.tenant_id,
    'festival_id',s.festival_id,'item_id',item.id);
END $$;

COMMIT;
