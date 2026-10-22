// Disposable PostgreSQL only; never reads environment files or remote credentials.
const { spawnSync, spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const container = `fest-general-group-${Date.now()}`;
function docker(args, input) {
  const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (r.status !== 0) throw new Error((r.stderr || '') + (r.stdout || '').slice(-3000));
  return r.stdout + r.stderr;
}
const read = file => readFileSync(resolve(__dirname, '..', file), 'utf8');
const id = n => String(n).padStart(32, '0').replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
function extract(file, name) {
  const found = read(file).match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
  if (!found) throw new Error('Missing real function: ' + name);
  return found[0];
}
(async () => {
  let created = false;
  try {
    docker(['run','-d','--network','none','--name',container,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:15']); created = true;
    for (let i=0;;i++) { try { docker(['exec',container,'pg_isready','-U','postgres']); break; }
      catch (e) { if (i===30) throw e; await new Promise(r=>setTimeout(r,500)); } }
    const migration = require('node:fs').readdirSync(resolve(__dirname,'../supabase/migrations')).find(f=>f.endsWith('_general_group_identity_and_profile.sql'));
    const sql = [read('supabase/tests/general_group_identity_fixture.sql'),
      extract('supabase/migrations/20261020075307_general_team_entries.sql','get_stage_management_registrations_scoped'),
      extract('supabase/migrations/152_fix_checkin_child_tenant_scope.sql','stage_update_registration'),
      read('supabase/migrations/174_fix_admin_bypass_item_visibility.sql'),
      read('supabase/migrations/172_public_leaderboard_item_limit.sql'),
      read('supabase/migrations/'+migration),read('supabase/tests/general_group_identity_transaction.sql')].join('\n');
    const output = docker(['exec','-i',container,'psql','-X','-v','ON_ERROR_STOP=1','-U','postgres'],sql);
    console.log(output.split('\n').filter(s=>/PASS:/.test(s)).join('\n'));
    // Two independent real sessions must serialize, then allocate distinct cards.
    function connection() {
      const child=spawn('docker',['exec','-i',container,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U','postgres']); let output='';
      child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
      return {child,output:()=>output,done:new Promise(resolve=>child.on('close',code=>resolve({code,output})))};
    }
    const create=`SELECT public.create_general_team_entry('${id(11)}','${id(41)}',ARRAY['${id(31)}','${id(32)}']::uuid[]);`;
    const actor=`SET test.actor='${id(91)}';`;
    const first=connection(); first.child.stdin.write(actor+'BEGIN;'+create+"SELECT 'LOCK_HELD';\n");
    for(let i=0;!first.output().includes('LOCK_HELD');i++){if(i===50)throw new Error(first.output());await new Promise(r=>setTimeout(r,100));}
    const second=connection();second.child.stdin.end(actor+create);
    let waiting=false;
    for(let i=0;i<30;i++) { const count=docker(['exec',container,'psql','-U','postgres','-At','-c',"SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%create_general_team_entry%'"]);
      if(Number(count.trim())>0){waiting=true;break;} await new Promise(r=>setTimeout(r,100)); }
    first.child.stdin.end('COMMIT;\n');const [a,b]=await Promise.all([first.done,second.done]);
    assert.equal(a.code,0,a.output);assert.equal(b.code,0,b.output);assert.ok(waiting,'Second writer must actually wait');
    const one=JSON.parse(a.output.split('\n').find(s=>s.startsWith('{')));const two=JSON.parse(b.output.split('\n').find(s=>s.startsWith('{')));
    assert.notEqual(one.entry_chest_number,two.entry_chest_number);
    console.log('PASS: concurrent group creation waits and allocates distinct numeric chest numbers.');
    const owner=connection();owner.child.stdin.write(actor+'BEGIN;'+create+"SELECT 'NUMBER_RESERVED';\n");
    for(let i=0;!owner.output().includes('NUMBER_RESERVED');i++){if(i===50)throw new Error(owner.output());await new Promise(r=>setTimeout(r,100));}
    const reserved=JSON.parse(owner.output().split('\n').find(s=>s.startsWith('{'))).entry_chest_number;
    const student=connection();student.child.stdin.end(`INSERT INTO participants(tenant_id,festival_id,organisation_id,name,chest_number) VALUES('${id(1)}','${id(11)}','${id(21)}','Concurrent Student','${reserved}');`);
    let studentWaiting=false;
    for(let i=0;i<30;i++) { const count=docker(['exec',container,'psql','-U','postgres','-At','-c',"SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'INSERT INTO participants%' AND query LIKE '%Concurrent Student%'"]);
      if(Number(count.trim())>0){studentWaiting=true;break;}await new Promise(r=>setTimeout(r,100)); }
    owner.child.stdin.end('COMMIT;\n');const [groupWrite,studentWrite]=await Promise.all([owner.done,student.done]);
    assert.equal(groupWrite.code,0,groupWrite.output);assert.ok(studentWaiting,'Student allocation must wait on the same festival lock');
    assert.notEqual(studentWrite.code,0);assert.match(studentWrite.output,/reserved by a General group entry/);
    console.log('PASS: concurrent student/group numbering serializes and rejects the cross-table duplicate.');
    console.log(`Passed ${(output.match(/PASS:/g)||[]).length+2} PostgreSQL contract assertions.`);
  } finally { if(created)docker(['rm','-f',container]); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
