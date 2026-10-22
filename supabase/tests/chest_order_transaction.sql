BEGIN;
CREATE FUNCTION pg_temp.expect_chest_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RETURN; ELSE RAISE; END IF;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE % for %',expected,statement;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
DO $$
DECLARE
 f uuid:='00000000-0000-4000-8000-000000000011';
 a uuid:='00000000-0000-4000-8000-000000000021';
 b uuid:='00000000-0000-4000-8000-000000000022';
 c uuid:='00000000-0000-4000-8000-000000000023';
 state jsonb; before_numbers jsonb;
BEGIN
 state:=public.get_festival_chest_order(f);
 IF state->>'locked'<>'false' OR jsonb_array_length(state->'teams')<>3 THEN RAISE EXCEPTION 'Initial state incorrect'; END IF;
 state:=public.save_festival_chest_order(f,ARRAY[b,a,c],ARRAY[a,b,c],0,100);
 IF state->>'revision'<>'1' OR state->'teams'->0->>'id'<>b::text THEN RAISE EXCEPTION 'Order not saved'; END IF;
 IF (SELECT chest_number FROM public.participants WHERE name='Student One')<>'200' OR
    (SELECT chest_number FROM public.participants WHERE name='Student Two')<>'201' OR
    (SELECT chest_number FROM public.participants WHERE name='Student Three')<>'100' THEN RAISE EXCEPTION 'Numbers do not match slots'; END IF;
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,0,100)','00000000-0000-4000-8000-000000000012',ARRAY[b,a,c],ARRAY[a,b,c]),'P0001');
 IF (SELECT slot_number FROM public.festival_team_chest_slots WHERE festival_id='00000000-0000-4000-8000-000000000012' AND organisation_id=a)<>1 OR
    EXISTS(SELECT 1 FROM public.festival_chest_number_controls WHERE festival_id='00000000-0000-4000-8000-000000000012') THEN RAISE EXCEPTION 'Failed regeneration must roll back its order and revision'; END IF;
 INSERT INTO public.organisations(id,parent_id,tenant_id,name) VALUES ('00000000-0000-4000-8000-000000000024','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','New team');
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,1,100)',f,ARRAY[a,b,c],ARRAY[b,a,c]),'40001');
 DELETE FROM public.organisations WHERE id='00000000-0000-4000-8000-000000000024';
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,0,100)',f,ARRAY[a,b,c],ARRAY[a,b,c]),'40001');
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,1,100)',f,ARRAY[a,a,c],ARRAY[b,a,c]),'P0001');
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,1,100)',f,ARRAY[a,c],ARRAY[b,a,c]),'P0001');
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,1,100)',f,ARRAY[a,b,'00000000-0000-4000-8000-000000000999'::uuid],ARRAY[b,a,c]),'P0001');
 UPDATE public.participants SET chest_number='999' WHERE name='Student One';
 PERFORM pg_temp.expect_chest_error(format('select public.set_festival_chest_lock(%L,true,1,%L,100)',f,ARRAY[b,a,c]),'P0001');
 IF (public.get_festival_chest_order(f)->>'locked')::boolean THEN RAISE EXCEPTION 'Invalid numbers must not become finally locked'; END IF;
 UPDATE public.participants SET chest_number='200' WHERE name='Student One';
 state:=public.set_festival_chest_lock(f,true,1,ARRAY[b,a,c],100);
 IF state->>'locked'<>'true' OR state->>'revision'<>'2' THEN RAISE EXCEPTION 'Final lock failed'; END IF;
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,2,100)',f,ARRAY[a,b,c],ARRAY[b,a,c]),'55000');
 PERFORM pg_temp.expect_chest_error(format('select public.regenerate_festival_chest_numbers(%L)',f),'55000');
 PERFORM pg_temp.expect_chest_error(format('select public.regenerate_festival_chest_numbers_internal(%L)',f),'55000');
 PERFORM pg_temp.expect_chest_error(format('update public.festival_calendar set chest_number_category_range=1000 where id=%L',f),'55000');
 PERFORM pg_temp.expect_chest_error(format('update public.festival_calendar set chest_number_template=''category'' where id=%L',f),'55000');
 PERFORM pg_temp.expect_chest_error('update public.participants set chest_number=''299'' where name=''Student One''','55000');
 PERFORM pg_temp.expect_chest_error(format('update public.participants set organisation_id=%L where name=''Student One''',b),'55000');
 PERFORM pg_temp.expect_chest_error(format('update public.festival_team_chest_slots set slot_number=9 where festival_id=%L and organisation_id=%L',f,a),'55000');
 PERFORM pg_temp.expect_chest_error(format('delete from public.festival_team_chest_slots where festival_id=%L and organisation_id=%L',f,a),'55000');
 PERFORM public.set_festival_chest_lock('00000000-0000-4000-8000-000000000013',true,0,ARRAY[a,b,c],100);
 PERFORM pg_temp.expect_chest_error('select public.regenerate_festival_chest_numbers_internal(''00000000-0000-4000-8000-000000000013'')','55000');
 DELETE FROM public.festival_calendar WHERE id='00000000-0000-4000-8000-000000000013';
 -- Non-number edits and allocating an unused number in an existing range remain valid.
 UPDATE public.participants SET name='Student One Edited' WHERE name='Student One';
 INSERT INTO public.participants VALUES ('00000000-0000-4000-8000-000000000204',f,'00000000-0000-4000-8000-000000000001',a,'202','New Student','HS');
 SELECT jsonb_object_agg(id,chest_number) INTO before_numbers FROM public.participants;
 PERFORM pg_temp.expect_chest_error(format('select public.set_festival_chest_lock(%L,false,2,%L,100,''wrong'')',f,ARRAY[b,a,c]),'42501');
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000102',true);
 PERFORM pg_temp.expect_chest_error(format('select public.get_festival_chest_order(%L)',f),'42501');
 PERFORM pg_temp.expect_chest_error(format('select public.set_festival_chest_lock(%L,false,2,%L,100,''00000000-0000-4000-8000-000000000001'')',f,ARRAY[b,a,c]),'42501');
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000103',true);
 PERFORM pg_temp.expect_chest_error(format('select public.set_festival_chest_lock(%L,false,2,%L,100,''00000000-0000-4000-8000-000000000001'')',f,ARRAY[b,a,c]),'42501');
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM pg_temp.expect_chest_error(format('select public.get_festival_chest_order(%L)',f),'42501');
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',true);
 state:=public.set_festival_chest_lock(f,false,2,ARRAY[b,a,c],100,'00000000-0000-4000-8000-000000000001');
 IF state->>'locked'<>'false' OR state->>'revision'<>'3' OR
    before_numbers IS DISTINCT FROM (SELECT jsonb_object_agg(id,chest_number) FROM public.participants) THEN RAISE EXCEPTION 'Unlock must retain existing numbers'; END IF;
 INSERT INTO public.registrations VALUES ('00000000-0000-4000-8000-000000000302',f,'general_team','1000');
 PERFORM pg_temp.expect_chest_error(format('update public.festival_calendar set chest_number_category_range=1000 where id=%L',f),'23505');
 IF (SELECT chest_number_category_range FROM public.festival_calendar WHERE id=f)<>100 OR
    before_numbers IS DISTINCT FROM (SELECT jsonb_object_agg(id,chest_number) FROM public.participants) THEN RAISE EXCEPTION 'Group collision must roll back calendar and all numbers'; END IF;
 DELETE FROM public.registrations WHERE id='00000000-0000-4000-8000-000000000302';
 UPDATE public.festival_calendar SET chest_number_category_range=1000 WHERE id=f;
 PERFORM pg_temp.expect_chest_error(format('select public.save_festival_chest_order(%L,%L,%L,3,100)',f,ARRAY[a,b,c],ARRAY[b,a,c]),'40001');
 IF (SELECT chest_number FROM public.participants WHERE name='Student Three')<>'1000' THEN RAISE EXCEPTION 'Unlocked calendar renumbering failed'; END IF;
 UPDATE public.festival_calendar SET chest_number_template='category' WHERE id=f;
 IF (SELECT min(chest_number::integer) FROM public.participants WHERE festival_id=f)<>1000 OR
    (SELECT max(chest_number::integer) FROM public.participants WHERE festival_id=f)<>1003 THEN RAISE EXCEPTION 'Existing category regeneration changed'; END IF;
 IF (SELECT entry_chest_number FROM public.registrations WHERE id='00000000-0000-4000-8000-000000000301')<>'5000' THEN RAISE EXCEPTION 'Group identities must remain unchanged'; END IF;
 RAISE NOTICE 'PASS: reorder, uniqueness, stale snapshots, final lock, direct writes, calendar, regeneration, tenant code, auth and unlock preservation';
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_chest_error('update public.festival_chest_number_controls set locked=false','42501');
SET LOCAL ROLE anon;
SELECT pg_temp.expect_chest_error('select public.get_festival_chest_order(''00000000-0000-4000-8000-000000000011'')','42501');
ROLLBACK;
