// Existing staging screen UI QA. Uses a synthetic local session/RPC fixture;
// every external request is intercepted or blocked. Never uses a real account.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const puppeteer = require('puppeteer-core');
const output = path.join(os.tmpdir(), 'fest-code-letter-staging-validation');
const web = process.env.CODE_LETTERS_WEB_DIR || path.join(output, 'web');
const tenant = '00000000-0000-0000-0000-000000000001';
const festival = '00000000-0000-0000-0000-000000000031';
const schedule = '00000000-0000-0000-0000-000000000041';
const item = '00000000-0000-0000-0000-000000000141';
const user = '00000000-0000-0000-0000-000000000099';
const names = ['Amina Abdulla', 'Hana Muhammed', 'Muhammed Abdul Rahman', 'Fathima Noor', 'Yusuf Ali'];
const rows = names.map((name, index) => ({
  id: `registration-${index}`, schedule_id: schedule, item_id: item, participant_id: `person-${index}`,
  status: 'approved', is_verified: true, code_letter: null, code_letter_fixed: false,
  participant_name: name, participant_chest_number: String(index + 101), organisation_name: 'Test Team',
}));
let locked = false, failSave = false, edits = 0;
const scheduleRow = () => ({ id: schedule, item_id: item, tenant_id: tenant, festival_id: festival,
  start_time: '2026-10-21T09:00:00Z', end_time: '2026-10-21T10:00:00Z',
  item_name_en: 'Test Competition', item_code: 'T101', category_codes: ['GN'], is_shuffle_locked: locked });
async function clickText(page, text) {
  const clicked = await page.evaluate(text => {
    const element = [...document.querySelectorAll('*')].filter(el => !el.childElementCount && el.textContent === text).at(-1);
    if (!element) return false;
    (element.closest('[role="button"],[tabindex="0"],button') || element.parentElement).click(); return true;
  }, text);
  assert.ok(clicked, `Missing ${text}`);
}
async function waitText(page, text) {
  try { await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 15000 }, text); }
  catch (error) { throw Error(`${error.message}; expected ${text}; body: ${await page.evaluate(() => document.body.innerText)}`); }
}
const inputSelector = 'input[placeholder="Enter letter (A-Z)"]';
async function edit(page, letter) {
  await page.click(`[aria-label="Edit code letter for ${names[0]}"]`);
  await page.waitForSelector(inputSelector);
  const input = await page.$(inputSelector);
  await input.click({ clickCount: 3 }); await input.press('Backspace'); await input.type(letter);
}
(async () => {
  const server = http.createServer((request, response) => {
    let file = path.resolve(web, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!file.startsWith(path.resolve(web) + path.sep) && file !== path.resolve(web)) { response.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(web, 'index.html');
    const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.ttf': 'font/ttf', '.png': 'image/png' };
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
      headless: true, args: ['--no-sandbox'], defaultViewport: { width: 375, height: 812 } });
    const page = await browser.newPage();
    page.on('dialog', dialog => dialog.accept());
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const token = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url') + '.'
      + Buffer.from(JSON.stringify({ sub: user, exp: expires, role: 'authenticated' })).toString('base64url') + '.synthetic';
    await page.evaluateOnNewDocument(session => localStorage.setItem('sb-code-letter-test-auth-token', JSON.stringify(session)), {
      access_token: token, refresh_token: 'synthetic-only', token_type: 'bearer', expires_in: 3600, expires_at: expires,
      user: { id: user, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {} },
    });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      if (request.url().startsWith(base) || request.url().startsWith('data:')) { await request.continue(); return; }
      if (!request.url().startsWith('https://code-letter-test.invalid/rest/v1/')) { await request.abort(); return; }
      const respond = response => request.respond({ ...response, headers: { 'access-control-allow-origin': '*',
        'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' } });
      if (request.method() === 'OPTIONS') { await respond({ status: 204 }); return; }
      const url = new URL(request.url());
      const endpoint = url.pathname.split('/').at(-1);
      const body = JSON.parse(request.postData() || '{}');
      let result = [];
      if (endpoint === 'profiles') result = { role: 'admin', tenant_id: tenant, is_superadmin: false };
      else if (endpoint === 'get_my_access_status') result = {};
      else if (endpoint === 'get_stage_management_context') result = [{ tenant_id: tenant, festival_id: festival, festival_name: 'Test Festival' }];
      else if (endpoint === 'get_stage_management_schedules') result = [scheduleRow()];
      else if (['get_stage_management_registrations_with_letters', 'get_stage_management_registrations_scoped', 'get_stage_management_registrations'].includes(endpoint)) result = rows;
      else if (endpoint === 'festival_calendar') result = { id: festival, tenant_id: tenant, is_active: true };
      else if (endpoint === 'schedules') result = scheduleRow();
      else if (endpoint === 'stage_edit_code_letter') {
        edits++;
        if (failSave) { await respond({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '40001', message: 'Code letters changed. Refresh and review the edit again.' }) }); return; }
        const source = rows.find(row => row.id === body.p_registration_id);
        const target = rows.find(row => row.id === body.p_expected_swap_id);
        assert.equal(source.code_letter, body.p_expected_letter);
        if (target) { assert.equal(target.code_letter, body.p_code_letter); target.code_letter = source.code_letter; target.code_letter_fixed = true; }
        source.code_letter = body.p_code_letter; source.code_letter_fixed = true; result = { swapped: !!target };
      } else if (endpoint === 'stage_draw_code_letters') {
        const used = new Set(rows.filter(row => row.code_letter_fixed || !body.p_overwrite).map(row => row.code_letter));
        for (const row of rows) if (!row.code_letter_fixed && (body.p_overwrite || !row.code_letter)) {
          row.code_letter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(letter => !used.has(letter)); used.add(row.code_letter);
        }
        result = { assigned: rows.length };
      }
      await respond({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    const open = async () => {
      await page.goto(`${base}/stage-management/${schedule}/code-letter`, { waitUntil: 'networkidle0' });
      await waitText(page, 'Test Competition');
    };
    const draw = async () => {
      await Promise.all([page.waitForResponse(response => response.url().endsWith('/stage_draw_code_letters') && response.request().method() === 'POST'), clickText(page, 'Draw Letters')]);
      await waitText(page, 'Draw Letters');
    };
    await open();
    await edit(page, 'D'); await waitText(page, 'Unassigned → D'); await clickText(page, 'Assign');
    await page.waitForFunction(selector => !document.querySelector(selector), {}, inputSelector);
    await draw(); assert.equal(rows[0].code_letter, 'D');
    assert.equal(new Set(rows.map(row => row.code_letter)).size, rows.length);
    await edit(page, 'A'); await waitText(page, 'D → A');
    fs.mkdirSync(path.join(output, 'screenshots'), { recursive: true });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.screenshot({ path: path.join(output, 'screenshots', `staging-swap-${width}.png`), fullPage: true });
      const bounds = await page.$eval(inputSelector, el => { const r = el.getBoundingClientRect(); return [r.left, r.right, innerWidth, r.height]; });
      assert.ok(bounds[0] >= 0 && bounds[1] <= bounds[2]); assert.ok(bounds[3] >= 36 && bounds[3] <= 44);
    }
    await clickText(page, 'Swap'); await page.waitForFunction(selector => !document.querySelector(selector), {}, inputSelector);
    assert.equal(rows[0].code_letter, 'A'); assert.ok(rows.find(row => row.code_letter === 'D')?.code_letter_fixed);
    await draw(); assert.equal(rows[0].code_letter, 'A');
    failSave = true; await edit(page, 'Z'); await clickText(page, 'Assign'); await waitText(page, 'Refresh and review the edit again.');
    assert.equal(rows[0].code_letter, 'A'); assert.equal(edits, 3); await clickText(page, 'Cancel');
    locked = true; await open(); await waitText(page, 'Code Letter Shuffle Locked');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].some(el => el.textContent === 'Draw Letters')), false);
    locked = false; rows.splice(0); await open(); await waitText(page, 'No active participants registered');
    assert.deepEqual(errors, []);
    console.log('PASS: staging direct assign, fixed-preserving draw/redraw, swap, stale-save error, locked/empty states and 320/375/768/1024/1440px modal.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
