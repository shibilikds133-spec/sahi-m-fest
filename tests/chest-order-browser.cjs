/* global __dirname */
// Build with EXPO_NO_DOTENV=1 and chest-order-test.invalid. Every external
// request is intercepted; this never uses a live account or Supabase project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '../output/chest-order-web');
const output = path.resolve(__dirname, '../output/chest-order-validation');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const tenant = id(1), festival = id(11), user = id(101);
const initial = [
  { id: id(21), name: 'AL COGNIX', slot_number: 1, total: 12, numeric: 12 },
  { id: id(22), name: 'Archived Test Team', archived_at: '2026-10-22T00:00:00Z', slot_number: 2, total: 1, numeric: 1 },
  { id: id(23), name: 'EL CLARIX', slot_number: 3, total: 13, numeric: 13 },
  { id: id(24), name: 'LA COSMIX — a longer team name for mobile', slot_number: 4, total: 14, numeric: 14 },
];
let state = { festival_id: festival, template: 'team', range: 100, revision: 0, locked: false, teams: initial };
let failRead = false, conflict = false;
const writes = [], errors = [];
async function text(page, value) {
  try { await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, value); }
  catch (error) {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    throw new Error(error.message + '; expected ' + value + '; body=' + await page.evaluate(() => document.body.innerText) + '; writes=' + JSON.stringify(writes.slice(-2)));
  }
}
async function click(page, value) {
  assert.ok(await page.evaluate(value => {
    const node = [...document.querySelectorAll('*')].filter(node => !node.childElementCount && node.textContent === value).at(-1);
    if (!node) return false;
    (node.closest('[role="button"],button') || node.parentElement).click(); return true;
  }, value), 'Missing action: ' + value);
}
async function rowOrder(page) { return page.$$eval('[aria-label^="Drag "]', rows => rows.map(row => row.getAttribute('aria-label'))); }
async function dragRow(page, from, to, touch = false) {
  await page.waitForSelector('[aria-label^="Drag "]');
  const handles = await page.$$('[aria-label^="Drag "]');
  const start = await handles[from].boundingBox(), end = await handles[to].boundingBox();
  const x = start.x + start.width / 2, y = start.y + start.height / 2, target = end.y + end.height / 2;
  if (touch) {
    const cdp = await page.createCDPSession();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 12; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (target - y) * step / 12, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, target, { steps: 20 }); await page.mouse.up();
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}
async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.ttf': 'font/ttf', '.otf': 'font/otf' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(({ user }) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const token = btoa('{}') + '.' + btoa(JSON.stringify({ sub: user, role: 'authenticated', exp })) + '.test';
      localStorage.setItem('sb-chest-order-test-auth-token', JSON.stringify({ access_token: token, refresh_token: 'synthetic-only', token_type: 'bearer', expires_at: exp, user: { id: user, email: 'test@example.invalid', app_metadata: {}, user_metadata: {} } }));
    }, { user });
    await page.setRequestInterception(true);
    page.on('request', async request => {
      if (request.url().startsWith(base) || request.url().startsWith('data:')) { await request.continue(); return; }
      if (!request.url().startsWith('https://chest-order-test.invalid/')) { await request.abort(); return; }
      const endpoint = new URL(request.url()).pathname.split('/').at(-1);
      const respond = (data, status = 200) => request.respond({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' }, body: JSON.stringify(data) });
      if (request.method() === 'OPTIONS') { await respond(null, 204); return; }
      let result = [];
      if (endpoint === 'profiles') result = { role: 'admin', tenant_id: tenant, is_superadmin: false };
      else if (endpoint === 'get_my_access_status') result = { access_disabled: false };
      else if (endpoint === 'festival_calendar') result = { id: festival, tenant_id: tenant, festival_year: 2026, is_active: true, festival_template: 'sahithyolsav', chest_number_template: 'team', chest_number_category_range: 100 };
      else if (endpoint === 'tenants') result = { id: tenant, name: 'Chest order test', is_active: true };
      else if (endpoint === 'get_festival_chest_order') {
        if (failRead) { await respond({ message: 'Chest settings temporarily unavailable' }, 400); return; }
        result = state;
      } else if (endpoint === 'save_festival_chest_order' || endpoint === 'set_festival_chest_lock') {
        const body = JSON.parse(request.postData()); writes.push({ endpoint, body });
        assert.equal(body.p_festival_id, festival);
        assert.equal(body.p_expected_range, 100);
        if (conflict) { conflict = false; state = { ...state, revision: state.revision + 1 }; await respond({ code: '40001', message: 'Chest-number settings changed. Reload before saving.' }, 400); return; }
        assert.equal(body.p_expected_revision, state.revision);
        assert.deepEqual(body.p_expected_team_ids, state.teams.map(team => team.id));
        if (endpoint === 'save_festival_chest_order') {
          assert.equal(state.locked, false);
          state = { ...state, revision: state.revision + 1, teams: body.p_team_ids.map((id, index) => ({ ...state.teams.find(team => team.id === id), slot_number: index + 1 })) };
        } else {
          if (!body.p_locked && body.p_unlock_code !== tenant) { await respond({ code: '42501', message: 'Incorrect unlock code.' }, 400); return; }
          state = { ...state, revision: state.revision + 1, locked: body.p_locked };
        }
        result = state;
      }
      await respond(result);
    });
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(base + '/participants/chest-numbers', { waitUntil: 'networkidle0' });
      await text(page, 'Team number order');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Horizontal overflow at ' + width);
      assert.equal((await rowOrder(page)).length, 3);
      assert.equal((await rowOrder(page)).some(label => label.includes('Archived Test Team')), false);
      await page.screenshot({ path: path.join(output, 'chest-order-' + width + '.png'), fullPage: true });
    }
    await page.setViewport({ width: 1440, height: 1000 });
    await dragRow(page, 0, 2);
    await text(page, 'Preview only.');
    assert.equal(writes.length, 0, 'Dragging must not persist numbers before Save');
    assert.match((await rowOrder(page))[2], /AL COGNIX/);
    await click(page, 'Save order'); await text(page, 'Team order and chest numbers saved.');
    assert.deepEqual(state.teams.map(team => team.id), [id(23), id(22), id(24), id(21)]);
    assert.equal(state.teams.find(team => team.id === id(22)).slot_number, 2, 'Archived team slot must remain fixed');
    await page.reload({ waitUntil: 'networkidle0' }); assert.match((await rowOrder(page))[0], /EL CLARIX/);
    await click(page, 'Final Lock'); await click(page, 'Final Lock'); await text(page, 'Chest numbers locked');
    assert.equal(state.locked, true);
    const savedOrder = await rowOrder(page);
    await dragRow(page, 0, 1); assert.deepEqual(await rowOrder(page), savedOrder);
    await click(page, 'Unlock');
    await page.type('[aria-label="Unlock code (Tenant ID)"]', 'wrong');
    await click(page, 'Unlock'); await text(page, 'Incorrect unlock code.'); assert.equal(state.locked, true);
    await page.focus('[aria-label="Unlock code (Tenant ID)"]');
    await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
    await page.type('[aria-label="Unlock code (Tenant ID)"]', tenant); await click(page, 'Unlock'); await text(page, 'Existing order and numbers have been retained.');
    assert.equal(state.locked, false); assert.deepEqual(await rowOrder(page), savedOrder);
    await page.setViewport({ width: 390, height: 900, isMobile: true, hasTouch: true });
    await dragRow(page, 0, 1, true); await text(page, 'Preview only.');
    assert.match((await rowOrder(page))[1], /EL CLARIX/);
    await click(page, 'Save order'); await text(page, 'Team order and chest numbers saved.');
    const up = await page.$('[aria-label="Move EL CLARIX up"]'); await up.click(); await text(page, 'Preview only.');
    conflict = true; await click(page, 'Save order'); await text(page, 'Saved settings or teams changed.');
    await click(page, 'Discard changes');
    await click(page, 'Final Lock');
    await page.setViewport({ width: 320, height: 667, isMobile: true, hasTouch: true });
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, 'final-lock-phone.png'), fullPage: true });
    await click(page, 'Cancel');
    state = { ...state, teams: [] }; await page.reload({ waitUntil: 'networkidle0' }); await text(page, 'No active teams found');
    failRead = true; await page.reload({ waitUntil: 'networkidle0' }); await text(page, 'Chest settings temporarily unavailable');
    failRead = false; await click(page, 'Retry'); await text(page, 'No active teams found');
    assert.deepEqual(errors, []);
    console.log('PASS: five responsive widths, desktop drag, touch drag, arrows, explicit Save, persistence, final lock, wrong/correct Tenant ID, stale-save recovery and empty/error states');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
