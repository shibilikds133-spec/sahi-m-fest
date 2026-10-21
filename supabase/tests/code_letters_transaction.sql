BEGIN;
SET test.role='admin';
SET test.tenant='00000000-0000-0000-0000-000000000001';
INSERT INTO test.visible_orgs VALUES('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
INSERT INTO public.venues VALUES('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000031');
INSERT INTO public.schedules(id,tenant_id,festival_id,item_id,venue_id,start_time,end_time)
SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000031',('00000000-0000-0000-0000-'||lpad((n+100)::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000021','2026-10-21T09:00:00Z','2026-10-21T10:00:00Z' FROM generate_series(41,42) n;
INSERT INTO public.participants SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000011' FROM generate_series(61,66) n;
INSERT INTO public.registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id)
SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000141',
  ('00000000-0000-0000-0000-'||lpad((n-20)::text,12,'0'))::uuid,'00000000-0000-0000-0000-000000000011'
  FROM generate_series(81,84) n;
-- This event has no generated letters yet: reserve D first.
SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081',' d ',NULL,NULL);
SELECT test.ok((SELECT code_letter='D' AND code_letter_fixed FROM registrations WHERE id='00000000-0000-0000-0000-000000000081'),'manual assignment normalizes and persists fixed flag');
UPDATE registrations SET is_verified=false WHERE id='00000000-0000-0000-0000-000000000082';
SELECT test.error($$SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000082','Z',NULL,NULL)$$,'22023','unverified entry cannot receive a manual letter');
UPDATE registrations SET is_verified=true,status='rejected' WHERE id='00000000-0000-0000-0000-000000000082';
SELECT test.error($$SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000082','Z',NULL,NULL)$$,'22023','rejected entry cannot receive a manual letter');
UPDATE registrations SET status='approved' WHERE id='00000000-0000-0000-0000-000000000082';
TRUNCATE test.notifications;
SELECT public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',false);
SELECT test.ok((SELECT count(*)=3 FROM test.notifications),'multi-row draw emits one hint per festival/schedule/venue rather than per row');
SELECT test.ok((SELECT count(DISTINCT code_letter)=4 AND count(*) FILTER (WHERE code_letter IS NOT NULL)=4 FROM registrations),'first draw fills every remaining letter uniquely');
SELECT test.ok((SELECT array_agg(code_letter ORDER BY code_letter)=ARRAY['A','B','C','D'] FROM registrations),'reserved D leaves A B C available (no skipped gaps)');
SELECT public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',true);
SELECT test.ok((SELECT code_letter='D' AND code_letter_fixed FROM registrations WHERE id='00000000-0000-0000-0000-000000000081'),'redraw preserves manual D');
DO $$ DECLARE target uuid; BEGIN
  SELECT id INTO target FROM registrations WHERE code_letter='A';
  PERFORM public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','A','D',target);
  PERFORM test.ok((SELECT code_letter='D' AND code_letter_fixed FROM registrations WHERE id=target),'swap gives old D to the original A entry and fixes it');
END $$;
SELECT test.ok((SELECT code_letter='A' AND code_letter_fixed FROM registrations WHERE id='00000000-0000-0000-0000-000000000081'),'swap gives requested A to original D entry');
SELECT test.ok((SELECT count(*)=2 FROM audit_logs WHERE action='code_letter_swap'),'both swap rows audited');
SELECT test.error($$SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','B','D',NULL)$$,'40001','stale source rejected without overwriting newer assignment');
SELECT test.error($$SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','B','A',NULL)$$,'40001','unconfirmed occupied target rejected');
SELECT test.error($$SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','AA','A',NULL)$$,'22023','invalid letter rejected');
SELECT test.ok((public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',true)->>'fixed')::int=2,'redraw reports both manual swap assignments as fixed');
SELECT test.ok((SELECT count(*)=2 FROM registrations WHERE code_letter_fixed),'draw never converts automatic letters into fixed letters');
UPDATE schedules SET is_shuffle_locked=true WHERE id='00000000-0000-0000-0000-000000000041';
SELECT test.error($$SELECT public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',true)$$,'55000','locked schedule cannot redraw');
SELECT test.error($$SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','Z','A',NULL)$$,'55000','locked schedule cannot edit');
UPDATE schedules SET is_shuffle_locked=false;
SET test.tenant='00000000-0000-0000-0000-000000000002';
SELECT test.error($$SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','Z','A',NULL)$$,'42501','cross tenant edit denied');
SET test.tenant='00000000-0000-0000-0000-000000000001';
SET test.role='viewer';
SELECT test.error($$SELECT public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',true)$$,'42501','non-admin draw denied by admin wrapper');
SET test.role='admin';
SELECT test.ok(public.stage_venue_portal_edit_code_letter('00000000-0000-0000-0000-000000000021','9999','00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','Z','A',NULL) ? 'error','incorrect PIN rejected');
SELECT test.ok((public.stage_venue_portal_draw_letters('00000000-0000-0000-0000-000000000021','1234','00000000-0000-0000-0000-000000000041',true)->>'fixed')::int=2,'PIN draw shares manual preservation rule');
SELECT test.ok(NOT has_function_privilege('anon','public.stage_edit_code_letter(uuid,uuid,text,text,uuid)','execute'),'anonymous role cannot call admin edit');
SELECT test.ok(NOT has_schema_privilege('authenticated','code_letter_private','usage'),'authenticated role cannot call private helpers');
SELECT test.ok((SELECT bool_and(payload='{}'::jsonb) FROM test.notifications),'notifications contain no registration data');
SELECT test.ok((SELECT count(*)>0 FROM test.notifications WHERE topic='code-letters:schedule:00000000-0000-0000-0000-000000000041'),'schedule-specific invalidation emitted');
SELECT test.ok((SELECT bool_or((entry->>'code_letter_fixed')::boolean) FROM jsonb_array_elements(public.get_stage_management_registrations_with_letters('00000000-0000-0000-0000-000000000041',NULL)) entry),'admin reads expose persisted fixed state');
SELECT test.ok((SELECT bool_or((entry->>'code_letter_fixed')::boolean) FROM jsonb_array_elements(public.stage_venue_portal_data_with_letters('00000000-0000-0000-0000-000000000021','1234')->'registrations') entry),'PIN reads expose persisted fixed state');
-- Overlap on the reverse side must block the WHOLE swap, not just one row.
INSERT INTO registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id,code_letter)
SELECT '00000000-0000-0000-0000-000000000091',tenant_id,festival_id,'00000000-0000-0000-0000-000000000142',participant_id,organisation_id,'A'
FROM registrations WHERE code_letter='B';
DO $$ DECLARE target uuid; BEGIN
 SELECT id INTO target FROM registrations WHERE item_id='00000000-0000-0000-0000-000000000141' AND code_letter='B';
 PERFORM test.error(format('SELECT public.stage_edit_code_letter(%L,%L,%L,%L,%L)',
   '00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','B','A',target),'22023','reverse-side overlap blocks swap');
END $$;
SELECT test.ok((SELECT code_letter='A' FROM registrations WHERE id='00000000-0000-0000-0000-000000000081'),'failed swap leaves source unchanged');
-- Group members on either side of an overlapping event must count.
UPDATE registrations SET participant_id=NULL WHERE id='00000000-0000-0000-0000-000000000091';
INSERT INTO group_members SELECT '00000000-0000-0000-0000-000000000091',participant_id FROM registrations
  WHERE item_id='00000000-0000-0000-0000-000000000141' AND code_letter='B';
SELECT test.ok(code_letter_private.conflicts((SELECT s FROM schedules s WHERE id='00000000-0000-0000-0000-000000000041'),
  (SELECT id FROM registrations WHERE item_id='00000000-0000-0000-0000-000000000141' AND code_letter='B'),false)=ARRAY['A'],'other event group roster is included in conflict checks');
SELECT test.ok(code_letter_private.match_entry('second','{"first":["A","B"],"second":["A"]}', '{"A":"first"}', ARRAY[]::text[])='{"A":"second","B":"first"}'::jsonb,'draw matching can move earlier allocations to find a safe complete draw');
UPDATE registrations SET code_letter=NULL WHERE id='00000000-0000-0000-0000-000000000081';
SELECT test.ok((SELECT NOT code_letter_fixed FROM registrations WHERE id='00000000-0000-0000-0000-000000000081'),'clearing an assignment clears its fixed flag');
INSERT INTO registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id,code_letter)
SELECT ('00000000-0000-0000-0000-'||lpad((200+n)::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000031',
  '00000000-0000-0000-0000-000000000142','00000000-0000-0000-0000-000000000061',
  '00000000-0000-0000-0000-000000000011',chr(n) FROM generate_series(65,90) n;
SELECT test.ok((public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',false)->>'conflictsUnavoidable')::boolean,
  'existing best-effort draw fallback is preserved and explicitly reported');
SELECT test.ok((SELECT count(DISTINCT code_letter)=4 FROM registrations WHERE item_id='00000000-0000-0000-0000-000000000141'),
  'conflict fallback still preserves uniqueness');
UPDATE registrations SET code_letter_fixed=true WHERE item_id='00000000-0000-0000-0000-000000000141';
SELECT test.ok((public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',true)->>'assigned')::int=0,
  'all-fixed redraw is a successful no-op');
SELECT test.ok((SELECT count(*)=4 FROM registrations WHERE code_letter_fixed AND item_id='00000000-0000-0000-0000-000000000141'),
  'all-fixed redraw keeps all fixed flags');
UPDATE registrations SET code_letter=NULL WHERE id IN('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000082');
UPDATE registrations SET participant_id=NULL WHERE id='00000000-0000-0000-0000-000000000082';
SELECT test.error($$SELECT public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',false)$$,'22023','missing roster rolls back the entire draw');
SELECT test.ok((SELECT count(*)=2 FROM registrations WHERE item_id='00000000-0000-0000-0000-000000000141' AND code_letter IS NULL),
  'failed draw does not leave partial assignments');
DELETE FROM registrations WHERE item_id='00000000-0000-0000-0000-000000000142';
UPDATE registrations SET code_letter=NULL;
UPDATE registrations SET participant_id='00000000-0000-0000-0000-000000000062' WHERE id='00000000-0000-0000-0000-000000000082';
SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000081','Z',NULL,NULL);
SELECT public.stage_draw_code_letters('00000000-0000-0000-0000-000000000041',false);
SELECT test.ok((SELECT array_agg(code_letter ORDER BY code_letter)=ARRAY['A','B','C','Z'] FROM registrations),
  'reserving Z still allows the remaining entries to draw A B C');
ROLLBACK;
