// Runs against ONLY the task-created schema rehearsal database, never postgres/remote.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const container = 'supabase_db_web-for-sahi--main';
const database = 'scoring_validation_20261019';
const args = ['exec', '-i', container, 'psql', '-U', 'supabase_admin', '-d', database, '-qAt', '-v', 'ON_ERROR_STOP=1'];
function sql(query) {
  return new Promise(resolve => {
    const child = spawn('docker', args); let out = '', err = '';
    child.stdout.on('data', x => out += x); child.stderr.on('data', x => err += x);
    child.on('close', code => resolve({ code, out, err })); child.stdin.end(query);
  });
}
async function main() {
  const schema = spawnSync('docker', [...args, '-c', "select to_regclass('public.scoring_publications') is not null"], { encoding: 'utf8' });
  assert.equal(schema.stdout.trim(), 't', 'Apply migration in isolated rehearsal DB first');
  // Persist the existing rollback-only fixture only inside this disposable database.
  let fixture = fs.readFileSync('supabase/tests/configurable_points_grace.sql', 'utf8');
  fixture = fixture.replace("RAISE NOTICE 'PASS: profiles, authoritative publication, history, draft/final grace, tenant roles and used-token checks';",
    "UPDATE public.profiles SET tenant_id=tenant WHERE id=admin; RAISE NOTICE 'SCORING_CONTEXT: %', jsonb_build_object('festival',festival,'admin',admin,'tenant',tenant,'config',config,'draft',jsonb_set(draft,ARRAY[team_ids[1]::text,f2::text],'4')); ");
  fixture = fixture.replace('ROLLBACK;', 'COMMIT;');
  const setup = await sql(fixture);
  assert.equal(setup.code, 0, setup.err);
  const ctx = JSON.parse(setup.err.match(/SCORING_CONTEXT: (.*)/)[1]);
  const asAdmin = body => `BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claim.sub','${ctx.admin}',true); ${body}; COMMIT;`;
  const draft = JSON.stringify(ctx.draft).replaceAll("'", "''");
  const save = `SELECT public.save_grace_draft('${ctx.festival}',2,3,'${draft}'::jsonb)`;
  const saves = await Promise.all([sql(asAdmin(save)), sql(asAdmin(save))]);
  assert.equal(saves.filter(r => r.code === 0).length, 1, JSON.stringify(saves));
  assert.ok(saves.some(r => /another session/.test(r.err)), 'Stale draft writer must be rejected');
  const submit = `SELECT public.submit_all_grace_marks('${ctx.festival}',2,4)`;
  const submissions = await Promise.all([sql(asAdmin(submit)), sql(asAdmin(submit))]);
  submissions.forEach(r => assert.equal(r.code, 0, r.err));
  assert.equal(submissions[0].out.trim(), submissions[1].out.trim(), 'Concurrent retries return one submission');
  const config = JSON.stringify(ctx.config).replaceAll("'", "''");
  const configure = `SELECT public.save_scoring_configuration('${ctx.festival}',2,'${config}'::jsonb,'Concurrency test')`;
  const versions = await Promise.all([sql(asAdmin(configure)), sql(asAdmin(configure))]);
  assert.equal(versions.filter(r => r.code === 0).length, 1, JSON.stringify(versions));
  assert.ok(versions.some(r => /changed|stale/i.test(r.err)), 'Stale config version must be rejected');
  const privileges = await sql("SELECT NOT has_table_privilege('anon','public.grace_marks','INSERT') AND NOT has_table_privilege('authenticated','public.grace_marks','UPDATE') AND NOT has_table_privilege('authenticated','public.scoring_publications','INSERT') AND NOT has_table_privilege('authenticated','public.points_config_versions','UPDATE');");
  assert.equal(privileges.out.trim(), 't', 'No direct writes bypass sealed submissions/history');
  console.log('PASS: actual authenticated-role RPCs, concurrent draft/config conflicts, idempotent concurrent All Submit, protected table ACLs');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
