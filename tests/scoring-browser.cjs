// Run after a web export built with https://scoring-test.invalid and a fake public key.
// All API traffic is mocked; no production session, user or database is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  ({ chromium } = require(path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData/Local'), '../..', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));
}
const tenant = '10000000-0000-4000-8000-000000000001', festival = '10000000-0000-4000-8000-000000000002';
const userId = '10000000-0000-4000-8000-000000000003';
const config = {
  id: 'config-test', tenant_id: tenant, festival_id: festival, config_version: 1, points_mode: 'custom',
  rank_1_points: 7, rank_2_points: 4, rank_3_points: 2,
  grade_thresholds: { a_plus: 91, a: 78, b: 63, c: 42 },
  point_brackets: [{ key: 'shared', label: 'One to twenty', min: 1, max: 20, enabled: true, points: [9,6,3,1] }],
  group_point_brackets: [], separate_group_brackets: false, auto_bracket_selection: true, allow_bracket_override: true,
  less_than_3_teams_rule: true, rule12_min_teams: 3, rule12_behavior: 'grade_only', enable_grace_marks: true,
  grade_boost_points: {}, group_grade_boost_points: {}, rank_boost_points: [], grade_boost_item_ids: [], rank_boost_item_ids: [], grace_fields: [],
};
const fields = [{ id: 'field-one', name: 'Attendance', max_marks: 11 }];
const teams = [1,2,3].map(i => ({ id: 'team-'+i, name: 'Team '+i }));
let workspace = { config_version: 1, draft_config_version: 1, revision: 0, enabled: true, fields, teams, entries: {}, last_submission: null };
const writes = [], errors = [];
async function main() {
  const root = path.resolve('.scoring-build-validation');
  const server = http.createServer((req,res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root+path.sep) && file!==root) { res.writeHead(403).end(); return; }
    const target = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(root,'index.html');
    const ext = path.extname(target), mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.ttf':'font/ttf', '.otf':'font/otf' }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime }); fs.createReadStream(target).pipe(res);
  });
  await new Promise(resolve => server.listen(8084,'127.0.0.1',resolve));
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  try {
    const context = await browser.newContext();
    await context.route('https://scoring-test.invalid/**', async route => {
      const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.split('/').pop();
      let body = {};
      if(req.method()==='POST') { body = req.postDataJSON() || {}; writes.push({endpoint,body}); }
      let result = [];
      if(endpoint==='profiles') result = { role:'admin',tenant_id:tenant,is_superadmin:false };
      if(endpoint==='get_my_access_status') result = { access_disabled:false };
      if(endpoint==='festival_calendar') result = { id:festival, tenant_id:tenant, festival_year:2026, level:'sector',festival_template:'sahithyolsav',is_active:true };
      if(endpoint==='points_config') result = [config];
      if(endpoint==='tenants') result = { id:tenant,name:'Scoring Test',org_type:'sector',is_active:true };
      if(endpoint==='get_grace_workspace') result = workspace;
      if(endpoint==='save_grace_draft') { workspace={...workspace,entries:body.p_entries,revision:workspace.revision+1}; result=workspace; }
      if(endpoint==='submit_all_grace_marks') { workspace={...workspace,last_submission:{id:'submission',revision:workspace.revision,config_version:1,created_at:new Date().toISOString()}}; result={submission_id:'submission'}; }
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result),headers:{'Access-Control-Allow-Origin':'*'}});
    });
    const jwtPart = x => Buffer.from(JSON.stringify(x)).toString('base64url');
    const token = jwtPart({alg:'HS256'})+'.'+jwtPart({sub:userId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.test';
    await context.addInitScript(({token,userId}) => localStorage.setItem('sb-scoring-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:userId,email:'test@example.invalid',aud:'authenticated',role:'authenticated'}})),{token,userId});
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    fs.mkdirSync('output/scoring-validation',{recursive:true});
    for(const width of [1440,1024,768,390,320]) {
      await page.setViewportSize({width,height:900});
      await page.goto('http://127.0.0.1:8084/settings/points');
      await page.getByRole('button',{name:'Add field',exact:true}).waitFor();
      await page.getByText(/Version 1 · Baseline/).waitFor();
      assert.equal(await page.getByLabel('Grace field name').count(),0,'No default grace field');
      assert.equal(await page.getByLabel('1st',{exact:true}).first().inputValue(),'7','Stored baseline loaded');
      const overflow = await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      assert.equal(overflow,false,`Points page horizontal overflow at ${width}`);
      assert.deepEqual(await page.locator('input').evaluateAll(inputs=>inputs.filter(e=>{ const r=e.getBoundingClientRect(); return r.width && (r.left<0 || r.right>innerWidth+1); }).map(e=>e.getAttribute('aria-label'))),[],`Clipped points input at ${width}`);
      await page.screenshot({path:`output/scoring-validation/points-${width}.png`});
      await page.getByRole('button',{name:'Add field',exact:true}).click();
      assert.equal(await page.getByLabel('Grace field name').inputValue(),'');
      // Adding a field creates blank input, never a default maximum or points.
      const maxima = page.getByLabel('Maximum marks',{exact:true});
      if(await maxima.count()) assert.equal(await maxima.inputValue(),'');
      await page.goto('http://127.0.0.1:8084/grace-marks');
      await page.getByText('Completion: 0/3 teams',{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'All Submit',exact:true}).getAttribute('aria-disabled'),'true');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Grace page overflow at ${width}`);
      assert.deepEqual(await page.locator('input').evaluateAll(inputs=>inputs.filter(e=>{ const r=e.getBoundingClientRect(); return r.width && (r.left<0 || r.right>innerWidth+1); }).map(e=>e.getAttribute('aria-label'))),[],`Clipped grace input at ${width}`);
      await page.screenshot({path:`output/scoring-validation/grace-${width}.png`});
    }
    for(const team of teams) {
      await page.getByRole('button',{name:team.name,exact:true}).click();
      await page.getByLabel(team.name+' Attendance',{exact:true}).fill('0');
    }
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.getByText('Draft saved. Final points have not changed.',{exact:true}).waitFor();
    assert.equal(writes.filter(w=>w.endpoint==='submit_all_grace_marks').length,0);
    await page.getByRole('button',{name:'All Submit',exact:true}).click();
    await page.getByText('All teams submitted. Final grace points are now updated.',{exact:true}).waitFor();
    assert.equal(writes.filter(w=>w.endpoint==='submit_all_grace_marks').length,1);
    assert.deepEqual(errors,[],'No uncaught UI errors');
    console.log('PASS: Points/Grace 1440,1024,768,390,320px; empty definitions; blank vs explicit zero; draft isolation; All Submit; no uncaught runtime errors');
  } finally { await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
