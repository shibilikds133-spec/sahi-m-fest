-- Run only in an isolated local rehearsal database after the scoring migration.
-- Every fixture and assertion is rolled back. Numbers here are deliberately test data, not defaults.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',message; END IF;
END $$;
CREATE FUNCTION pg_temp.denied(query text,message text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean:=false; BEGIN
  BEGIN EXECUTE query; EXCEPTION WHEN OTHERS THEN failed:=true; END;
  PERFORM pg_temp.assert(failed,message);
END $$;
DO $$
DECLARE tenant uuid:=gen_random_uuid(); other_tenant uuid:=gen_random_uuid(); admin uuid:=gen_random_uuid(); judge_user uuid:=gen_random_uuid();
  festival uuid:=gen_random_uuid(); root uuid:=gen_random_uuid(); fields jsonb; config jsonb; saved public.points_config;
  item_ids uuid[]:='{}'; schedule_ids uuid[]:='{}'; team_ids uuid[]:='{}'; reg_ids uuid[]:='{}';
  item uuid; schedule uuid; team uuid; participant uuid; reg uuid; i integer; j integer;
  entries jsonb; answer jsonb; award jsonb; draft jsonb:='{}'; workspace jsonb; submission jsonb; request uuid;
  f1 uuid:=gen_random_uuid(); f2 uuid:=gen_random_uuid(); expected integer[]:=ARRAY[16,24,22,30]; ctx jsonb;
  token_id uuid:=gen_random_uuid(); judge_id uuid:=gen_random_uuid(); token_value text:=upper(gen_random_uuid()::text);
BEGIN
  INSERT INTO public.tenants(id,name,org_type) VALUES(tenant,'Scoring test tenant','sector'),(other_tenant,'Other tenant','sector');
  INSERT INTO auth.users(id,email) VALUES(admin,'scoring-test-'||admin||'@example.invalid'),(judge_user,'scoring-judge-'||judge_user||'@example.invalid');
  INSERT INTO public.profiles(id,tenant_id,role,is_superadmin) VALUES(admin,tenant,'admin',false),(judge_user,tenant,'judge',false)
    ON CONFLICT(id) DO UPDATE SET tenant_id=EXCLUDED.tenant_id,role=EXCLUDED.role,is_superadmin=false;
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  INSERT INTO public.organisations(id,tenant_id,name,org_type) VALUES(root,tenant,'Test root','sector');
  UPDATE public.tenants SET organisation_id=root WHERE id=tenant;
  INSERT INTO public.festival_calendar(id,tenant_id,festival_year,level,is_active,festival_template)
    VALUES(festival,tenant,2026,'sector',true,'sahithyolsav');
  FOR i IN 1..3 LOOP
    team:=gen_random_uuid(); team_ids:=array_append(team_ids,team);
    INSERT INTO public.organisations(id,tenant_id,name,org_type,parent_id) VALUES(team,tenant,'Team '||i,'unit',root);
  END LOOP;
  FOR i IN 1..4 LOOP
    item:=gen_random_uuid(); schedule:=gen_random_uuid(); item_ids:=array_append(item_ids,item); schedule_ids:=array_append(schedule_ids,schedule);
    INSERT INTO public.items(id,tenant_id,festival_id,item_code,item_name_en,category_codes,participation_type,is_active)
      VALUES(item,tenant,festival,'SCORING-TEST-'||i,'Speech',ARRAY['LP'],'individual',true);
    INSERT INTO public.schedules(id,tenant_id,festival_id,item_id) VALUES(schedule,tenant,festival,item);
    FOR j IN 1..3 LOOP
      participant:=gen_random_uuid(); reg:=gen_random_uuid();
      INSERT INTO public.participants(id,tenant_id,festival_id,name,organisation_id,category_code,status) VALUES(participant,tenant,festival,'Participant '||i||'-'||j,team_ids[j],'LP','approved');
      INSERT INTO public.registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id,status,is_verified,code_letter)
        VALUES(reg,tenant,festival,item,participant,team_ids[j],'approved',true,'C'||j);
    END LOOP;
  END LOOP;
  fields:=jsonb_build_array(jsonb_build_object('id',f1,'name','Test field one','max_marks',11),jsonb_build_object('id',f2,'name','Test field two','max_marks',31));
  config:=jsonb_build_object('points_mode','custom','rank_1_points',7,'rank_2_points',4,'rank_3_points',2,
    'grade_thresholds',jsonb_build_object('a_plus',91,'a',78,'b',63,'c',42),
    'point_brackets',jsonb_build_array(jsonb_build_object('key','shared','label','One to twenty','min',1,'max',20,'enabled',true,'points',jsonb_build_array(9,6,3,1))),
    'group_point_brackets','[]'::jsonb,'separate_group_brackets',false,'auto_bracket_selection',true,'allow_bracket_override',true,
    'less_than_3_teams_rule',true,'rule12_min_teams',3,'rule12_behavior','grade_only','enable_grace_marks',true,
    'grade_boost_points',jsonb_build_object('shared',jsonb_build_array(17,14,11,8)),'group_grade_boost_points','{}'::jsonb,
    'rank_boost_points',jsonb_build_array(13,10,5),'grade_boost_item_ids',jsonb_build_array(item_ids[2],item_ids[4]),
    'rank_boost_item_ids',jsonb_build_array(item_ids[3],item_ids[4]),'grace_fields',fields);
  saved:=public.save_scoring_configuration(festival,0,config,'Test configuration');
  PERFORM pg_temp.assert(saved.config_version=1,'first configuration version');
  PERFORM pg_temp.denied(format('select public.save_scoring_configuration(%L,1,%L::jsonb,null)',festival,
    config||'{"grade_boost_enabled":false}'::jsonb),'grade boost with assigned competitions cannot turn off');
  PERFORM pg_temp.denied(format('select public.save_scoring_configuration(%L,1,%L::jsonb,null)',festival,
    config||'{"rank_boost_enabled":false}'::jsonb),'rank boost with assigned competitions cannot turn off');
  PERFORM pg_temp.denied(format('update public.points_config set grade_boost_enabled=false where festival_id=%L',festival),
    'direct database update cannot disable an assigned boost');
  award:=scoring_private.award(config||jsonb_build_object('member_brackets_enabled',false,
    'point_brackets',jsonb_build_array(
      jsonb_build_object('key','large','label','Large','min',21,'max',40,'enabled',true,'points',jsonb_build_array(5,4,3,2)),
      jsonb_set(config->'point_brackets'->0,'{min}','4'::jsonb))),
    item_ids[4],'A+',1,100,3,false,NULL);
  PERFORM pg_temp.assert(award->>'profile'='both' AND (award->>'total')::integer=30,
    'member-count OFF uses the smallest configured range regardless of array order and group size');
  PERFORM pg_temp.denied(format('select public.save_scoring_configuration(%L,0,%L::jsonb,null)',festival,config),'stale config save rejected');
  PERFORM pg_temp.denied(format('select public.save_scoring_configuration(%L,1,%L::jsonb,null)',festival,config-'grade_thresholds'),'missing thresholds rejected');
  FOR i IN 1..4 LOOP
    SELECT jsonb_agg(jsonb_build_object('registration_id',r.id,'raw_marks',jsonb_build_array(jsonb_build_object('total',CASE r.code_letter WHEN 'C1' THEN 76 WHEN 'C2' THEN 64 ELSE 52 END,'maximum',80))) ORDER BY r.code_letter)
      INTO entries FROM public.registrations r WHERE r.item_id=item_ids[i];
    answer:=public.preview_competition_points(schedule_ids[i],1,entries,'manual');
    SELECT value->'calculation' INTO award FROM jsonb_each(answer->'results') WHERE (value->>'rank')::integer=1;
    PERFORM pg_temp.assert((award->>'total')::integer=expected[i],'four-profile composition '||i);
    request:=gen_random_uuid();
    PERFORM public.publish_competition_results(schedule_ids[i],1,entries,'manual',request);
    PERFORM public.publish_competition_results(schedule_ids[i],1,entries,'manual',request);
    PERFORM pg_temp.assert((SELECT count(*)=3 FROM public.results WHERE schedule_id=schedule_ids[i]),'retry cannot duplicate awards');
    PERFORM pg_temp.assert((SELECT count(*)=1 FROM public.scoring_publications WHERE id=request),'retry uses the same sealed publication');
    PERFORM pg_temp.denied(format('update public.results set points_awarded=999 where schedule_id=%L',schedule_ids[i]),'forged direct award denied');
    PERFORM pg_temp.denied(format('select public.publish_competition_results(%L,1,%L::jsonb,''manual'',%L)',schedule_ids[i],'[]',gen_random_uuid()),'incomplete result batch rejected');
  END LOOP;
  PERFORM pg_temp.assert((SELECT count(*)=12 FROM public.results WHERE festival_id=festival),'only verified awards persisted');
  PERFORM pg_temp.denied(format('select public.publish_competition_results(%L,1,%L::jsonb,''manual'',%L)',schedule_ids[4],jsonb_set(entries,'{0,raw_marks,0,maximum}','0'),gen_random_uuid()),'one invalid mark rolls back entire publication');
  PERFORM pg_temp.assert((SELECT count(*)=4 FROM public.scoring_publications WHERE festival_id=festival),'invalid batch cannot leave a partial publication');
  PERFORM public.save_competition_items(festival,ARRAY['SCORING-TEST-1','SCORING-TEST-2','SCORING-TEST-3','SCORING-TEST-4','SPEECH-LP','SPEECH-UP'],
    '[{"item_code":"SPEECH-LP","item_name_ml":"Speech","category_codes":["LP"],"participation_type":"individual"},{"item_code":"SPEECH-UP","item_name_ml":"Speech","category_codes":["UP"],"participation_type":"individual"}]');
  PERFORM pg_temp.assert((SELECT count(DISTINCT id)=2 AND bool_and(cardinality(category_codes)=1) FROM public.items WHERE festival_id=festival AND item_code IN('SPEECH-LP','SPEECH-UP')),'bulk category selection creates distinct single-category item identities');
  PERFORM pg_temp.denied(format('select public.save_competition_items(%L,ARRAY[''BAD''],%L::jsonb)',festival,'[{"item_code":"BAD","item_name_ml":"Speech","category_codes":["LP","UP"],"participation_type":"individual"}]'),'invalid bulk item batch rejected');
  PERFORM pg_temp.assert((SELECT count(*)=6 FROM public.items WHERE festival_id=festival AND is_active),'invalid item batch does not partially deactivate existing competitions');
  PERFORM pg_temp.denied(format('insert into public.items(tenant_id,festival_id,item_code,item_name_ml,category_codes,participation_type,source) values(%L,%L,''GROUP-NO-SIZE'',''Group'',ARRAY[''LP''],''group'',''custom'')',tenant,festival),
    'new custom group cannot be created without member count');
  item:=gen_random_uuid(); schedule:=gen_random_uuid();
  INSERT INTO public.items(id,tenant_id,festival_id,item_code,item_name_ml,category_codes,participation_type,source,group_min_members,group_max_members)
    VALUES(item,tenant,festival,'GROUP-SIZE-TEST','Group',ARRAY['LP'],'group','custom',5,5);
  INSERT INTO public.schedules(id,tenant_id,festival_id,item_id) VALUES(schedule,tenant,festival,item);
  FOR j IN 1..3 LOOP
    SELECT id INTO participant FROM public.participants WHERE festival_id=festival AND organisation_id=team_ids[j] LIMIT 1;
    INSERT INTO public.registrations(tenant_id,festival_id,item_id,participant_id,organisation_id,status,is_verified,code_letter)
      VALUES(tenant,festival,item,participant,team_ids[j],'approved',true,'G'||j);
  END LOOP;
  SELECT jsonb_agg(jsonb_build_object('registration_id',r.id,'raw_marks',jsonb_build_array(jsonb_build_object('total',70,'maximum',80))))
    INTO entries FROM public.registrations r WHERE r.item_id=item;
  answer:=public.preview_competition_points(schedule,1,entries,'manual');
  PERFORM pg_temp.assert((SELECT bool_and((value->'calculation'->>'group_size')::integer=5) FROM jsonb_each(answer->'results')),
    'preview uses the group size configured on the item even when no member names are added');
  PERFORM pg_temp.denied(format('select public.preview_competition_points(%L,1,%L::jsonb,''manual'',null,2)',schedule,entries),
    'manual size cannot replace a fixed custom group size');
  PERFORM pg_temp.denied(format('insert into public.items(tenant_id,festival_id,item_code,category_codes) values(%L,%L,''MULTI'',ARRAY[''LP'',''UP''])',tenant,festival),'multi-category identity rejected');
  PERFORM pg_temp.denied(format('select public.preview_competition_points(%L,0,%L::jsonb,''manual'')',schedule_ids[1],entries),'stale preview rejected');
  config:=jsonb_set(config,'{rank_1_points}','1');
  saved:=public.save_scoring_configuration(festival,1,config,'Lower rank points');
  PERFORM pg_temp.assert((SELECT points_awarded=16 FROM public.results WHERE schedule_id=schedule_ids[1] AND rank=1),'editing config preserves old published result');
  SELECT jsonb_agg(jsonb_build_object('registration_id',r.id,'raw_marks',jsonb_build_array(jsonb_build_object('total',CASE r.code_letter WHEN 'C1' THEN 76 WHEN 'C2' THEN 64 ELSE 52 END,'maximum',80)))) INTO entries FROM public.registrations r WHERE r.item_id=item_ids[1];
  PERFORM public.publish_competition_results(schedule_ids[1],2,entries,'manual',gen_random_uuid());
  PERFORM pg_temp.assert((SELECT points_awarded=10 FROM public.results WHERE schedule_id=schedule_ids[1] AND rank=1),'republish can reduce an award');
  PERFORM pg_temp.assert((SELECT count(*)=2 FROM public.points_config_versions WHERE festival_id=festival),'configuration versions retained');
  PERFORM pg_temp.assert((SELECT bool_or(jsonb_array_length(previous_results)=3) FROM public.scoring_publications WHERE schedule_id=schedule_ids[1]),'republish retains replaced result rows in history');

  draft:=jsonb_build_object(team_ids[1]::text,jsonb_build_object(f1::text,0,f2::text,6));
  workspace:=public.save_grace_draft(festival,2,0,draft);
  PERFORM pg_temp.assert((SELECT count(*)=0 FROM public.grace_marks WHERE festival_id=festival),'draft cannot reach final points');
  PERFORM pg_temp.denied(format('select public.submit_all_grace_marks(%L,2,1)',festival),'all teams required before All Submit');
  PERFORM pg_temp.denied(format('select public.save_grace_draft(%L,2,1,%L::jsonb)',festival,jsonb_build_object(team_ids[1]::text,jsonb_build_object(f1::text,12))),'configured maximum enforced');
  FOR i IN 2..3 LOOP draft:=draft||jsonb_build_object(team_ids[i]::text,jsonb_build_object(f1::text,i,f2::text,i+1)); END LOOP;
  workspace:=public.save_grace_draft(festival,2,1,draft);
  submission:=public.submit_all_grace_marks(festival,2,2);
  PERFORM pg_temp.assert((SELECT count(*)=3 FROM public.grace_marks WHERE festival_id=festival),'All Submit publishes actual team count');
  PERFORM pg_temp.assert((SELECT points=6 FROM public.grace_marks WHERE festival_id=festival AND org_id=team_ids[1]),'explicit zero and field sum');
  PERFORM pg_temp.assert(public.submit_all_grace_marks(festival,2,2)=submission,'All Submit retry is idempotent');
  workspace:=public.save_grace_draft(festival,2,2,jsonb_set(draft,ARRAY[team_ids[1]::text,f2::text],'4'));
  PERFORM pg_temp.assert((SELECT points=6 FROM public.grace_marks WHERE festival_id=festival AND org_id=team_ids[1]),'editing draft after submit leaves final total unchanged');
  PERFORM pg_temp.denied(format('select public.submit_all_grace_marks(%L,2,2)',festival),'stale submit revision rejected');
  PERFORM public.submit_all_grace_marks(festival,2,3);
  PERFORM pg_temp.assert((SELECT points=4 FROM public.grace_marks WHERE festival_id=festival AND org_id=team_ids[1]),'new submission replaces rather than adds to final grace');
  PERFORM pg_temp.assert((SELECT bool_or(jsonb_array_length(previous_totals)=3) FROM public.grace_submissions WHERE festival_id=festival),'replaced grace totals retained in submission history');
  -- A team with no counted competition result still receives its submitted grace.
  IF EXISTS(SELECT 1 FROM pg_proc WHERE proname='get_admin_leaderboard' AND position('v_enable_grace_marks' IN pg_get_functiondef(oid))>0) THEN
    UPDATE public.registrations SET status='rejected' WHERE festival_id=festival AND organisation_id=team_ids[3];
    PERFORM pg_temp.assert((SELECT total_points=7 AND result_count=0 FROM public.get_admin_leaderboard(tenant,festival) WHERE organisation_id=team_ids[3]),'grace-only team reaches admin final totals without fake results');
    PERFORM pg_temp.assert((SELECT total_points=7 AND result_count=0 FROM public.get_public_leaderboard(tenant,festival) WHERE organisation_id=team_ids[3]),'grace-only team reaches public totals without fake results');
    IF to_regprocedure('public.get_leaderboard_preview(uuid,uuid,text,integer,boolean)') IS NOT NULL THEN
      PERFORM pg_temp.assert((SELECT total_points=7 AND result_count=0 FROM public.get_leaderboard_preview(tenant,festival,'ALL',NULL,true) WHERE organisation_id=team_ids[3]),'preview includes submitted grace-only teams');
    END IF;
    UPDATE public.registrations SET status='approved' WHERE festival_id=festival AND organisation_id=team_ids[3];
  END IF;

  INSERT INTO public.judges(id,tenant_id,festival_id,name) VALUES(judge_id,tenant,festival,'Test judge');
  INSERT INTO public.schedule_judge_assignments(tenant_id,schedule_id,judge_id,status) VALUES(tenant,schedule_ids[1],judge_id,'active');
  INSERT INTO public.judge_tokens(id,tenant_id,schedule_id,judge_id,token,is_used,status,is_revoked,expires_at) VALUES(token_id,tenant,schedule_ids[1],judge_id,token_value,false,'approved',false,now()+interval '1 hour');
  ctx:=public.get_judge_scoring_context(token_value);
  PERFORM pg_temp.assert(ctx->'grade_thresholds'=config->'grade_thresholds','judge receives configured grade percentages');
  SELECT id INTO reg FROM public.registrations WHERE item_id=item_ids[1] AND code_letter='C1';
  PERFORM public.upsert_judge_mark(token_value,reg,'{}',76,'final','total_only',80,'[]');
  PERFORM pg_temp.assert((SELECT max_mark_snapshot=80 FROM public.mark_entries WHERE schedule_id=schedule_ids[1] AND registration_id=reg),'judge maximum is explicit, not 100');
  PERFORM pg_temp.denied(format('select public.upsert_judge_mark(%L,%L,''{}'',70,''final'',''total_only'',80,''[]'')',token_value,reg),'final marks cannot be resubmitted or changed by judge');
  PERFORM pg_temp.denied(format('update public.mark_entries set total_mark=70 where schedule_id=%L',schedule_ids[1]),'final mark trigger remains locked');
  FOR j IN 2..3 LOOP
    SELECT id INTO reg FROM public.registrations WHERE item_id=item_ids[1] AND code_letter='C'||j;
    PERFORM public.upsert_judge_mark(token_value,reg,'{}',CASE j WHEN 2 THEN 64 ELSE 52 END,'final','total_only',80,'[]');
  END LOOP;
  participant:=gen_random_uuid();
  INSERT INTO public.judges(id,tenant_id,festival_id,name) VALUES(participant,tenant,festival,'Removed judge');
  INSERT INTO public.schedule_judge_assignments(tenant_id,schedule_id,judge_id,status) VALUES(tenant,schedule_ids[1],participant,'active');
  INSERT INTO public.mark_entries(tenant_id,schedule_id,registration_id,judge_id,total_mark,criteria_scores,entry_mode_snapshot,max_mark_snapshot,criteria_snapshot,is_final,is_draft)
    VALUES(tenant,schedule_ids[1],reg,participant,80,'{}','total_only',80,'[]',true,false);
  UPDATE public.schedule_judge_assignments a SET status='removed' WHERE a.schedule_id=schedule_ids[1] AND a.judge_id=participant;
  SELECT jsonb_agg(jsonb_build_object('registration_id',r.id)) INTO entries FROM public.registrations r WHERE r.item_id=item_ids[1];
  answer:=public.preview_competition_points(schedule_ids[1],2,entries,'judges');
  PERFORM pg_temp.assert(answer->'results'->reg::text->>'grade'='B','removed judge scores cannot affect final awards');
  UPDATE public.judge_tokens SET is_used=true WHERE id=token_id;
  PERFORM pg_temp.denied(format('select public.get_judge_scoring_context(%L)',token_value),'used judge token cannot access active context');
  PERFORM pg_temp.denied(format('select public.upsert_judge_mark(%L,%L,''{}'',76,''draft'',''total_only'',80,''[]'')',token_value,reg),'used token cannot save marks');
  config:=jsonb_set(config,'{point_brackets,0,min}','4'::jsonb)||'{"member_brackets_enabled":false}'::jsonb;
  saved:=public.save_scoring_configuration(festival,2,config,'Use one configured range for all entry sizes');
  PERFORM pg_temp.assert(saved.config_version=3 AND NOT saved.member_brackets_enabled,
    'member-count switch persists without a hardcoded member number');
  answer:=public.preview_competition_points(schedule_ids[1],3,entries,'judges');
  PERFORM pg_temp.assert((SELECT bool_and(value->'calculation'->>'bracket_key'='shared') FROM jsonb_each(answer->'results')),
    'published preview uses configured bracket with member-count switch off');
  PERFORM set_config('request.jwt.claim.sub',judge_user::text,true);
  PERFORM pg_temp.denied(format('select public.save_scoring_configuration(%L,3,%L::jsonb,null)',festival,config),'judge cannot edit points');
  PERFORM pg_temp.denied(format('select public.get_grace_workspace(%L)',festival),'judge cannot edit grace');
  PERFORM set_config('request.jwt.claim.sub',admin::text,true);
  UPDATE public.profiles SET tenant_id=other_tenant WHERE id=admin;
  PERFORM pg_temp.denied(format('select public.get_grace_workspace(%L)',festival),'cross-tenant admin denied');
  RAISE NOTICE 'PASS: profiles, authoritative publication, history, draft/final grace, tenant roles and used-token checks';
END $$;
ROLLBACK;
