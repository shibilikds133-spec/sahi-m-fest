/* global __dirname */
// A brand-new, network-isolated PostgreSQL container. No env or live database.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const container = 'codex-participant-edit-' + Date.now();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const quote = value => value == null ? 'NULL' : "'" + String(value).replaceAll("'", "''") + "'";
const admin = id(101), festival = id(11), a = id(21), b = id(22), student = id(201);
function sql(source, success = true) {
  const r = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], { input: source, encoding: 'utf8' });
  if (success) assert.equal(r.status, 0, r.stderr);
  return r;
}
function extract(file, name, schema = 'public') {
  const source = read(file);
  const start = source.search(new RegExp('CREATE(?: OR REPLACE)? FUNCTION ' + schema + '\\.' + name + '\\('));
  const end = source.indexOf('$$;', source.indexOf('AS $$', start));
  assert.ok(start >= 0 && end >= 0, name);
  return source.slice(start, end + 3);
}
const asActor = (body, actor = admin) => `SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${actor}',false); ${body}`;
const get = who => JSON.parse(sql(`SELECT to_jsonb(p) FROM public.participants p WHERE id='${who}'`).stdout);
function command(who, updates, team, number, expected = get(who)) {
  return `SELECT public.edit_participant_profile('${who}',${quote(JSON.stringify(updates))}::jsonb,${quote(team)},${quote(number)},${quote(expected.updated_at)},${quote(expected.organisation_id)},${quote(expected.chest_number)});`;
}
async function main() {
  execFileSync('docker', ['run', '--detach', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15'], { stdio: 'pipe' });
  try {
    for (let n = 0; n < 60; n++) {
      if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    sql(read('supabase/tests/chest_order_fixture.sql'));
    sql(`ALTER TABLE participants ADD COLUMN updated_at timestamptz DEFAULT now(), ADD COLUMN is_locked boolean DEFAULT false,
      ADD COLUMN dob date,ADD COLUMN class_std integer,ADD COLUMN education_type text,ADD COLUMN gender text,
      ADD COLUMN public_profile_enabled boolean DEFAULT true,ADD COLUMN show_organisation_public boolean DEFAULT true,
      ADD COLUMN profile_slug text,ADD COLUMN photo_url text,ADD COLUMN profile_bio text,ADD COLUMN status text DEFAULT 'approved',
      ADD COLUMN is_terminated boolean DEFAULT false;
      ALTER TABLE organisations ADD COLUMN org_type text DEFAULT 'unit';
      ALTER TABLE festival_calendar ADD COLUMN festival_year int DEFAULT 2026,ADD COLUMN is_active boolean DEFAULT true,ADD COLUMN level text DEFAULT 'unit';
      ALTER TABLE registrations ADD COLUMN participant_id uuid,ADD COLUMN organisation_id uuid,ADD COLUMN tenant_id uuid,
        ADD COLUMN item_id uuid,ADD COLUMN is_group_registration boolean DEFAULT false,ADD COLUMN status text DEFAULT 'approved',
        ADD COLUMN group_representative_id uuid;
      CREATE TABLE participant_unit_batches(id uuid DEFAULT gen_random_uuid(),status text,total_records int,success_count int,processed_count int,created_by uuid,tenant_id uuid,target_unit_id uuid,completed_at timestamptz);
      CREATE TABLE participant_unit_audit_logs(participant_id uuid,old_unit_id uuid,new_unit_id uuid,changed_by uuid,batch_id uuid,tenant_id uuid);
      CREATE TABLE items(id uuid PRIMARY KEY,tenant_id uuid,item_code text,item_name_en text,item_name_ml text,category_codes text[],participation_type text);
      CREATE TABLE schedules(id uuid,festival_id uuid,venue_id uuid,item_id uuid,tenant_id uuid,start_time timestamptz);
      CREATE TABLE results(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),registration_id uuid,item_id uuid,festival_id uuid,tenant_id uuid,points_awarded int,
        rank int,grade text,published boolean,published_at timestamptz DEFAULT now(),points_calculation jsonb,result_status text DEFAULT 'published',public_visible boolean DEFAULT true,public_result_no int,total_score numeric,collection_method text);
      CREATE TABLE points_config(festival_id uuid,enable_grace_marks boolean DEFAULT false,config_version int DEFAULT 1);
      CREATE TABLE grace_marks(festival_id uuid,org_id uuid,points int,tenant_id uuid,submission_id uuid);
      CREATE TABLE festival_leaderboard_settings(festival_id uuid,is_public_visible boolean,ranking_mode text,item_limit int);
      CREATE SCHEMA realtime;
      CREATE TABLE realtime.hints(topic text,payload jsonb);
      CREATE FUNCTION realtime.send(jsonb,text,text,boolean) RETURNS void LANGUAGE sql AS 'INSERT INTO realtime.hints VALUES($3,$1)';
      CREATE FUNCTION get_visible_organisations(uuid) RETURNS SETOF organisations LANGUAGE sql AS 'SELECT * FROM organisations';
      CREATE FUNCTION get_team_leader_context() RETURNS TABLE(festival_id uuid,parent_tenant_id uuid,organisation_id uuid) LANGUAGE sql AS
        'SELECT ''${festival}''::uuid,''${id(1)}''::uuid,''${a}''::uuid';
      INSERT INTO items VALUES('${id(501)}','${id(1)}','SOLO','Solo','Solo',ARRAY['HS'],'individual');
      INSERT INTO festival_leaderboard_settings VALUES('${festival}',true,'ALL',NULL);
      INSERT INTO points_config(festival_id) VALUES('${festival}');
      INSERT INTO participants(id,festival_id,tenant_id,organisation_id,chest_number,name,category_code) VALUES
        ('${id(204)}','${festival}','${id(1)}','${a}','102','Fourth','HS'),
        ('${id(205)}','${festival}','${id(1)}','${b}','201','Fifth','HS');
      INSERT INTO registrations(id,festival_id,entry_kind,participant_id,organisation_id,tenant_id,item_id,is_group_registration) VALUES
        ('${id(401)}','${festival}','participant','${student}','${a}','${id(1)}','${id(501)}',false),
        ('${id(402)}','${festival}','participant','${student}','${a}','${id(1)}','${id(501)}',false),
        ('${id(403)}','${festival}','participant','${student}','${a}','${id(1)}','${id(501)}',true);
      INSERT INTO results(id,registration_id,item_id,festival_id,tenant_id,points_awarded,rank,grade,published) VALUES
        ('${id(601)}','${id(401)}','${id(501)}','${festival}','${id(1)}',10,1,'A',true);`);
    const teamMigration = 'supabase/migrations/20261020181313_team_chest_number_template.sql';
    for (const fn of ['ensure_festival_team_chest_slots','festival_team_chest_slot','validate_team_chest_number_on_insert',
      'renumber_participant_on_team_change','audit_participant_chest_number_change','transfer_participant_team']) sql(extract(teamMigration, fn));
    sql(`CREATE TRIGGER renumber_participant_on_team_change BEFORE UPDATE OF organisation_id ON participants FOR EACH ROW
        WHEN(OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION renumber_participant_on_team_change();
      CREATE TRIGGER audit_participant_chest_number_change AFTER UPDATE OF chest_number,organisation_id ON participants
        FOR EACH ROW EXECUTE FUNCTION audit_participant_chest_number_change();`);
    sql(read('supabase/migrations/20261022020647_festival_chest_order_and_final_lock.sql'));
    for (const [file,fn] of [
      ['172_public_leaderboard_item_limit.sql','get_public_leaderboard'],
      ['166_add_grace_marks_system.sql','get_admin_leaderboard'],
      ['174_align_preview_with_public.sql','get_leaderboard_preview'],
      ['174_fix_admin_bypass_item_visibility.sql','get_public_published_results'],
      ['049_admin_festival_results_internal_published.sql','get_admin_published_results'],
      ['057_filter_rejected_registrations.sql','get_festival_results'],
      ['20261021172215_general_group_identity_and_profile.sql','get_public_candidate_profile'],
      ['143_section4_audit_scope_hardening.sql','get_team_leader_published_results'],
    ]) sql(extract('supabase/migrations/'+file,fn));
    // Match the current target reader's join layout: the team filter lives in
    // the registration JOIN, while the participant JOIN checks its current team.
    sql(`CREATE OR REPLACE FUNCTION group_entry_private.chest_number(public.registrations) RETURNS text
        LANGUAGE sql STABLE AS 'SELECT $1.entry_chest_number';
      CREATE OR REPLACE FUNCTION public.get_team_leader_published_results()
      RETURNS TABLE(result_id uuid,item_code text,item_name text,participant_name text,rank int,grade text,points_awarded int,published_at timestamptz)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
        SELECT DISTINCT res.id,i.item_code,COALESCE(i.item_name_en,i.item_name_ml),
          CASE WHEN r.entry_kind='general_team' THEN COALESCE(group_entry_private.chest_number(r),o.name,'General team') ELSE p.name END,
          res.rank,res.grade,res.points_awarded,res.published_at
        FROM public.results res JOIN public.get_team_leader_context() c
          ON c.festival_id=res.festival_id AND c.parent_tenant_id=res.tenant_id
        JOIN public.organisations o ON o.id=c.organisation_id
        JOIN public.items i ON i.id=res.item_id AND(i.tenant_id IS NULL OR i.tenant_id=c.parent_tenant_id)
        JOIN public.registrations r ON r.id=res.registration_id AND r.festival_id=c.festival_id AND r.organisation_id=c.organisation_id
        LEFT JOIN public.participants p ON p.id=r.participant_id AND p.festival_id=c.festival_id
          AND p.organisation_id=c.organisation_id AND p.tenant_id IN(c.parent_tenant_id,o.tenant_id)
        WHERE res.published IS TRUE AND res.result_status='published' AND res.public_visible IS TRUE AND o.tenant_id IS NOT NULL
          AND EXISTS(SELECT 1 FROM public.get_visible_organisations(c.parent_tenant_id) v WHERE v.id=o.id AND v.tenant_id=o.tenant_id)
        ORDER BY res.published_at DESC NULLS LAST,res.rank NULLS LAST;
      $$;`);
    const views = read('supabase/migrations/067_public_ai_views.sql');
    sql(views.slice(views.indexOf('CREATE OR REPLACE VIEW public.vw_public_leaderboard'),views.indexOf('-- 3. Public schedule')));
    sql(read('supabase/migrations/20261023070526_atomic_participant_edit_and_award_ownership.sql'));
    sql(read('supabase/migrations/20261023092645_global_chest_number_edit.sql'));
    const original = get(student);
    sql(asActor(command(student,{name:'Renamed'},b,'200')));
    assert.equal(get(student).name,'Renamed'); assert.equal(get(student).chest_number,'200');
    assert.equal(get(id(202)).chest_number,'100'); assert.equal(get(id(204)).chest_number,'101');
    assert.equal(get(id(203)).chest_number,'201'); assert.equal(get(id(205)).chest_number,'202');
    assert.equal(sql('SELECT count(*) FROM participant_chest_number_changes').stdout.trim(),'5','One audit for each changed number');
    assert.equal(sql(`SELECT organisation_id FROM registrations WHERE id='${id(403)}'`).stdout.trim(),a,'Group stays with old team');
    assert.equal(sql(`SELECT organisation_id FROM result_team_awards WHERE result_id='${id(601)}'`).stdout.trim(),a);
    console.log('PASS transfer + close source gap + shift destination + rename + preserved group and award');

    // Category-numbered festivals use their existing category blocks. A number
    // edit closes the source gap, shifts only the occupied run, and moving a
    // participant to another category allocates inside that category's block.
    const categoryFestival=id(14), catA=id(211), catB=id(212), catC=id(213), junior=id(214);
    sql(`INSERT INTO festival_calendar(id,tenant_id,chest_number_template,chest_number_category_range)
      VALUES('${categoryFestival}','${id(1)}','category',100);
      INSERT INTO festival_categories(festival_id,code,sort_order) VALUES
        ('${categoryFestival}','HS',0),('${categoryFestival}','JUNIOR',1);
      INSERT INTO participants(id,festival_id,tenant_id,organisation_id,chest_number,name,category_code) VALUES
        ('${catA}','${categoryFestival}','${id(1)}','${a}','120','Category A','HS'),
        ('${catB}','${categoryFestival}','${id(1)}','${a}','121','Category B','HS'),
        ('${catC}','${categoryFestival}','${id(1)}','${a}','122','Category C','HS'),
        ('${junior}','${categoryFestival}','${id(1)}','${b}','200','Junior A','JUNIOR');`);
    sql(asActor(command(catA,{name:'Category A Edited'},a,'122')));
    assert.equal(get(catA).chest_number,'122');
    assert.equal(get(catB).chest_number,'120');
    assert.equal(get(catC).chest_number,'121');
    const outOfRange=sql(asActor(command(catA,{name:'Must Roll Back'},a,'99')),false);
    assert.notEqual(outOfRange.status,0); assert.match(outOfRange.stderr,/selected category range/);
    assert.equal(get(catA).name,'Category A Edited');
    sql(asActor(command(catA,{name:'Moved Category',category_code:'JUNIOR'},a,'122')));
    assert.equal(get(catA).category_code,'JUNIOR'); assert.equal(get(catA).chest_number,'201');
    assert.equal(get(catB).chest_number,'120'); assert.equal(get(catC).chest_number,'121');
    assert.equal(get(junior).chest_number,'200');
    console.log('PASS category-mode edit, range validation, category move, source compaction and destination allocation');
    for (const rpc of [`get_public_leaderboard('${id(1)}','${festival}')`,`get_admin_leaderboard('${id(1)}','${festival}')`,
      `get_leaderboard_preview('${id(1)}','${festival}','ALL',NULL,true)`]) {
      const r=sql(`SELECT set_config('request.jwt.claim.sub','${admin}',false); SELECT total_points FROM ${rpc} WHERE organisation_id='${a}';`);
      assert.equal(r.stdout.trim().split('\n').at(-1),'10',rpc);
    }
    assert.equal(sql(`SELECT organisation_id FROM get_public_published_results('${id(1)}','${festival}',true) WHERE result_id='${id(601)}'`).stdout.trim(),a);
    for (const rpc of ['get_admin_published_results','get_festival_results']) {
      const output=sql(`SELECT set_config('request.jwt.claim.sub','${admin}',false); SELECT organisation_id FROM ${rpc}('${id(1)}','${festival}') WHERE result_id='${id(601)}'`).stdout;
      assert.equal(output.trim().split('\n').at(-1),a,rpc);
    }
    assert.equal(sql(`SELECT organisation_id FROM vw_public_results WHERE result_id='${id(601)}'`).stdout.trim(),a);
    assert.equal(sql(`SELECT participant_name FROM get_team_leader_published_results() WHERE result_id='${id(601)}'`).stdout.trim(),'Renamed');
    sql(`INSERT INTO results(id,registration_id,item_id,festival_id,tenant_id,points_awarded,published) VALUES
      ('${id(602)}','${id(402)}','${id(501)}','${festival}','${id(1)}',5,true);
      UPDATE results SET points_awarded=7 WHERE id='${id(601)}';`);
    assert.equal(sql(`SELECT organisation_id FROM result_team_awards WHERE result_id='${id(602)}'`).stdout.trim(),b);
    assert.equal(sql(`SELECT organisation_id FROM result_team_awards WHERE result_id='${id(601)}'`).stdout.trim(),a);
    console.log('PASS public/admin/preview/views/portal use old awards; new awards use new team; correction retains owner');
    const stale=sql(asActor(command(student,{name:'stale'},b,'200',original)),false);
    assert.notEqual(stale.status,0); assert.match(stale.stderr,/changed after opening/);
    for (const actor of [id(102),id(103)]) {
      const r=sql(asActor(command(student,{name:'forbidden'},b,'200'),actor),false);
      assert.notEqual(r.status,0); assert.match(r.stderr,/Administrator access/);
    }
    const invalid=sql(asActor(command(student,{tenant_id:id(2)},b,'200')),false);
    assert.notEqual(invalid.status,0); assert.match(invalid.stderr,/Unsupported/);
    const wrongRange=sql(asActor(command(student,{name:'wrong'},b,'100')),false);
    assert.notEqual(wrongRange.status,0); assert.match(wrongRange.stderr,/destination team range/);
    assert.equal(get(student).name,'Renamed');
    sql(`INSERT INTO participants(id,festival_id,tenant_id,organisation_id,chest_number,name)
      SELECT ('00000000-0000-4000-8000-'||lpad((n+1000)::text,12,'0'))::uuid,'${festival}','${id(1)}','${a}',n::text,'Capacity '||n
      FROM generate_series(102,199) n;`);
    const full=sql(asActor(command(student,{name:'bad'},a,'101')),false);
    assert.notEqual(full.status,0); assert.match(full.stderr,/No room/);
    assert.equal(get(student).organisation_id,b); assert.equal(get(id(1199)).chest_number,'199');
    sql(`DELETE FROM participants WHERE name LIKE 'Capacity %'; INSERT INTO festival_chest_number_controls(festival_id,locked) VALUES('${festival}',true);`);
    const locked=sql(asActor(command(student,{name:'bad'},a,'100')),false);
    assert.notEqual(locked.status,0); assert.match(locked.stderr,/finally locked/);
    sql(asActor(command(student,{name:'Locked-name edit'},b,'200')));
    sql(`UPDATE festival_chest_number_controls SET locked=false;`);
    sql(asActor(command(student,{name:'Same team'},b,'201')));
    assert.equal(get(student).chest_number,'201'); assert.equal(get(id(203)).chest_number,'200');
    assert.equal(sql(`SELECT count(*) FROM participant_chest_number_changes WHERE old_chest_number LIKE '__regen__%' OR new_chest_number LIKE '__regen__%'`).stdout.trim(),'0');
    assert.equal(sql(`SELECT count(*) FROM realtime.hints WHERE payload<>'{}'::jsonb`).stdout.trim(),'0');
    assert.equal(sql(`SELECT has_table_privilege('authenticated','result_team_awards','UPDATE') OR has_table_privilege('anon','result_team_awards','SELECT')`).stdout.trim(),'f');
    const schema=sql(`SELECT pg_get_functiondef('get_public_candidate_profile(text)'::regprocedure)`).stdout;
    assert.match(schema,/p.profile_slug, p.festival_id/);
    console.log('PASS stale/role/tenant/field/range/capacity/lock guards; name-only locked edit; same-team reorder; private hints/audit/ACL');
    // Two edits using one snapshot: one commits, the waiting writer is stale.
    const expected=get(student), edit=command(student,{name:'Concurrent'},b,'200',expected);
    const call=source=>new Promise(resolve=>{
      const child=spawn('docker',['exec','-i',container,'psql','-U','postgres','-qAt','-v','ON_ERROR_STOP=1']);
      let err='';child.stderr.on('data',x=>err+=x);child.on('close',code=>resolve({code,err}));child.stdin.end(asActor(source));
    });
    const concurrent=await Promise.all([call(edit),call(edit)]);
    assert.equal(concurrent.filter(r=>r.code===0).length,1);
    assert.ok(concurrent.some(r=>/changed after opening/.test(r.err)));
    console.log('PASS concurrent edits serialize and reject stale writer');
    // Destination gaps: stop shifting at the first free number, and do not
    // renumber a later occupied number when inserting into a free position.
    sql(asActor(command(student,{name:'Gap insertion'},b,'205')));
    assert.equal(get(id(203)).chest_number,'200'); assert.equal(get(id(205)).chest_number,'201');
    sql(asActor(command(student,{name:'Gap insertion'},b,'200')));
    assert.equal(get(id(203)).chest_number,'201'); assert.equal(get(id(205)).chest_number,'202');
    const auditCount=sql('SELECT count(*) FROM participant_chest_number_changes').stdout;
    const duplicate=sql(asActor(command(student,{name:'Student Two'},a,'100')),false);
    assert.notEqual(duplicate.status,0);assert.match(duplicate.stderr,/exact name/);
    assert.equal(get(student).name,'Gap insertion'); assert.equal(get(student).organisation_id,b);
    assert.equal(sql('SELECT count(*) FROM participant_chest_number_changes').stdout,auditCount,'Failed transfer rolls audits back');
    sql(`UPDATE organisations SET tenant_id='${id(2)}' WHERE id='${b}';`);
    sql(asActor(command(id(202),{name:'Child tenant transfer'},b,'203')));
    assert.equal(get(id(202)).tenant_id,id(2));
    assert.equal(sql(`SELECT participant_name FROM get_team_leader_published_results() WHERE result_id='${id(601)}'`).stdout.trim(),'Gap insertion');
    const identity=sql(`UPDATE results SET registration_id='${id(402)}' WHERE id='${id(601)}'`,false);
    assert.notEqual(identity.status,0);assert.match(identity.stderr,/identity cannot be reassigned/);
    const cleared=sql(`UPDATE results SET registration_id='${id(402)}',published=false,points_awarded=NULL,points_calculation=NULL WHERE id='${id(601)}'`,false);
    assert.notEqual(cleared.status,0);assert.match(cleared.stderr,/identity cannot be reassigned/);
    console.log('PASS first-gap insertion, duplicate-name full rollback, child-tenant transfer, immutable awarded identity');
  } finally { execFileSync('docker',['rm','--force',container],{stdio:'pipe'}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
