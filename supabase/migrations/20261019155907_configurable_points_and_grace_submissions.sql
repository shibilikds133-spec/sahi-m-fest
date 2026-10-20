-- Configured scoring only. Existing judge auth/token/finalization/reset logic is preserved.
BEGIN;
CREATE SCHEMA IF NOT EXISTS scoring_private;
REVOKE ALL ON SCHEMA scoring_private FROM PUBLIC, anon, authenticated;

ALTER TABLE public.points_config
  ADD COLUMN IF NOT EXISTS grade_boost_points jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS group_grade_boost_points jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rank_boost_points jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS grade_boost_item_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rank_boost_item_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS grace_fields jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS enable_grace_marks boolean NOT NULL DEFAULT false;
ALTER TABLE public.results ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES public.schedules(id);

-- Preserve historical values; remove only the current schema's numerical scoring defaults.
DO $$ DECLARE col text; BEGIN
  FOREACH col IN ARRAY ARRAY['rank_1_points','rank_2_points','rank_3_points','grade_a_plus_points',
    'grade_a_points','grade_b_points','grade_c_points','participation_points','ind_a_plus_points',
    'ind_a_points','ind_b_points','ind_c_points','grp_a_plus_points','grp_a_points','grp_b_points',
    'grp_c_points','grade_thresholds','point_brackets','group_point_brackets','rule12_min_teams'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='points_config' AND column_name=col) THEN
      EXECUTE format('ALTER TABLE public.points_config ALTER COLUMN %I DROP DEFAULT', col);
    END IF;
  END LOOP;
END $$;
ALTER TABLE public.mark_entries ALTER COLUMN max_mark_snapshot DROP DEFAULT;
ALTER TABLE public.scoring_rules ALTER COLUMN total_marks DROP DEFAULT;

-- Patch only numeric maximum defaults/restrictions in the installed definitions.
-- Do not replace their token validation, final locks, admin checks or reset behaviour.
DO $patch$
DECLARE definition text; patched text; proc record; BEGIN
  SELECT pg_get_functiondef('public.validate_mark_entry_scoring()'::regprocedure) INTO definition;
  patched:=regexp_replace(definition,
    'IF NEW.max_mark_snapshot <> 100 THEN[[:space:]]+RAISE EXCEPTION ''Paper total mode must use a maximum mark of 100.'';[[:space:]]+END IF;',
    'IF NEW.max_mark_snapshot IS NULL OR NEW.max_mark_snapshot <= 0 OR NEW.total_mark < 0 OR NEW.total_mark > NEW.max_mark_snapshot THEN RAISE EXCEPTION ''Marks must be within an explicit positive maximum.''; END IF;');
  IF patched=definition THEN RAISE EXCEPTION 'Unrecognized mark validator. Review maximum validation before migration.'; END IF;
  EXECUTE patched;
  FOR proc IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('upsert_judge_mark','admin_upsert_mark') LOOP
    definition:=pg_get_functiondef(proc.oid);
    patched:=replace(definition,'p_max_mark numeric DEFAULT 100','p_max_mark numeric DEFAULT NULL::numeric');
    patched:=regexp_replace(patched,'COALESCE\(p_max_mark,[[:space:]]*100\)','p_max_mark','gi');
    IF patched<>definition THEN EXECUTE patched; END IF;
  END LOOP;
END $patch$;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.points_config'::regclass AND conname='points_config_tenant_festival_key') THEN
    ALTER TABLE public.points_config ADD CONSTRAINT points_config_tenant_festival_key UNIQUE(tenant_id,festival_id);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.snapshot_points_config_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF TG_OP='INSERT' OR NEW.config_version IS DISTINCT FROM OLD.config_version THEN
    INSERT INTO public.points_config_versions(tenant_id,festival_id,config_version,config_snapshot,change_reason,created_by)
      VALUES(NEW.tenant_id,NEW.festival_id,NEW.config_version,to_jsonb(NEW),NEW.change_reason,auth.uid());
  END IF;
  RETURN NEW;
END $$;
-- Authoritative numerical engine. Bracket ranges are shared by baseline and grade boost.
CREATE OR REPLACE FUNCTION scoring_private.award(c jsonb,item uuid,grade text,place integer,size integer,teams integer,is_group boolean,bracket_key text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE b jsonb; rows jsonb; vals jsonb; gp integer:=0; rp integer:=0; gi integer; gboost boolean; rboost boolean;
  small boolean; profile text; BEGIN
  IF size IS NULL OR size<1 OR teams IS NULL OR teams<0 OR (place IS NOT NULL AND place<1) THEN RAISE EXCEPTION 'Invalid scoring input counts.'; END IF;
  IF grade IS NOT NULL AND grade NOT IN ('A+','A','B','C') THEN RAISE EXCEPTION 'Unknown grade.'; END IF;
  rows:=CASE WHEN is_group AND (c->>'separate_group_brackets')::boolean THEN c->'group_point_brackets' ELSE c->'point_brackets' END;
  IF bracket_key IS NOT NULL AND (c->>'allow_bracket_override')::boolean THEN
    SELECT value INTO b FROM jsonb_array_elements(rows) WHERE value->>'key'=bracket_key AND COALESCE((value->>'enabled')::boolean,true);
  ELSE
    SELECT value INTO b FROM jsonb_array_elements(rows) WHERE COALESCE((value->>'enabled')::boolean,true)
      AND size>=(value->>'min')::integer AND (value->'max'='null'::jsonb OR size<=(value->>'max')::integer);
  END IF;
  IF b IS NULL THEN RAISE EXCEPTION 'No configured bracket matches this entry.'; END IF;
  gboost:=COALESCE((c->'grade_boost_item_ids') ? item::text,false);
  rboost:=COALESCE((c->'rank_boost_item_ids') ? item::text,false);
  profile:=CASE WHEN gboost AND rboost THEN 'both' WHEN gboost THEN 'grade_boost' WHEN rboost THEN 'rank_boost' ELSE 'baseline' END;
  vals:=CASE WHEN NOT gboost THEN b->'points' WHEN is_group AND (c->>'separate_group_brackets')::boolean THEN c->'group_grade_boost_points'->(b->>'key') ELSE c->'grade_boost_points'->(b->>'key') END;
  gi:=CASE grade WHEN 'A+' THEN 0 WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE NULL END;
  IF gi IS NOT NULL THEN gp:=scoring_private.whole(vals->gi); END IF;
  IF place BETWEEN 1 AND 3 THEN
    rp:=CASE WHEN rboost THEN scoring_private.whole(c->'rank_boost_points'->(place-1)) ELSE scoring_private.whole(c->('rank_'||place||'_points')) END;
  END IF;
  small:=(c->>'less_than_3_teams_rule')::boolean AND teams<(c->>'rule12_min_teams')::integer;
  IF small AND c->>'rule12_behavior'<>'rank_and_grade' THEN rp:=0; END IF;
  IF small AND c->>'rule12_behavior'='no_points' THEN gp:=0; END IF;
  RETURN jsonb_build_object('total',rp+gp,'rank_points',rp,'grade_points',gp,'profile',profile,
    'bracket_key',b->>'key','bracket_label',b->>'label','rule12_applied',COALESCE(small,false),
    'rule12_behavior',c->>'rule12_behavior','grade_only',COALESCE(small,false) AND c->>'rule12_behavior'='grade_only',
    'config_version',(c->>'config_version')::integer,'group_size',size,'competing_teams_count',teams,'is_group',is_group);
END $$;

CREATE OR REPLACE FUNCTION scoring_private.eligible(s public.schedules) RETURNS SETOF public.registrations
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
  WITH RECURSIVE tree AS (
    SELECT o.id FROM public.organisations o WHERE o.id=(SELECT organisation_id FROM public.tenants WHERE id=s.tenant_id)
      OR (NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=s.tenant_id AND organisation_id IS NOT NULL) AND o.tenant_id=s.tenant_id)
    UNION SELECT o.id FROM public.organisations o JOIN tree t ON o.parent_id=t.id
  )
  SELECT r.* FROM public.registrations r LEFT JOIN public.participants p ON p.id=r.participant_id
  WHERE r.item_id=s.item_id AND r.festival_id=s.festival_id AND r.status IS DISTINCT FROM 'rejected'
    AND r.is_verified IS TRUE AND nullif(btrim(r.code_letter),'') IS NOT NULL
    AND (r.tenant_id=s.tenant_id OR COALESCE(r.organisation_id,p.organisation_id) IN(SELECT id FROM tree));
$$;

CREATE TABLE public.scoring_publications (
  id uuid PRIMARY KEY,tenant_id uuid NOT NULL REFERENCES public.tenants,festival_id uuid NOT NULL REFERENCES public.festival_calendar,
  schedule_id uuid NOT NULL REFERENCES public.schedules,item_id uuid NOT NULL REFERENCES public.items,
  config_version integer NOT NULL,input_hash text NOT NULL,results_payload jsonb NOT NULL,previous_results jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scoring_publications_scope ON public.scoring_publications(tenant_id,festival_id,schedule_id);
ALTER TABLE public.scoring_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoring_publications_read ON public.scoring_publications FOR SELECT TO authenticated
  USING(public.is_superadmin() OR tenant_id=public.get_my_tenant_id());
REVOKE ALL ON public.scoring_publications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scoring_publications TO authenticated;

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
  IF c.config_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Refresh the preview.' USING ERRCODE='40001'; END IF;
  PERFORM scoring_private.validate_config(to_jsonb(c));
  SELECT * INTO item FROM public.items WHERE id=s.item_id AND festival_id=s.festival_id AND tenant_id=s.tenant_id;
  IF item.id IS NULL OR cardinality(item.category_codes) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Resolve this competition to one owned item/category before publishing.'; END IF;
  IF p_mode NOT IN ('judges','manual') OR p_mode IS NULL OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid results entry mode.'; END IF;
  SELECT count(*) INTO teams FROM scoring_private.eligible(s);
  IF teams=0 OR jsonb_array_length(p_entries)<>teams OR (SELECT count(DISTINCT value->>'registration_id') FROM jsonb_array_elements(p_entries))<>teams THEN RAISE EXCEPTION 'Every eligible registration must be included exactly once.'; END IF;
  SELECT greatest(1,COALESCE(max(CASE WHEN jsonb_typeof(r.raw_group_members)='array' AND jsonb_array_length(r.raw_group_members)>0 THEN jsonb_array_length(r.raw_group_members) ELSE 1+(SELECT count(*) FROM public.group_members g WHERE g.registration_id=r.id) END),1))::integer INTO size FROM scoring_private.eligible(s) r;
  IF item.participation_type<>'group' THEN size:=1; END IF;
  IF p_size IS NOT NULL THEN
    IF NOT (item.category_codes && ARRAY['GN','GENERAL']) OR p_size<1 THEN RAISE EXCEPTION 'Only a General competition permits a manual group-size override.'; END IF;
    size:=p_size;
  END IF;
  FOR entry IN SELECT value FROM jsonb_array_elements(p_entries) LOOP
    SELECT * INTO reg FROM scoring_private.eligible(s) WHERE id=(entry->>'registration_id')::uuid;
    IF reg.id IS NULL THEN RAISE EXCEPTION 'Registration is outside this event or is ineligible.'; END IF;
    pct:=0; raw:=0; count_entries:=0; inputs:='[]';
    IF p_mode='manual' THEN
      IF jsonb_typeof(entry->'raw_marks') IS DISTINCT FROM 'array' OR jsonb_array_length(entry->'raw_marks')=0 THEN RAISE EXCEPTION 'Enter raw marks and their maximum for every registration.'; END IF;
      FOR input IN SELECT value FROM jsonb_array_elements(entry->'raw_marks') LOOP
        IF jsonb_typeof(input->'total') IS DISTINCT FROM 'number' OR jsonb_typeof(input->'maximum') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid raw marks.'; END IF;
        total:=(input->>'total')::numeric; maximum:=(input->>'maximum')::numeric;
        IF maximum<=0 OR total<0 OR total>maximum THEN RAISE EXCEPTION 'Marks must be within their recorded maximum.'; END IF;
        pct:=pct+total/maximum*100; raw:=raw+total; count_entries:=count_entries+1; inputs:=inputs||jsonb_build_array(input);
      END LOOP;
    ELSE
      FOR row IN SELECT m.* FROM public.mark_entries m WHERE m.schedule_id=s.id AND m.registration_id=reg.id AND m.tenant_id=s.tenant_id AND m.is_final IS TRUE
        AND EXISTS(SELECT 1 FROM public.schedule_judge_assignments a WHERE a.schedule_id=s.id AND a.judge_id=m.judge_id AND a.tenant_id=s.tenant_id AND a.status='active') FOR SHARE OF m LOOP
        IF row.total_mark IS NULL OR row.max_mark_snapshot IS NULL OR row.max_mark_snapshot<=0 OR row.total_mark<0 OR row.total_mark>row.max_mark_snapshot THEN RAISE EXCEPTION 'A final mark has no valid maximum snapshot. An administrator must review it.'; END IF;
        pct:=pct+row.total_mark/row.max_mark_snapshot*100; raw:=raw+row.total_mark; count_entries:=count_entries+1;
        inputs:=inputs||jsonb_build_array(jsonb_build_object('mark_id',row.id,'total',row.total_mark,'maximum',row.max_mark_snapshot));
      END LOOP;
    END IF;
    IF count_entries=0 THEN RAISE EXCEPTION 'No final marks exist for an eligible registration.'; END IF;
    pct:=pct/count_entries; raw:=round(raw/count_entries,2);
    SELECT key INTO grade FROM jsonb_each(c.grade_thresholds) WHERE pct>=value::text::numeric ORDER BY value::text::numeric DESC LIMIT 1;
    grade:=CASE grade WHEN 'a_plus' THEN 'A+' WHEN 'a' THEN 'A' WHEN 'b' THEN 'B' WHEN 'c' THEN 'C' ELSE NULL END;
    scores:=scores||jsonb_build_object(reg.id::text,jsonb_build_object('percentage',pct,'total_score',raw,'grade',grade,'inputs',inputs));
  END LOOP;
  FOR row IN SELECT key,value,rank() OVER(ORDER BY (value->>'percentage')::numeric DESC)::integer AS position FROM jsonb_each(scores) LOOP
    placement:=CASE WHEN (row.value->>'percentage')::numeric>0 AND row.position<=5 THEN row.position ELSE NULL END;
    calc:=scoring_private.award(to_jsonb(c),item.id,row.value->>'grade',placement,size,teams,item.participation_type='group',p_bracket);
    scores:=jsonb_set(scores,ARRAY[row.key],row.value||jsonb_build_object('rank',placement,'calculation',calc));
  END LOOP;
  RETURN jsonb_build_object('results',scores,'config_version',c.config_version,'tenant_id',s.tenant_id,'festival_id',s.festival_id,'item_id',item.id);
END $$;

CREATE OR REPLACE FUNCTION public.preview_competition_points(p_schedule_id uuid,p_expected_version integer,p_entries jsonb,p_mode text,p_bracket text DEFAULT NULL,p_group_size integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$ BEGIN
  RETURN scoring_private.prepare_results(p_schedule_id,p_expected_version,p_entries,p_mode,p_bracket,p_group_size);
END $$;

CREATE OR REPLACE FUNCTION public.publish_competition_results(p_schedule_id uuid,p_expected_version integer,p_entries jsonb,p_mode text,p_request_id uuid,p_bracket text DEFAULT NULL,p_group_size integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE p public.scoring_publications; prepared jsonb; sealed jsonb:='{}'; row record; payload jsonb; fingerprint text; owner uuid;
BEGIN
  SELECT tenant_id INTO owner FROM public.schedules WHERE id=p_schedule_id;
  PERFORM scoring_private.assert_admin(owner);
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Publication request identity is required.'; END IF;
  fingerprint:=md5(jsonb_build_array(p_schedule_id,p_expected_version,p_entries,p_mode,p_bracket,p_group_size)::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO p FROM public.scoring_publications WHERE id=p_request_id;
  IF p.id IS NOT NULL THEN
    IF p.tenant_id<>owner OR p.input_hash<>fingerprint THEN RAISE EXCEPTION 'Publication request has different inputs.'; END IF;
    RETURN jsonb_build_object('publication_id',p.id,'config_version',p.config_version);
  END IF;
  prepared:=scoring_private.prepare_results(p_schedule_id,p_expected_version,p_entries,p_mode,p_bracket,p_group_size);
  PERFORM 1 FROM public.schedules WHERE id=p_schedule_id FOR UPDATE;
  FOR row IN SELECT key,value FROM jsonb_each(prepared->'results') LOOP
    payload:=jsonb_build_object('tenant_id',owner,'festival_id',prepared->>'festival_id','schedule_id',p_schedule_id,
      'item_id',prepared->>'item_id','registration_id',row.key,'total_score',row.value->'total_score','rank',row.value->'rank','grade',row.value->'grade',
      'points_awarded',row.value->'calculation'->'total','grade_only',row.value->'calculation'->'grade_only',
      'points_config_version',p_expected_version,'points_calculation',(row.value->'calculation')||jsonb_build_object('publication_id',p_request_id,'inputs',row.value->'inputs','percentage',row.value->'percentage'),
      'collection_method',p_mode);
    sealed:=sealed||jsonb_build_object(row.key,payload);
  END LOOP;
  INSERT INTO public.scoring_publications(id,tenant_id,festival_id,schedule_id,item_id,config_version,input_hash,results_payload,previous_results,created_by)
  VALUES(p_request_id,owner,(prepared->>'festival_id')::uuid,p_schedule_id,(prepared->>'item_id')::uuid,p_expected_version,fingerprint,sealed,
    COALESCE((SELECT jsonb_agg(to_jsonb(old)) FROM public.results old WHERE old.tenant_id=owner AND old.festival_id=(prepared->>'festival_id')::uuid AND old.item_id=(prepared->>'item_id')::uuid),'[]'),auth.uid());
  FOR row IN SELECT value FROM jsonb_each(sealed) LOOP
    INSERT INTO public.results(tenant_id,festival_id,schedule_id,item_id,registration_id,total_score,rank,grade,points_awarded,grade_only,points_config_version,points_calculation,collection_method,published,published_at,result_status,public_visible)
    SELECT x.tenant_id,x.festival_id,x.schedule_id,x.item_id,x.registration_id,x.total_score,x.rank,x.grade,x.points_awarded,x.grade_only,x.points_config_version,x.points_calculation,x.collection_method,true,now(),'published',false
    FROM jsonb_populate_record(NULL::public.results,row.value) x
    ON CONFLICT(registration_id,item_id) DO UPDATE SET schedule_id=EXCLUDED.schedule_id,total_score=EXCLUDED.total_score,rank=EXCLUDED.rank,grade=EXCLUDED.grade,
      points_awarded=EXCLUDED.points_awarded,grade_only=EXCLUDED.grade_only,points_config_version=EXCLUDED.points_config_version,points_calculation=EXCLUDED.points_calculation,
      collection_method=EXCLUDED.collection_method,published=true,published_at=now(),result_status='published',public_visible=false;
  END LOOP;
  UPDATE public.schedules SET official_participant_bracket=(SELECT value->'points_calculation'->>'bracket_key' FROM jsonb_each(sealed) LIMIT 1) WHERE id=p_schedule_id;
  RETURN jsonb_build_object('publication_id',p_request_id,'config_version',p_expected_version);
END $$;

CREATE OR REPLACE FUNCTION public.validate_result_points_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE sealed jsonb; k text; BEGIN
  -- Visibility/reopen/archive operations keep historical scoring inputs unchanged.
  IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['published','published_at','published_by','result_status','public_visible','updated_at','updated_by'])
      IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['published','published_at','published_by','result_status','public_visible','updated_at','updated_by'])
      AND (OLD.published IS TRUE OR NEW.published IS NOT TRUE) THEN RETURN NEW; END IF;
  IF NEW.published IS NOT TRUE AND NEW.points_calculation IS NULL AND NEW.points_awarded IS NULL THEN RETURN NEW; END IF;
  PERFORM scoring_private.assert_admin(NEW.tenant_id);
  SELECT p.results_payload->NEW.registration_id::text INTO sealed FROM public.scoring_publications p
    WHERE p.id=(NEW.points_calculation->>'publication_id')::uuid AND p.tenant_id=NEW.tenant_id
      AND p.festival_id=NEW.festival_id AND p.item_id=NEW.item_id AND p.schedule_id=NEW.schedule_id AND p.config_version=NEW.points_config_version;
  IF sealed IS NULL THEN RAISE EXCEPTION 'Publish scoring through the authoritative competition publication API.'; END IF;
  FOREACH k IN ARRAY ARRAY['tenant_id','festival_id','schedule_id','item_id','registration_id','total_score','rank','grade','points_awarded','grade_only','points_config_version','points_calculation','collection_method'] LOOP
    IF sealed->k IS DISTINCT FROM to_jsonb(NEW)->k THEN RAISE EXCEPTION 'Result does not match its verified publication snapshot: %',k; END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION scoring_private.assert_admin(p_tenant uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id=auth.uid()
      AND (p.is_superadmin IS TRUE OR (p.role='admin' AND p.tenant_id=p_tenant AND public.get_my_tenant_id()=p_tenant))
  ) THEN RAISE EXCEPTION 'Administrator access to this tenant is required.' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION scoring_private.whole(v jsonb, positive boolean DEFAULT false) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric; BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'A configured whole number is required.'; END IF;
  n := v::text::numeric;
  IF n<>trunc(n) OR n<0 OR n>2147483647 OR (positive AND n=0) THEN RAISE EXCEPTION 'Configured number is outside its permitted range.'; END IF;
  RETURN n::integer;
END $$;

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
  PERFORM scoring_private.whole(p->'rule12_min_teams',true);
  IF p->>'rule12_behavior' IS NULL OR p->>'rule12_behavior' NOT IN ('grade_only','rank_and_grade','no_points') THEN RAISE EXCEPTION 'Complete minimum-team behaviour.'; END IF;
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

CREATE OR REPLACE FUNCTION scoring_private.check_config_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE item uuid; BEGIN
  PERFORM scoring_private.assert_admin(NEW.tenant_id);
  IF NOT EXISTS (SELECT 1 FROM public.festival_calendar f WHERE f.id=NEW.festival_id AND f.tenant_id=NEW.tenant_id) THEN RAISE EXCEPTION 'Festival is outside configuration ownership.'; END IF;
  PERFORM scoring_private.validate_config(to_jsonb(NEW));
  FOREACH item IN ARRAY (NEW.grade_boost_item_ids || NEW.rank_boost_item_ids) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.items i WHERE i.id=item AND i.tenant_id=NEW.tenant_id AND i.festival_id=NEW.festival_id AND cardinality(i.category_codes)=1) THEN RAISE EXCEPTION 'Boost selections require an owned, single-category competition.'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER scoring_config_write BEFORE INSERT OR UPDATE ON public.points_config FOR EACH ROW EXECUTE FUNCTION scoring_private.check_config_write();

CREATE OR REPLACE FUNCTION public.save_scoring_configuration(p_festival_id uuid,p_expected_version integer,p_config jsonb,p_reason text)
RETURNS public.points_config LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE old public.points_config; v public.points_config; owner uuid; BEGIN
  SELECT tenant_id INTO owner FROM public.festival_calendar WHERE id=p_festival_id;
  PERFORM scoring_private.assert_admin(owner);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_festival_id::text,0));
  SELECT * INTO old FROM public.points_config WHERE festival_id=p_festival_id AND tenant_id=owner FOR UPDATE;
  IF COALESCE(old.config_version,0) IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Reload before saving.' USING ERRCODE='40001'; END IF;
  v:=jsonb_populate_record(NULL::public.points_config,p_config);
  IF old.id IS NULL THEN
    INSERT INTO public.points_config(tenant_id,festival_id,rank_1_points,rank_2_points,rank_3_points,points_mode,grade_thresholds,point_brackets,group_point_brackets,separate_group_brackets,auto_bracket_selection,allow_bracket_override,less_than_3_teams_rule,rule12_min_teams,rule12_behavior,enable_grace_marks,grade_boost_points,group_grade_boost_points,rank_boost_points,grade_boost_item_ids,rank_boost_item_ids,grace_fields,config_version,change_reason)
    VALUES(owner,p_festival_id,v.rank_1_points,v.rank_2_points,v.rank_3_points,v.points_mode,v.grade_thresholds,v.point_brackets,v.group_point_brackets,v.separate_group_brackets,v.auto_bracket_selection,v.allow_bracket_override,v.less_than_3_teams_rule,v.rule12_min_teams,v.rule12_behavior,v.enable_grace_marks,v.grade_boost_points,v.group_grade_boost_points,v.rank_boost_points,v.grade_boost_item_ids,v.rank_boost_item_ids,v.grace_fields,1,p_reason) RETURNING * INTO v;
  ELSE
    UPDATE public.points_config SET rank_1_points=v.rank_1_points,rank_2_points=v.rank_2_points,rank_3_points=v.rank_3_points,points_mode=v.points_mode,
      grade_thresholds=v.grade_thresholds,point_brackets=v.point_brackets,group_point_brackets=v.group_point_brackets,separate_group_brackets=v.separate_group_brackets,
      auto_bracket_selection=v.auto_bracket_selection,allow_bracket_override=v.allow_bracket_override,less_than_3_teams_rule=v.less_than_3_teams_rule,
      rule12_min_teams=v.rule12_min_teams,rule12_behavior=v.rule12_behavior,enable_grace_marks=v.enable_grace_marks,
      grade_boost_points=v.grade_boost_points,group_grade_boost_points=v.group_grade_boost_points,rank_boost_points=v.rank_boost_points,
      grade_boost_item_ids=v.grade_boost_item_ids,rank_boost_item_ids=v.rank_boost_item_ids,grace_fields=v.grace_fields,
      config_version=old.config_version+1,change_reason=p_reason WHERE id=old.id RETURNING * INTO v;
  END IF;
  RETURN v;
END $$;

CREATE TABLE public.grace_workspaces (
  festival_id uuid PRIMARY KEY REFERENCES public.festival_calendar,tenant_id uuid NOT NULL REFERENCES public.tenants,
  config_version integer NOT NULL,revision integer NOT NULL,entries jsonb NOT NULL,
  updated_by uuid NOT NULL REFERENCES public.profiles,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.grace_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.tenants,
  festival_id uuid NOT NULL REFERENCES public.festival_calendar,config_version integer NOT NULL,revision integer NOT NULL,
  entries jsonb NOT NULL,fields_snapshot jsonb NOT NULL,teams_snapshot jsonb NOT NULL,previous_totals jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles,created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(festival_id,config_version,revision)
);
CREATE INDEX grace_submissions_scope ON public.grace_submissions(tenant_id,festival_id);
CREATE TABLE IF NOT EXISTS public.grace_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid REFERENCES public.tenants,festival_id uuid REFERENCES public.festival_calendar,
  org_id uuid REFERENCES public.organisations,points integer,reason text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles,updated_by uuid REFERENCES public.profiles,UNIQUE(festival_id,org_id)
);
ALTER TABLE public.grace_marks ADD COLUMN submission_id uuid REFERENCES public.grace_submissions;
ALTER TABLE public.grace_marks ALTER COLUMN points DROP DEFAULT;
ALTER TABLE public.grace_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grace_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grace_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY grace_workspace_read ON public.grace_workspaces FOR SELECT TO authenticated USING(public.is_superadmin() OR tenant_id=public.get_my_tenant_id());
CREATE POLICY grace_submission_read ON public.grace_submissions FOR SELECT TO authenticated USING(public.is_superadmin() OR tenant_id=public.get_my_tenant_id());
REVOKE ALL ON public.grace_workspaces,public.grace_submissions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.grace_workspaces,public.grace_submissions TO authenticated;
REVOKE ALL ON public.grace_marks FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.grace_marks TO authenticated;

CREATE OR REPLACE FUNCTION scoring_private.grace_teams(p_tenant uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public AS $$
DECLARE root uuid; n integer; BEGIN
  SELECT organisation_id INTO root FROM public.tenants WHERE id=p_tenant;
  IF root IS NULL THEN
    SELECT count(*) INTO n FROM public.organisations WHERE tenant_id=p_tenant;
    IF n<>1 THEN RAISE EXCEPTION 'Resolve the tenant organisation before assigning grace marks.'; END IF;
    SELECT id INTO root FROM public.organisations WHERE tenant_id=p_tenant;
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) ORDER BY o.name,o.id)
    FROM public.organisations o WHERE o.parent_id=root AND o.archived_at IS NULL),'[]');
END $$;

CREATE OR REPLACE FUNCTION public.get_grace_workspace(p_festival_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE c public.points_config; w public.grace_workspaces; last_submit public.grace_submissions; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Configure points and grace fields first.'; END IF;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  SELECT * INTO w FROM public.grace_workspaces WHERE festival_id=p_festival_id;
  SELECT * INTO last_submit FROM public.grace_submissions WHERE festival_id=p_festival_id ORDER BY created_at DESC LIMIT 1;
  RETURN jsonb_build_object('config_version',c.config_version,'enabled',c.enable_grace_marks,'fields',c.grace_fields,
    'teams',scoring_private.grace_teams(c.tenant_id),'entries',COALESCE(w.entries,'{}'),'revision',COALESCE(w.revision,0),
    'draft_config_version',w.config_version,'last_submission',CASE WHEN last_submit.id IS NULL THEN NULL ELSE jsonb_build_object('id',last_submit.id,'revision',last_submit.revision,'config_version',last_submit.config_version,'created_at',last_submit.created_at) END);
END $$;

CREATE OR REPLACE FUNCTION scoring_private.validate_grace(c public.points_config,teams jsonb,entries jsonb,complete boolean) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE team jsonb; field jsonb; org text; key text; val jsonb; BEGIN
  IF c.enable_grace_marks IS NOT TRUE OR jsonb_array_length(c.grace_fields)=0 THEN RAISE EXCEPTION 'Configure and enable grace fields first.'; END IF;
  IF jsonb_typeof(entries) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid grace draft.'; END IF;
  FOR org IN SELECT jsonb_object_keys(entries) LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(teams) t WHERE t->>'id'=org) THEN RAISE EXCEPTION 'Draft includes a team outside this festival.'; END IF;
    IF jsonb_typeof(entries->org) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid team entries.'; END IF;
    FOR key IN SELECT jsonb_object_keys(entries->org) LOOP
      SELECT f INTO field FROM jsonb_array_elements(c.grace_fields) f WHERE f->>'id'=key;
      IF field IS NULL THEN RAISE EXCEPTION 'Draft contains an obsolete grace field. Reload and review.'; END IF;
      val:=entries->org->key;
      IF scoring_private.whole(val)>scoring_private.whole(field->'max_marks',true) THEN RAISE EXCEPTION 'Grace marks exceed configured maximum for %.',field->>'name'; END IF;
    END LOOP;
  END LOOP;
  IF complete THEN
    IF jsonb_array_length(teams)=0 THEN RAISE EXCEPTION 'No participating teams are configured.'; END IF;
    FOR team IN SELECT value FROM jsonb_array_elements(teams) LOOP
      FOR field IN SELECT value FROM jsonb_array_elements(c.grace_fields) LOOP
        IF NOT COALESCE((entries->(team->>'id')) ? (field->>'id'),false) THEN RAISE EXCEPTION 'Complete every grace field for every team before All Submit.'; END IF;
      END LOOP;
    END LOOP;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_grace_draft(p_festival_id uuid,p_expected_version integer,p_expected_revision integer,p_entries jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE c public.points_config; w public.grace_workspaces; teams jsonb; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id FOR SHARE;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  IF c.config_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Reload grace fields.' USING ERRCODE='40001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('grace:'||p_festival_id::text,0));
  SELECT * INTO w FROM public.grace_workspaces WHERE festival_id=p_festival_id FOR UPDATE;
  IF COALESCE(w.revision,0) IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'Grace draft changed in another session. Reload before saving.' USING ERRCODE='40001'; END IF;
  teams:=scoring_private.grace_teams(c.tenant_id);
  PERFORM scoring_private.validate_grace(c,teams,p_entries,false);
  INSERT INTO public.grace_workspaces(festival_id,tenant_id,config_version,revision,entries,updated_by)
    VALUES(p_festival_id,c.tenant_id,c.config_version,COALESCE(w.revision,0)+1,p_entries,auth.uid())
    ON CONFLICT(festival_id) DO UPDATE SET config_version=EXCLUDED.config_version,revision=EXCLUDED.revision,entries=EXCLUDED.entries,updated_by=EXCLUDED.updated_by,updated_at=now();
  RETURN public.get_grace_workspace(p_festival_id);
END $$;

CREATE OR REPLACE FUNCTION public.submit_all_grace_marks(p_festival_id uuid,p_expected_version integer,p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE c public.points_config; w public.grace_workspaces; sub public.grace_submissions; teams jsonb; team jsonb; amount integer; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id FOR SHARE;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  IF c.config_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Configuration changed. Reload grace fields.' USING ERRCODE='40001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('grace:'||p_festival_id::text,0));
  SELECT * INTO w FROM public.grace_workspaces WHERE festival_id=p_festival_id FOR UPDATE;
  IF w.revision IS DISTINCT FROM p_expected_revision OR w.config_version IS DISTINCT FROM c.config_version THEN RAISE EXCEPTION 'Save and review the current draft before All Submit.' USING ERRCODE='40001'; END IF;
  -- Freeze the roster for this short finalization transaction, including concurrent additions.
  LOCK TABLE public.organisations IN SHARE MODE;
  teams:=scoring_private.grace_teams(c.tenant_id);
  PERFORM scoring_private.validate_grace(c,teams,w.entries,true);
  SELECT * INTO sub FROM public.grace_submissions WHERE festival_id=p_festival_id AND revision=w.revision AND config_version=c.config_version;
  IF sub.id IS NOT NULL THEN
    IF sub.teams_snapshot IS DISTINCT FROM teams THEN RAISE EXCEPTION 'Team list changed. Save and review the full draft again.'; END IF;
    RETURN jsonb_build_object('submission_id',sub.id);
  END IF;
  INSERT INTO public.grace_submissions(tenant_id,festival_id,config_version,revision,entries,fields_snapshot,teams_snapshot,previous_totals,created_by)
    VALUES(c.tenant_id,p_festival_id,c.config_version,w.revision,w.entries,c.grace_fields,teams,
      COALESCE((SELECT jsonb_agg(to_jsonb(old)) FROM public.grace_marks old WHERE old.festival_id=p_festival_id AND old.tenant_id=c.tenant_id),'[]'),auth.uid()) RETURNING * INTO sub;
  DELETE FROM public.grace_marks WHERE festival_id=p_festival_id AND tenant_id=c.tenant_id;
  FOR team IN SELECT value FROM jsonb_array_elements(teams) LOOP
    SELECT sum(value::text::integer)::integer INTO amount FROM jsonb_each(w.entries->(team->>'id'));
    INSERT INTO public.grace_marks(tenant_id,festival_id,org_id,points,submission_id,created_by,updated_by)
      VALUES(c.tenant_id,p_festival_id,(team->>'id')::uuid,amount,sub.id,auth.uid(),auth.uid());
  END LOOP;
  RETURN jsonb_build_object('submission_id',sub.id);
END $$;

-- New competitions always have one category. Existing historical arrays are not rewritten.
CREATE OR REPLACE FUNCTION scoring_private.single_competition_category() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$ BEGIN
  IF NEW.festival_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.category_codes IS DISTINCT FROM OLD.category_codes) THEN
    IF cardinality(NEW.category_codes) IS DISTINCT FROM 1 OR nullif(btrim(NEW.category_codes[1]),'') IS NULL THEN RAISE EXCEPTION 'Create a separate competition for each category.'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scoring_single_category BEFORE INSERT OR UPDATE OF category_codes ON public.items FOR EACH ROW EXECUTE FUNCTION scoring_private.single_competition_category();

-- Configured, token-scoped grade context. This does not alter token use/finalization/reset rules.
CREATE OR REPLACE FUNCTION public.get_judge_scoring_context(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE t public.judge_tokens; c public.points_config; BEGIN
  SELECT * INTO t FROM public.judge_tokens WHERE (token=upper(btrim(p_token)) OR token_hash=encode(extensions.digest(upper(btrim(p_token)),'sha256'),'hex'))
    AND status='approved' AND is_used=false AND is_revoked IS NOT TRUE AND (expires_at IS NULL OR expires_at>now()) ORDER BY created_at DESC LIMIT 1;
  IF t.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.schedule_judge_assignments a WHERE a.schedule_id=t.schedule_id AND a.judge_id=t.judge_id AND a.tenant_id=t.tenant_id AND a.status='active') THEN RAISE EXCEPTION 'Invalid or inactive judge access code.' USING ERRCODE='42501'; END IF;
  SELECT pc.* INTO c FROM public.points_config pc JOIN public.schedules s ON s.festival_id=pc.festival_id AND s.tenant_id=pc.tenant_id WHERE s.id=t.schedule_id;
  IF c.id IS NULL THEN RETURN jsonb_build_object('configured',false); END IF;
  RETURN jsonb_build_object('configured',true,'config_version',c.config_version,'grade_thresholds',c.grade_thresholds);
END $$;

-- All new publication rows are sealed; immutable history cannot be overwritten by clients.
REVOKE ALL ON public.points_config_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.points_config_versions TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA scoring_private FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.save_scoring_configuration(uuid,integer,jsonb,text),
  public.preview_competition_points(uuid,integer,jsonb,text,text,integer),
  public.publish_competition_results(uuid,integer,jsonb,text,uuid,text,integer),
  public.get_grace_workspace(uuid),public.save_grace_draft(uuid,integer,integer,jsonb),public.submit_all_grace_marks(uuid,integer,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_scoring_configuration(uuid,integer,jsonb,text),
  public.preview_competition_points(uuid,integer,jsonb,text,text,integer),
  public.publish_competition_results(uuid,integer,jsonb,text,uuid,text,integer),
  public.get_grace_workspace(uuid),public.save_grace_draft(uuid,integer,integer,jsonb),public.submit_all_grace_marks(uuid,integer,integer)
  TO authenticated;
REVOKE ALL ON FUNCTION public.get_judge_scoring_context(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_judge_scoring_context(text) TO anon,authenticated;
-- Baseline-only compatibility RPCs: an older caller must never silently miss an item boost.
CREATE OR REPLACE FUNCTION public.calculate_festival_points(p_festival_id uuid,p_grade text,p_rank integer,p_group_size integer,p_competing_teams_count integer,p_is_group boolean DEFAULT false,p_bracket_override text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE c public.points_config; BEGIN
  SELECT * INTO c FROM public.points_config WHERE festival_id=p_festival_id;
  PERFORM scoring_private.assert_admin(c.tenant_id);
  IF c.id IS NULL THEN RAISE EXCEPTION 'Configure points before calculating awards.'; END IF;
  PERFORM scoring_private.validate_config(to_jsonb(c));
  IF cardinality(c.grade_boost_item_ids)>0 OR cardinality(c.rank_boost_item_ids)>0 THEN RAISE EXCEPTION 'Use the competition-scoped scoring API for configured boosts.'; END IF;
  RETURN scoring_private.award(to_jsonb(c),NULL,p_grade,p_rank,p_group_size,p_competing_teams_count,p_is_group,p_bracket_override);
END $$;
CREATE OR REPLACE FUNCTION public.calculate_festival_points(p_festival_id uuid,p_grade text,p_rank integer,p_participant_count integer,p_is_group boolean DEFAULT false,p_bracket_override text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT public.calculate_festival_points(p_festival_id,p_grade,p_rank,p_participant_count,p_participant_count,p_is_group,p_bracket_override);
$$;
REVOKE ALL ON FUNCTION public.calculate_festival_points(uuid,text,integer,integer,integer,boolean,text),public.calculate_festival_points(uuid,text,integer,integer,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.calculate_festival_points(uuid,text,integer,integer,integer,boolean,text),public.calculate_festival_points(uuid,text,integer,integer,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_competition_items(p_festival_id uuid,p_codes text[],p_records jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,scoring_private AS $$
DECLARE owner uuid; code text; rec jsonb; BEGIN
  SELECT tenant_id INTO owner FROM public.festival_calendar WHERE id=p_festival_id;
  PERFORM scoring_private.assert_admin(owner);
  PERFORM pg_advisory_xact_lock(hashtextextended('items:'||p_festival_id::text,0));
  IF p_codes IS NULL OR (SELECT count(DISTINCT c) FROM unnest(p_codes) c)<>cardinality(p_codes) THEN RAISE EXCEPTION 'Competition selections must be unique.'; END IF;
  UPDATE public.items SET is_active=item_code=ANY(p_codes) WHERE festival_id=p_festival_id AND tenant_id=owner;
  FOREACH code IN ARRAY p_codes LOOP
    IF EXISTS(SELECT 1 FROM public.items WHERE festival_id=p_festival_id AND item_code=code AND tenant_id=owner) THEN CONTINUE; END IF;
    SELECT value INTO rec FROM jsonb_array_elements(p_records) WHERE value->>'item_code'=code LIMIT 1;
    IF rec IS NULL OR nullif(btrim(rec->>'item_name_ml'),'') IS NULL OR jsonb_array_length(rec->'category_codes')<>1 THEN RAISE EXCEPTION 'A complete single-category competition is required.'; END IF;
    INSERT INTO public.items(tenant_id,festival_id,item_code,item_name_ml,item_name_en,category_codes,participation_type,source,is_active,duration_minutes)
      VALUES(owner,p_festival_id,code,rec->>'item_name_ml',COALESCE(rec->>'item_name_en',rec->>'item_name_ml'),
        ARRAY(SELECT jsonb_array_elements_text(rec->'category_codes')),rec->>'participation_type',COALESCE(rec->>'source','custom'),true,(rec->>'duration_minutes')::integer);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.save_competition_items(uuid,text[],jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_competition_items(uuid,text[],jsonb) TO authenticated;

-- Existing aggregators already add final grace to teams with results. Include a
-- submitted grace-only team as well, without changing their visibility gates,
-- item-limit CTE, result counts, ranking order or participant/group semantics.
DO $aggregate$
DECLARE proc record; definition text; addition text; patched text; BEGIN
  addition:=$union$
  UNION ALL
  SELECT go.id,go.name,go.org_type,go.parent_id,gm.points::bigint,
    0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,0::bigint,NULL::timestamptz,gm.points::bigint
  FROM public.grace_marks gm JOIN public.organisations go ON go.id=gm.org_id
  WHERE v_enable_grace_marks AND gm.festival_id=v_festival_id AND gm.tenant_id=v_festival_tenant_id AND gm.submission_id IS NOT NULL
    AND (go.tenant_id=v_festival_tenant_id OR go.parent_id IN(SELECT id FROM public.organisations WHERE tenant_id=v_festival_tenant_id)
      OR go.tenant_id IN(SELECT o2.tenant_id FROM public.organisations o2 WHERE o2.id=go.parent_id AND o2.tenant_id=v_festival_tenant_id))
    AND NOT EXISTS(SELECT 1 FROM deduped_results dr LEFT JOIN public.registrations gr ON gr.id=dr.registration_id
      LEFT JOIN public.participants gp ON gp.id=gr.participant_id WHERE COALESCE(gr.organisation_id,gp.organisation_id)=go.id)
$union$;
  FOR proc IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN('get_public_leaderboard','get_admin_leaderboard','get_leaderboard_preview') LOOP
    definition:=pg_get_functiondef(proc.oid);
    -- Older installations without migration 166 cannot expose grace totals yet.
    IF position('v_enable_grace_marks' IN definition)=0 THEN CONTINUE; END IF;
    patched:=regexp_replace(definition,'([[:space:]]+ORDER BY total_points DESC)',addition||'\1');
    IF patched=definition THEN RAISE EXCEPTION 'Unrecognized leaderboard aggregator. Review grace-only team support before release.'; END IF;
    EXECUTE patched;
  END LOOP;
END $aggregate$;
COMMIT;
NOTIFY pgrst,'reload schema';
