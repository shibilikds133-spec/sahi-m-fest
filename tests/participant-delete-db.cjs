const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const container = `fest-participant-delete-${Date.now()}`;
const docker = (args, input) => {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) throw new Error((result.stderr || '') + (result.stdout || ''));
  return result.stdout + result.stderr;
};
const read = file => readFileSync(resolve(__dirname, '..', file), 'utf8');
let created = false;
try {
  docker(['run', '-d', '--network', 'none', '--name', container, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15']);
  created = true;
  for (let attempt = 0; ; attempt += 1) {
    try { docker(['exec', container, 'pg_isready', '-U', 'postgres']); break; }
    catch (error) { if (attempt === 30) throw error; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300); }
  }
  const sql = [
    read('supabase/tests/participant_delete_fixture.sql'),
    read('supabase/migrations/20261023080342_safe_delete_general_team_entry_legacy_compatible.sql'),
    read('supabase/migrations/20261023084211_safe_delete_participants_with_groups.sql'),
    read('supabase/tests/participant_delete_transaction.sql'),
  ].join('\n');
  const output = docker(['exec', '-i', container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], sql);
  console.log(output.split('\n').filter(line => /PASS:/.test(line)).join('\n'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (created) docker(['rm', '-f', container]);
}
