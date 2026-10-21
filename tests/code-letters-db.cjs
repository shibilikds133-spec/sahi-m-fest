// Run: node tests/code-letters-db.cjs. Only creates an isolated disposable DB;
// never reads .env, remote credentials, or the running development database.
const { spawnSync, spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const container = `fest-code-letters-${Date.now()}`;
const withoutPortal = process.argv.includes('--without-portal');
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || '') + (result.stdout || '').slice(-4000) || String(result.error));
  return result.stdout + result.stderr;
}
(async () => {
  let created = false;
  try {
    docker(['run', '-d', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15']);
    created = true;
    for (let attempt = 0; ; attempt++) {
      try { docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']); break; }
      catch (error) { if (attempt === 30) throw error; await new Promise(r => setTimeout(r, 500)); }
    }
    const files = [
      'supabase/tests/code_letters_fixture.sql',
      'supabase/migrations/20261021060506_fixed_code_letters_and_atomic_swap.sql',
      'supabase/migrations/20261021060510_code_letter_change_notifications.sql',
      'supabase/migrations/20261021060616_code_letter_operational_reads.sql',
      'supabase/tests/code_letters_transaction.sql',
    ];
    const sql = files.map(file => {
      let source = readFileSync(resolve(__dirname, '..', file), 'utf8');
      if (withoutPortal && file.endsWith('code_letters_fixture.sql')) {
        source = source.replace(/^CREATE SCHEMA stage_portal_private;\r?\n/m, '')
          .replace(/CREATE FUNCTION stage_portal_private\.assert_pin[\s\S]*?\$\$;/, '')
          .replace(/CREATE FUNCTION public\.stage_venue_portal_data\([\s\S]*?\$\$;/, '');
      }
      if (withoutPortal && file.endsWith('code_letters_transaction.sql')) {
        source = source.replace(/^SELECT test\.ok\([^\n]*stage_venue_portal[^\n]*\r?\n/gm, '');
        source += "\nSELECT test.ok(to_regnamespace('stage_portal_private') IS NULL,'staging migrations do not introduce the PIN portal schema');\n";
        source += "SELECT test.ok(to_regprocedure('public.stage_venue_portal_edit_code_letter(uuid,text,uuid,uuid,text,text,uuid)') IS NULL,'staging migrations do not expose missing PIN APIs');\n";
      }
      return source;
    }).join('\n');
    const output = docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], sql);
    console.log(output.split('\n').filter(line => /PASS:|FAIL:/.test(line)).join('\n'));
    console.log(`Passed ${(output.match(/PASS:/g) || []).length} SQL assertions against PostgreSQL 15.`);
    const setup = readFileSync(resolve(__dirname, '../supabase/tests/code_letters_transaction.sql'), 'utf8').split('-- This event')[0];
    docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], setup + `
      UPDATE registrations SET code_letter=CASE WHEN id='00000000-0000-0000-0000-000000000081' THEN 'D' ELSE 'A' END
        WHERE id IN ('00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-000000000082'); COMMIT;`);
    const swap = `SELECT public.stage_edit_code_letter('00000000-0000-0000-0000-000000000041',
      '00000000-0000-0000-0000-000000000081','A','D','00000000-0000-0000-0000-000000000082');`;
    const settings = `SET test.role='admin'; SET test.tenant='00000000-0000-0000-0000-000000000001';`;
    function connection() {
      const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-U', 'postgres']);
      let output = '';
      child.stdout.on('data', data => { output += data; });
      child.stderr.on('data', data => { output += data; });
      const done = new Promise(resolve => child.on('close', code => resolve({ code, output })));
      return { child, done, output: () => output };
    }
    const first = connection();
    first.child.stdin.write(settings + 'BEGIN;' + swap + "SELECT 'LOCK_HELD';\n");
    for (let attempt = 0; !first.output().includes('LOCK_HELD'); attempt++) {
      if (attempt === 50) throw new Error('First swap did not obtain its locks: ' + first.output());
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const second = connection();
    second.child.stdin.end(settings + swap);
    let waiting = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const count = docker(['exec', container, 'psql', '-U', 'postgres', '-At', '-c',
        "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%stage_edit_code_letter%'"]);
      if (Number(count.trim()) > 0) { waiting = true; break; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    first.child.stdin.end('COMMIT;\n');
    const [winner, stale] = await Promise.all([first.done, second.done]);
    assert.equal(waiting, true, 'Second session must actually wait for the first transaction');
    assert.equal(winner.code, 0, winner.output);
    assert.notEqual(stale.code, 0, 'Concurrent stale edit must not succeed');
    assert.match(stale.output, /40001/, stale.output);
    const final = docker(['exec', container, 'psql', '-U', 'postgres', '-At', '-c',
      "SELECT string_agg(code_letter,',' ORDER BY id),count(DISTINCT code_letter),count(*) FILTER(WHERE code_letter_fixed) FROM registrations WHERE code_letter IS NOT NULL"]);
    assert.equal(final.trim(), 'A,D|2|2');
    console.log('PASS: concurrent swap waits, revalidates, rejects the stale writer, and preserves unique fixed letters.');
  } finally {
    if (created) docker(['rm', '-f', container]);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
