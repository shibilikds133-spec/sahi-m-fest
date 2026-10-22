/* global __dirname */
// Uses only a new disposable Docker database. No env files or remote credentials.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync, spawn } = require('node:child_process');
const container = 'codex-chest-order-' + Date.now();
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function sql(source) {
  const run = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { input: source, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(run.stderr);
  if (run.stderr) console.log(run.stderr.trim());
  return run.stdout;
}
function extract(source, name, schema = 'public') {
  const pattern = new RegExp('CREATE(?: OR REPLACE)? FUNCTION ' + schema + '\\.' + name + '\\(');
  const start = source.search(pattern);
  const end = source.indexOf('$$;', source.indexOf('AS $$', start));
  assert.ok(start >= 0 && end >= 0, name + ' must exist in original migration');
  return source.slice(start, end + 3);
}
async function main() {
  execFileSync('docker', ['run', '--detach', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15'], { stdio: 'pipe' });
  try {
    for (let i = 0; i < 60; i++) {
      const ready = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' });
      if (ready.status === 0) break;
      if (i === 59) throw new Error('Local PostgreSQL did not start');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    sql(read('supabase/tests/chest_order_fixture.sql'));
    const original = read('supabase/migrations/20261020181313_team_chest_number_template.sql');
    for (const name of ['ensure_festival_team_chest_slots', 'festival_team_chest_slot', 'validate_team_chest_number_on_insert', 'sync_festival_chest_numbers_on_settings_change', 'renumber_participant_on_team_change', 'audit_participant_chest_number_change', 'regenerate_festival_chest_numbers_internal']) sql(extract(original, name));
    sql(extract(read('supabase/migrations/159_category_range_chest_numbers.sql'), 'regenerate_festival_chest_numbers'));
    sql(extract(read('supabase/migrations/20261021172215_general_group_identity_and_profile.sql'), 'guard_participant_chest', 'group_entry_private'));
    sql(`CREATE TRIGGER validate_team_chest_number_on_insert BEFORE INSERT ON public.participants FOR EACH ROW EXECUTE FUNCTION public.validate_team_chest_number_on_insert();
      CREATE TRIGGER group_entry_participant_chest_guard BEFORE INSERT OR UPDATE OF chest_number,festival_id ON public.participants FOR EACH ROW EXECUTE FUNCTION group_entry_private.guard_participant_chest();
      CREATE TRIGGER renumber_participant_on_team_change BEFORE UPDATE OF organisation_id ON public.participants FOR EACH ROW WHEN (OLD.organisation_id IS DISTINCT FROM NEW.organisation_id) EXECUTE FUNCTION public.renumber_participant_on_team_change();
      CREATE TRIGGER audit_participant_chest_number_change AFTER UPDATE OF chest_number,organisation_id ON public.participants FOR EACH ROW EXECUTE FUNCTION public.audit_participant_chest_number_change();
      CREATE TRIGGER sync_festival_chest_numbers_on_settings_change AFTER INSERT OR UPDATE OF chest_number_template,chest_number_category_range ON public.festival_calendar FOR EACH ROW EXECUTE FUNCTION public.sync_festival_chest_numbers_on_settings_change();`);
    sql(read('supabase/migrations/20261022020647_festival_chest_order_and_final_lock.sql'));
    sql(read('supabase/migrations/20261022110000_hide_archived_teams_from_chest_order.sql'));
    sql(read('supabase/tests/chest_order_transaction.sql'));
    sql(read('supabase/tests/chest_order_archived_team.sql'));
    // A second connection waits for the same festival lock and must observe the
    // committed final lock rather than overwriting it with an old snapshot.
    const ids = "ARRAY['00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000023']::uuid[]";
    const prefix = "select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000101',false);";
    const first = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let firstError = '';
    first.stderr.on('data', chunk => { firstError += chunk; });
    const done = new Promise((resolve, reject) => first.on('close', code => code === 0 ? resolve() : reject(new Error(firstError))));
    const acquired = new Promise(resolve => first.stdout.on('data', chunk => { if (chunk.toString().includes('LOCK_HELD')) resolve(); }));
    first.stdin.end(`${prefix} BEGIN; select public.set_festival_chest_lock('00000000-0000-4000-8000-000000000011',true,0,${ids},100); select 'LOCK_HELD'; select pg_sleep(1); COMMIT;`);
    await acquired;
    const second = await new Promise(resolve => {
      const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
      let error = ''; child.stderr.on('data', chunk => { error += chunk; });
      child.on('close', code => resolve({ code, error }));
      child.stdin.end(`${prefix} select public.save_festival_chest_order('00000000-0000-4000-8000-000000000011',${ids},${ids},0,100);`);
    });
    await done;
    assert.notEqual(second.code, 0);
    assert.match(second.error, /finally locked/);
    console.log('PASS: concurrent final lock prevents a waiting stale reorder');
  } finally { execFileSync('docker', ['rm', '--force', container], { stdio: 'pipe' }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
