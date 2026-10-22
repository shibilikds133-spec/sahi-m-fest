-- The existing fixture has already checked in test.created and assigned its code letter.
SELECT set_config('test.actor',test.id(91)::text,false);
INSERT INTO mark_entries(registration_id) SELECT (data->>'registration_id')::uuid FROM test.created;
INSERT INTO results(registration_id,item_id,festival_id,rank,grade,points_awarded,published,result_status,public_visible)
  SELECT (data->>'registration_id')::uuid,test.id(41),test.id(11),2,'B',20,true,'published',true FROM test.created;
SELECT test.denied($q$DELETE FROM group_members WHERE registration_id=(SELECT (data->>'registration_id')::uuid FROM test.created) AND participant_id=test.id(32)$q$,
  'direct edits remain locked after check-in, code letter, marks and result','55000');
SELECT test.denied($q$SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),ARRAY[test.id(31)],ARRAY[test.id(31),test.id(32)])$q$,
  'configured minimum team size remains enforced','P0001');
SELECT test.denied($q$SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),ARRAY[test.id(31),test.id(33)],ARRAY[test.id(31),test.id(32)])$q$,
  'editor cannot add a student from another team','P0001');
SELECT test.denied($q$SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),ARRAY[test.id(31),test.id(34)],ARRAY[test.id(31),test.id(32)])$q$,
  'editor cannot add a student from another tenant/festival','P0001');
SELECT test.denied($q$SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),ARRAY[test.id(31),test.id(31)],ARRAY[test.id(31),test.id(32)])$q$,
  'editor rejects duplicate participant IDs','P0001');

SELECT test.ok(public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),
  ARRAY[test.id(31),test.id(36)],ARRAY[test.id(31),test.id(32)])->>'changed'='true',
  'administrator atomically replaces a finished team roster');
SELECT test.ok((SELECT entry_chest_number='1001' AND participant_id IS NULL AND is_verified AND code_letter='D'
  FROM registrations WHERE id=(SELECT (data->>'registration_id')::uuid FROM test.created)),
  'entry chest, group identity, check-in and code letter remain unchanged');
SELECT test.ok((SELECT count(*)=2 FROM group_members WHERE registration_id=(SELECT (data->>'registration_id')::uuid FROM test.created)
  AND participant_id IN (test.id(31),test.id(36))), 'only current team members remain linked');
SELECT test.ok((SELECT row->'members' @> '[{"name":"Amina"},{"name":"Existing numeric collision"}]'::jsonb
  AND NOT row->'members' @> '[{"name":"Hana"}]'::jsonb
  FROM jsonb_array_elements(public.get_stage_management_registrations_with_letters(test.id(51),NULL)) row
  WHERE row->>'id'=(SELECT data->>'registration_id' FROM test.created)),
  'stage check-in reads only the current roster after edit');
SELECT test.ok((SELECT jsonb_array_length(raw_group_members)=2
  AND raw_group_members @> '["Amina", "Existing numeric collision"]'::jsonb FROM registrations
  WHERE id=(SELECT (data->>'registration_id')::uuid FROM test.created)),
  'group-size snapshot is updated to the current roster');
SELECT test.ok((SELECT count(*)=1 AND max(points_awarded)=20 FROM results
  WHERE registration_id=(SELECT (data->>'registration_id')::uuid FROM test.created)),
  'published result and points remain attached to the same registration');
SELECT test.ok((SELECT count(*)=1 FROM mark_entries WHERE registration_id=(SELECT (data->>'registration_id')::uuid FROM test.created)),
  'existing mark entries remain intact');
SELECT test.ok((SELECT count(*)=1 FROM audit_logs WHERE action='general_team_roster_edit'
  AND record_id=(SELECT (data->>'registration_id')::uuid FROM test.created)),
  'one audit entry records the roster replacement');
SELECT test.ok((SELECT count(*)=0 FROM jsonb_array_elements(public.get_public_candidate_profile('hana')->'participated_items') value
  WHERE value->>'registration_id'=(SELECT data->>'registration_id' FROM test.created)),
  'removed student no longer sees the General program on the profile');
SELECT test.ok((SELECT count(*)=1 FROM jsonb_array_elements(public.get_public_candidate_profile('occupied')->'participated_items') value
  WHERE value->>'registration_id'=(SELECT data->>'registration_id' FROM test.created)),
  'new current member sees the General program on the profile');
SELECT test.denied($q$SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),ARRAY[test.id(31),test.id(32)],ARRAY[test.id(31),test.id(32)])$q$,
  'stale editor cannot overwrite a newer roster','40001');
SELECT test.ok(public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),
  ARRAY[test.id(31),test.id(36)],ARRAY[test.id(31),test.id(36)])->>'changed'='false',
  'saving an unchanged roster is a no-op');
GRANT USAGE ON SCHEMA test TO authenticated;
GRANT SELECT ON test.created TO authenticated;
SET ROLE authenticated;
SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),
  ARRAY[test.id(31),test.id(36)],ARRAY[test.id(31),test.id(36)]);
RESET ROLE;
SELECT test.ok(has_function_privilege('authenticated','public.update_general_team_roster(uuid,uuid[],uuid[])','EXECUTE'),
  'an authenticated admin can invoke the roster RPC with the client role');
SELECT test.ok((SELECT count(*)=1 FROM audit_logs WHERE action='general_team_roster_edit'
  AND record_id=(SELECT (data->>'registration_id')::uuid FROM test.created)),
  'unchanged save produces no extra audit record');
SELECT test.denied($q$DELETE FROM group_members WHERE registration_id=(SELECT (data->>'registration_id')::uuid FROM test.created) AND participant_id=test.id(36)$q$,
  'admin RPC capability is removed immediately after save','55000');
SELECT set_config('test.actor',test.id(92)::text,false);
SELECT test.denied($q$SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),ARRAY[test.id(31),test.id(32)],ARRAY[test.id(31),test.id(36)])$q$,
  'Team Leader cannot use admin roster editor','42501');
SELECT set_config('test.actor',test.id(93)::text,false);
SELECT test.denied($q$SELECT public.update_general_team_roster((SELECT (data->>'registration_id')::uuid FROM test.created),ARRAY[test.id(31),test.id(32)],ARRAY[test.id(31),test.id(36)])$q$,
  'another tenant admin cannot edit this entry','42501');
SELECT test.ok(NOT has_function_privilege('anon','public.update_general_team_roster(uuid,uuid[],uuid[])','EXECUTE'),
  'anonymous callers cannot invoke the roster editor');
SELECT test.ok(NOT has_table_privilege('authenticated','group_entry_private.member_edit_authorizations','INSERT'),
  'authenticated callers cannot mint private edit authorization');
