SELECT set_config('test.actor',test.id(91)::text,false);
CREATE TABLE test.created AS SELECT public.create_general_team_entry(test.id(11),test.id(41),ARRAY[test.id(31),test.id(32)]) AS data;
SELECT test.ok((SELECT data->>'entry_chest_number'='1001' FROM test.created),'numeric group chest starts at 1000 and skips an occupied student number');
SELECT test.ok((SELECT participant_id IS NULL AND is_group_registration FROM registrations WHERE id=(SELECT (data->>'registration_id')::uuid FROM test.created)), 'group entry has no individual participant identity');
SELECT test.ok((SELECT count(*)=2 FROM group_members WHERE registration_id=(SELECT (data->>'registration_id')::uuid FROM test.created)), 'both selected children remain linked members');
SELECT test.ok((SELECT entry_chest_number='GE-00001' FROM registrations WHERE id=test.id(62)), 'existing printed GE card number preserved');
SELECT test.denied($q$SELECT public.create_general_team_entry(test.id(11),test.id(41),ARRAY[test.id(31),test.id(33)])$q$, 'admin cannot mix teams','P0001');
SELECT test.denied($q$SELECT public.create_general_team_entry(test.id(11),test.id(41),ARRAY[test.id(31),test.id(34)])$q$, 'admin cannot mix tenants/festivals','P0001');
SELECT test.denied($q$SELECT public.create_general_team_entry(test.id(13),test.id(41),ARRAY[test.id(34)])$q$, 'admin cannot manage another tenant festival','42501');
SELECT test.ok(public.create_general_team_entry(test.id(12),test.id(43),ARRAY[test.id(35)])->>'entry_chest_number'='100', '1000 participant range gives group numbers starting at 100');

SELECT set_config('test.actor',test.id(92)::text,false);
CREATE TABLE test.team_created AS SELECT public.team_leader_create_general_entry(test.id(41),ARRAY[test.id(31),test.id(32)]) AS data;
SELECT test.ok((SELECT data->>'entry_chest_number'='1002' FROM test.team_created), 'team leader and admin use the same numeric counter');
SELECT test.denied($q$SELECT public.team_leader_create_general_entry(test.id(41),ARRAY[test.id(31),test.id(33)])$q$,'team leader cannot add another team child','42501');
SELECT set_config('test.actor',test.id(91)::text,false);
SELECT test.denied($q$UPDATE registrations SET participant_id=test.id(31) WHERE id=(SELECT (data->>'registration_id')::uuid FROM test.created)$q$,'group identity cannot become an individual identity','23514');
SELECT test.denied($q$UPDATE registrations SET entry_chest_number='9999' WHERE id=test.id(62)$q$,'printed group chest number is immutable','23514');
SELECT test.denied($q$UPDATE registrations SET tenant_id=test.id(2) WHERE id=test.id(62)$q$,'group ownership cannot be moved to another tenant','23514');
SELECT test.denied($q$INSERT INTO participants(tenant_id,festival_id,organisation_id,name,chest_number) VALUES(test.id(1),test.id(11),test.id(21),'Collision','1001')$q$, 'student insert cannot reuse group number','23505');
SELECT test.denied($q$UPDATE participants SET chest_number='1001' WHERE id=test.id(31)$q$, 'student renumber cannot collide with group card','23505');
SELECT test.denied($q$INSERT INTO group_members(registration_id,participant_id) SELECT (data->>'registration_id')::uuid,test.id(33) FROM test.created$q$, 'direct membership write cannot cross teams','23514');
SELECT test.denied($q$INSERT INTO group_members(registration_id,participant_id) SELECT (data->>'registration_id')::uuid,test.id(31) FROM test.created$q$, 'duplicate member is rejected','23505');

SELECT public.stage_update_registration(test.id(51),(SELECT (data->>'registration_id')::uuid FROM test.created),'verify');
SELECT test.denied($q$SELECT public.stage_update_registration(test.id(51),test.id(31),'verify')$q$,'member participant ID cannot identify a check-in registration','42501');
SELECT test.ok((SELECT is_verified FROM registrations WHERE id=(SELECT (data->>'registration_id')::uuid FROM test.created)), 'one check-in verifies the group registration');
SELECT test.ok((SELECT count(*)=0 FROM attendance),'group check-in creates no student attendance record');
SELECT test.ok((SELECT count(*)=1 FROM audit_logs WHERE action='stage_management_verify' AND record_id=(SELECT (data->>'registration_id')::uuid FROM test.created)), 'one group check-in produces one registration audit, not one per member');
UPDATE schedules SET is_shuffle_locked=true WHERE id=test.id(51);
SELECT test.denied($q$SELECT public.stage_update_registration(test.id(51),(SELECT (data->>'registration_id')::uuid FROM test.created),'unverify')$q$,'locked event still blocks group check-in changes','55000');
UPDATE schedules SET is_shuffle_locked=false WHERE id=test.id(51);
SELECT test.ok((SELECT is_verified=false FROM registrations WHERE id=test.id(61)),'group check-in does not verify child solo entry');
SELECT test.denied($q$DELETE FROM group_members WHERE registration_id=(SELECT (data->>'registration_id')::uuid FROM test.created)$q$, 'checked-in roster cannot silently change','55000');
SELECT test.ok((SELECT jsonb_array_length(row->'members')=2 AND row->>'participant_id' IS NULL
 FROM jsonb_array_elements(public.get_stage_management_registrations_with_letters(test.id(51),NULL)) row
 WHERE row->>'id'=(SELECT data->>'registration_id' FROM test.created)), 'scoped check-in read supplies roster and a null individual identity');
UPDATE registrations SET code_letter='D',code_letter_fixed=true WHERE id=(SELECT (data->>'registration_id')::uuid FROM test.created);
SELECT test.ok((SELECT row->>'code_letter'='D' AND (row->>'code_letter_fixed')::boolean
 FROM jsonb_array_elements(public.get_stage_management_registrations_with_letters(test.id(51),NULL)) row
 WHERE row->>'id'=(SELECT data->>'registration_id' FROM test.created)), 'group identity guard preserves code-letter updates and fixed-letter metadata');

SET ROLE anon;
SELECT public.get_public_candidate_profile('amina') AS public_profile \gset
RESET ROLE;
SELECT test.ok(jsonb_array_length(:'public_profile'::jsonb->'participated_items')=4, 'candidate profile lists solo and all member-linked General programs');
SELECT test.ok(jsonb_array_length(:'public_profile'::jsonb->'published_results')=1, 'team result is absent from child individual results');
SELECT test.ok((SELECT sum((value->>'points_awarded')::int)=5 FROM jsonb_array_elements(:'public_profile'::jsonb->'published_results')), 'team award of 50 adds zero to child points');
SELECT test.ok(jsonb_array_length(public.get_public_candidate_profile('hana')->'participated_items')=3
 AND jsonb_array_length(public.get_public_candidate_profile('hana')->'published_results')=0, 'second member also sees every group program with no individual result or points');
SELECT test.ok((SELECT count(*)=1 FROM public.get_public_published_results(test.id(1),test.id(11),true) WHERE NOT is_group AND participant_id IS NOT NULL), 'actual public ranking feed retains exactly the solo result');
SELECT test.ok((SELECT count(*)=0 FROM public.get_public_published_results(test.id(1),test.id(11),true) WHERE registration_id=test.id(62)), 'group result does not enter the individual ranking feed');
SELECT test.ok((SELECT total_points=55 AND result_count=2 FROM public.get_public_leaderboard(test.id(1),test.id(11)) WHERE organisation_id=test.id(21)), 'actual team leaderboard awards group 50 plus solo 5 once, independent of member count');
UPDATE participants SET public_profile_enabled=false WHERE id=test.id(31);
SELECT test.ok(public.get_public_candidate_profile('amina') IS NULL,'disabled candidate profile hides group participation too');
UPDATE participants SET public_profile_enabled=true,show_organisation_public=false WHERE id=test.id(31);
SELECT test.ok(public.get_public_candidate_profile('amina')->'profile'->>'organisation_name' IS NULL,'organisation privacy remains respected');
SELECT test.ok((SELECT count(*)=0 FROM jsonb_array_elements(public.get_public_candidate_profile('other-team')->'participated_items') value WHERE value->>'entry_kind'='general_team'), 'non-member profile does not inherit group programs');
UPDATE registrations SET status='rejected' WHERE id=test.id(62);
SELECT test.ok((SELECT count(*)=0 FROM jsonb_array_elements(public.get_public_candidate_profile('amina')->'participated_items') value WHERE value->>'registration_id'=test.id(62)::text), 'rejected group entry is not displayed on member profile');
SELECT test.ok(NOT has_function_privilege('anon','public.create_general_team_entry(uuid,uuid,uuid[])','EXECUTE'), 'anonymous users cannot create group entries');
SELECT test.ok(NOT has_schema_privilege('authenticated','group_entry_private','USAGE'), 'number allocator is not exposed to authenticated clients');
