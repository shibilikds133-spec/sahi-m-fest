// Disposable, in-memory PostgreSQL. No environment files or remote connections.
const { PGlite } = require('../output/group-flow-db/node_modules/@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const read = file => readFileSync(resolve(__dirname, '..', file), 'utf8');
const id = n => String(n).padStart(32, '0').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
function extract(file, name) {
  const result = read(file).match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  if (!result) throw new Error('Missing function: ' + name);
  return result[0];
}
(async () => {
  const db = new PGlite();
  try {
    await db.exec(read('supabase/tests/general_group_identity_fixture.sql'));
    // The real visibility/context RPCs set their search_path explicitly.
    await db.exec('ALTER FUNCTION public.get_visible_organisations(uuid) SET search_path=public; ALTER FUNCTION public.get_team_leader_context() SET search_path=public; ALTER FUNCTION public.stage_assert_admin_access() SET search_path=public; ALTER FUNCTION public.get_my_tenant_id() SET search_path=public;');
    await db.exec(`CREATE TABLE tenants(id uuid PRIMARY KEY); INSERT INTO tenants VALUES('${id(1)}'),('${id(2)}'); ALTER TABLE participants ADD COLUMN plagiarism_ban_until date, ADD COLUMN is_post_hs_religious boolean DEFAULT false;`);
    await db.exec(read('supabase/migrations/20261020131308_program_intake_completion.sql'));
    await db.exec(extract('supabase/migrations/20261021085726_team_leader_admin_flow_parity.sql','get_team_leader_programs'));
    await db.exec(extract('supabase/migrations/20261021085726_team_leader_admin_flow_parity.sql','get_stage_management_registrations_scoped'));
    await db.exec(extract('supabase/migrations/20261021085726_team_leader_admin_flow_parity.sql','get_schedule_registrations'));
    await db.exec(extract('supabase/migrations/20261020075307_general_team_entries.sql','get_participant_general_results'));
    await db.exec(extract('supabase/migrations/152_fix_checkin_child_tenant_scope.sql','stage_update_registration'));
    await db.exec(read('supabase/migrations/20261021172215_general_group_identity_and_profile.sql'));
    await db.exec(read('supabase/migrations/20261022034136_general_team_roster_edit.sql'));
    await db.exec(read('supabase/migrations/20261022110100_candidate_general_profile_results.sql'));
    await db.exec(`INSERT INTO items(id,tenant_id,festival_id,item_code,item_name_en,participation_type,category_codes)
      VALUES('${id(47)}','${id(1)}','${id(11)}','OLD-HS','Legacy HS group','group','{HS}');
      INSERT INTO registrations(id,tenant_id,festival_id,item_id,participant_id,organisation_id)
      VALUES('${id(81)}','${id(1)}','${id(11)}','${id(47)}','${id(31)}','${id(21)}'),
      ('${id(82)}','${id(1)}','${id(11)}','${id(47)}','${id(32)}','${id(21)}');
      INSERT INTO results(registration_id,item_id,festival_id,points_awarded) VALUES('${id(81)}','${id(47)}','${id(11)}',9);`);
    await db.exec(read('supabase/migrations/20261022120000_group_participation_leader_identity.sql'));
    await db.exec(`SET test.actor='${id(91)}';`);
    const query = sql => db.query(sql);
    const create = async (item, members) => (await query(`SELECT public.create_general_team_entry('${id(11)}','${id(item)}',ARRAY[${members.map(n=>`'${id(n)}'`).join(',')}]::uuid[]) AS value`)).rows[0].value;
    const denied = async (sql, code) => { try { await query(sql); assert.fail('Expected rejection'); } catch (error) { assert.equal(error.code,code,error.message); } };
    // The pre-existing printed entry and result are retained byte-for-byte.
    assert.equal((await query(`SELECT entry_chest_number FROM registrations WHERE id='${id(62)}'`)).rows[0].entry_chest_number,'GE-00001');
    assert.equal((await query(`SELECT points_awarded FROM results WHERE registration_id='${id(62)}'`)).rows[0].points_awarded,50);
    await db.exec(`INSERT INTO items(id,tenant_id,festival_id,item_code,item_name_en,participation_type,category_codes)
      VALUES('${id(44)}','${id(1)}','${id(11)}','HS-G','HS group','group','{HS}'),
      ('${id(45)}','${id(1)}','${id(11)}','GN-G','General group','group','{GN}');`);
    const entry = await create(44,[32,31]);
    assert.equal(entry.leader_participant_id,id(32));
    assert.equal(entry.entry_chest_number,'102');
    const stored = (await query(`SELECT participant_id,entry_chest_number,group_leader_participant_id FROM registrations WHERE id='${entry.registration_id}'`)).rows[0];
    assert.equal(stored.participant_id,null);
    assert.equal(stored.entry_chest_number,null);
    assert.equal(stored.group_leader_participant_id,id(32));
    await denied(`INSERT INTO registrations(tenant_id,festival_id,item_id,organisation_id,is_group_registration,entry_kind,group_leader_participant_id)
      VALUES('${id(1)}','${id(11)}','${id(44)}','${id(22)}',true,'general_team','${id(33)}')`,'42501');
    await denied(`UPDATE participants SET organisation_id='${id(22)}' WHERE id='${id(32)}'`,'23514');
    await denied(`UPDATE registrations SET group_leader_participant_id=NULL WHERE id='${entry.registration_id}'`,'23514');
    await denied(`DELETE FROM group_members WHERE registration_id='${entry.registration_id}' AND participant_id='${id(32)}'`,'23514');
    assert.equal((await query(`SELECT group_entry_private.chest_number(r) AS chest FROM registrations r WHERE id='${entry.registration_id}'`)).rows[0].chest,'102');
    await denied(`SELECT public.create_general_team_entry('${id(11)}','${id(44)}',ARRAY['${id(31)}']::uuid[])`,'23505');
    const general = await create(45,[31]); // configured size is descriptive, not a minimum gate
    assert.equal(general.entry_chest_number,'101');
    assert.equal((await query(`SELECT category_code FROM program_intake_statuses WHERE item_id='${id(44)}'`)).rows[0].category_code,'HS');
    await query(`SELECT public.set_program_intake_status('${id(11)}','${id(44)}','HS','general_team',true)`);
    const compatibleCompletion=(await query(`SELECT (public.set_program_intake_status('${id(11)}','${id(44)}','HS','participant',true)).entry_kind`)).rows[0];
    assert.equal(compatibleCompletion.entry_kind,'general_team');
    await db.exec(`INSERT INTO items(id,tenant_id,festival_id,item_code,item_name_en,participation_type,category_codes)
      VALUES('${id(46)}','${id(1)}','${id(11)}','GN-I','General individual','individual','{GN}');`);
    await query(`SELECT public.set_program_intake_status('${id(11)}','${id(46)}','GN','participant',true)`);
    await db.exec(`INSERT INTO schedules VALUES('${id(52)}','${id(1)}','${id(11)}','${id(44)}',false);`);
    const operational = (await query(`SELECT public.get_stage_management_registrations_with_letters('${id(52)}',NULL) AS value`)).rows[0].value;
    assert.equal(operational[0].participant_chest_number,'102');
    assert.equal(operational[0].participant_category_code,'HS');
    assert.equal(operational[0].group_leader_participant_id,id(32));
    assert.equal(operational[0].participant_id,null);
    const scheduled=(await query(`SELECT * FROM public.get_schedule_registrations('${id(52)}')`)).rows[0];
    assert.equal(scheduled.participants.chest_number,'102');
    assert.equal(scheduled.participants.category_code,'HS');
    await query(`SELECT public.stage_update_registration('${id(52)}','${entry.registration_id}','verify')`);
    await query(`UPDATE registrations SET code_letter='A' WHERE id='${entry.registration_id}'`);
    await db.exec(`SET test.actor='${id(92)}';`);
    const portal = (await query(`SELECT * FROM public.get_team_leader_programs('${id(31)}')`)).rows;
    assert.ok(portal.some(row=>row.item_id===id(44)&&row.is_eligible&&row.entry_kind==='general_team'));
    assert.ok(portal.some(row=>row.item_id===id(46)&&row.is_eligible&&row.entry_kind==='participant'));
    await db.exec(`INSERT INTO items(id,tenant_id,festival_id,item_code,item_name_en,participation_type,category_codes)
      VALUES('${id(48)}','${id(1)}','${id(11)}','PORTAL-HS','Portal HS group','group','{HS}');`);
    await denied(`SELECT public.team_leader_create_general_entry('${id(48)}',ARRAY['${id(33)}']::uuid[])`,'23514');
    const portalCreated=(await query(`SELECT public.team_leader_create_general_entry('${id(48)}',ARRAY['${id(31)}']::uuid[]) AS value`)).rows[0].value;
    assert.equal(portalCreated.leader_participant_id,id(31));
    assert.equal(portalCreated.entry_chest_number,'101');
    await db.exec(`SET test.actor='${id(91)}';`);
    await db.exec(`INSERT INTO items(id,tenant_id,festival_id,item_code,item_name_en,participation_type,category_codes)
      VALUES('${id(49)}','${id(1)}','${id(11)}','JR-G','Junior group','group','{JR}'),
      ('${id(50)}','${id(1)}','${id(11)}','HS-G2','Other HS group','group','{HS}');
      UPDATE participants SET is_post_hs_religious=true WHERE id='${id(36)}';`);
    assert.equal((await create(49,[36])).leader_participant_id,id(36));
    await denied(`SELECT public.create_general_team_entry('${id(11)}','${id(50)}',ARRAY['${id(36)}']::uuid[])`,'23514');
    await denied(`SELECT public.create_general_team_entry('${id(11)}','${id(47)}',ARRAY['${id(31)}']::uuid[])`,'23505');
    const report=(await query(read('supabase/tests/group_participation_read_only_diagnostic.sql'))).rows;
    assert.equal(report.find(row=>row.item_id===id(47)).review_status,'LEGACY_REGISTRATIONS_REVIEW_REQUIRED');
    assert.equal((await query(`SELECT points_awarded FROM results WHERE registration_id='${id(81)}'`)).rows[0].points_awarded,9);
    await denied(`SELECT public.update_group_team_roster('${entry.registration_id}',ARRAY['${id(31)}']::uuid[],ARRAY['${id(31)}','${id(32)}']::uuid[],'${id(32)}','${id(32)}')`,'23514');
    await query(`SELECT public.update_group_team_roster('${entry.registration_id}',ARRAY['${id(31)}']::uuid[],ARRAY['${id(31)}','${id(32)}']::uuid[],'${id(31)}','${id(32)}')`);
    assert.equal((await query(`SELECT group_entry_private.chest_number(r) AS chest FROM registrations r WHERE id='${entry.registration_id}'`)).rows[0].chest,'101');
    const operationalState=(await query(`SELECT is_verified,code_letter FROM registrations WHERE id='${entry.registration_id}'`)).rows[0];
    assert.equal(operationalState.is_verified,true);assert.equal(operationalState.code_letter,'A');
    await query(`SELECT public.update_group_team_roster('${id(62)}',ARRAY['${id(31)}','${id(36)}']::uuid[],ARRAY['${id(31)}','${id(32)}']::uuid[],'${id(31)}',NULL)`);
    assert.equal((await query(`SELECT entry_chest_number FROM registrations WHERE id='${id(62)}'`)).rows[0].entry_chest_number,'GE-00001');
    assert.equal((await query(`SELECT points_awarded FROM results WHERE registration_id='${id(62)}'`)).rows[0].points_awarded,50);
    assert.equal((await query(`SELECT count(*)::integer AS total FROM group_members WHERE registration_id='${id(62)}' AND participant_id='${id(32)}'`)).rows[0].total,0);
    const profile=(await query(`SELECT public.get_public_candidate_profile('amina') AS value`)).rows[0].value;
    assert.equal(profile.published_results.find(row=>row.entry_kind==='general_team').points_awarded,0);
    assert.equal((await query(`SELECT entry_chest_number FROM public.get_participant_general_results('${id(31)}') WHERE registration_id='${id(62)}'`)).rows[0].entry_chest_number,'101');
    await denied(`SELECT public.update_group_team_roster('${entry.registration_id}',ARRAY['${id(31)}']::uuid[],ARRAY['${id(31)}']::uuid[],'${id(31)}','${id(32)}')`,'40001');
    await db.exec(`SET test.actor='${id(93)}';`);
    await denied(`SELECT public.create_general_team_entry('${id(11)}','${id(44)}',ARRAY['${id(31)}']::uuid[])`,'42501');
    console.log('PASS: admin/portal group creation, selection order, no new chest allocation, duplicate guard, explicit leader replacement, stale-leader protection, tenant/team isolation, scoped operational reads, General individual completion, diagnostic SQL and legacy result preservation.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
