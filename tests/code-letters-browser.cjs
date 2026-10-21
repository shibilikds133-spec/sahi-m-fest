// UI contract/responsive QA with synthetic RPC responses; no real account/data.
// Export with EXPO_PUBLIC_SUPABASE_URL=https://code-letter-test.invalid first.
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const puppeteer = require('puppeteer-core');
const output = path.join(os.tmpdir(), 'fest-code-letter-validation');
const web = process.env.CODE_LETTERS_WEB_DIR || path.join(output, 'web');
const venue = '00000000-0000-0000-0000-000000000021';
const schedule = '00000000-0000-0000-0000-000000000041';
const item = '00000000-0000-0000-0000-000000000141';
const names = ['Amina Abdulla', 'Hana Muhammed', 'Muhammed Abdul Rahman', 'Fathima Noor', 'Yusuf Ali'];
const rows = names.map((name, index) => ({
  id: `registration-${index}`, schedule_id: schedule, item_id: item, participant_id: `person-${index}`,
  status: 'approved', is_verified: true, code_letter: null, code_letter_fixed: false,
  participant_name: name, participant_chest_number: String(index + 101), organisation_name: 'Test Team',
}));
let locked = false;
let failSave = false;
let editRequests = 0;
const fixture = () => ({
  venue: { id: venue, name: 'Test Stage', location: 'Main hall' },
  schedules: [{ id: schedule, item_id: item, tenant_id: 'test-tenant', festival_id: 'test-festival', venue_id: venue,
    start_time: '2026-10-21T09:00:00Z', end_time: '2026-10-21T10:00:00Z', status: 'scheduled',
    item_name_en: 'Test Competition', item_code: 'T101', category_codes: ['GN'], venue_name: 'Test Stage',
    is_shuffle_locked: locked }],
  registrations: rows,
});
async function clickText(page, text) {
  const clicked = await page.evaluate(text => {
    const element = [...document.querySelectorAll('*')].filter(el => el.childElementCount === 0 && el.textContent === text).at(-1);
    if (!element) return false;
    (element.closest('[role="button"],[tabindex="0"],button') || element.parentElement).click();
    return true;
  }, text);
  assert.ok(clicked, `Missing action: ${text}`);
}
async function entryAction(page, name, action) {
  const clicked = await page.evaluate(({ name, action }) => {
    let node = [...document.querySelectorAll('*')].find(el => el.childElementCount === 0 && el.textContent === name);
    while (node) {
      const label = [...node.querySelectorAll('*')].find(el => el.childElementCount === 0 && el.textContent === action);
      if (label) { (label.closest('[role="button"],[tabindex="0"],button') || label.parentElement).click(); return true; }
      node = node.parentElement;
    }
    return false;
  }, { name, action });
  assert.ok(clicked, `Missing ${action} for ${name}`);
}
async function waitText(page, text) {
  try { await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 10000 }, text); }
  catch (error) { throw new Error(`${error.message}; expected ${text}; body: ${await page.evaluate(() => document.body.innerText)}`); }
}
async function openCodes(page, base) {
  await page.goto(`${base}/stage-management/venue/${venue}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('input');
  await page.type('input', '1234');
  await clickText(page, 'Continue');
  await waitText(page, 'Test Competition');
  await clickText(page, 'Code Letters');
  await waitText(page, 'Participants (');
}
(async () => {
  const server = http.createServer((request, response) => {
    const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(web, '.' + relative);
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
    await page.setRequestInterception(true);
    page.on('request', async request => {
      if (request.url().startsWith(base) || request.url().startsWith('data:')) { await request.continue(); return; }
      if (!request.url().startsWith('https://code-letter-test.invalid/rest/v1/rpc/')) { await request.abort(); return; }
      const rpc = request.url().split('/').at(-1);
      const respond = response => request.respond({ ...response, headers: { 'access-control-allow-origin': '*',
        'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,GET,OPTIONS' } });
      if (request.method() === 'OPTIONS') { await respond({ status: 204 }); return; }
      const input = JSON.parse(request.postData() || '{}');
      let result;
      if (rpc === 'stage_venue_portal_data_with_letters') result = fixture();
      else if (rpc === 'stage_venue_portal_edit_code_letter') {
        editRequests++;
        if (failSave) { await respond({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Code letters changed. Refresh and review the edit again.', code: '40001' }) }); return; }
        const source = rows.find(row => row.id === input.p_registration_id);
        const target = rows.find(row => row.id === input.p_expected_swap_id);
        assert.equal(source.code_letter, input.p_expected_letter);
        if (target) { assert.equal(target.code_letter, input.p_code_letter); target.code_letter = source.code_letter; target.code_letter_fixed = true; }
        source.code_letter = input.p_code_letter;
        source.code_letter_fixed = true;
        result = { swapped: !!target };
      } else if (rpc === 'stage_venue_portal_draw_letters') {
        const used = new Set(rows.filter(row => row.code_letter_fixed || !input.p_overwrite).map(row => row.code_letter));
        for (const row of rows) {
          if (row.code_letter_fixed || (!input.p_overwrite && row.code_letter)) continue;
          row.code_letter = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].find(letter => !used.has(letter)); used.add(row.code_letter);
        }
        result = { assigned: rows.length };
      } else { await request.abort(); return; }
      await respond({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
    });
    await openCodes(page, base);
    await entryAction(page, names[0], 'Assign');
    await page.type('input[placeholder="A-Z"]', 'D');
    await waitText(page, 'Unassigned → D');
    await clickText(page, 'Assign');
    await page.waitForFunction(() => !document.querySelector('input[placeholder="A-Z"]'));
    assert.equal(rows[0].code_letter, 'D');
    await waitText(page, 'Fixed');
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/stage_venue_portal_draw_letters') && response.request().method() === 'POST'), clickText(page, 'Draw Letters')]);
    await waitText(page, 'Lock code-letter shuffle');
    await waitText(page, 'Draw Letters');
    assert.equal(rows[0].code_letter, 'D');
    assert.equal(new Set(rows.map(row => row.code_letter)).size, rows.length);
    await entryAction(page, names[0], 'Edit');
    const letter = await page.$('input[placeholder="A-Z"]');
    await letter.click({ clickCount: 3 }); await letter.press('Backspace'); await letter.type('A');
    await waitText(page, 'D → A');
    fs.mkdirSync(path.join(output, 'screenshots'), { recursive: true });
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewport({ width, height: 900 });
      await page.screenshot({ path: path.join(output, 'screenshots', `swap-${width}.png`), fullPage: true });
      const bounds = await page.$eval('input[placeholder="A-Z"]', el => {
        const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, width: innerWidth, height: r.height };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= bounds.width, `Input overflows at ${width}`);
      assert.ok(bounds.height >= 36 && bounds.height <= 44, `Input height is not compact at ${width}`);
    }
    await clickText(page, 'Swap');
    await page.waitForFunction(() => !document.querySelector('input[placeholder="A-Z"]'));
    assert.equal(rows[0].code_letter, 'A');
    assert.ok(rows.find(row => row.code_letter === 'D')?.code_letter_fixed);
    await Promise.all([page.waitForResponse(response => response.url().endsWith('/stage_venue_portal_draw_letters') && response.request().method() === 'POST'), clickText(page, 'Draw Letters')]);
    await waitText(page, 'Lock code-letter shuffle');
    await waitText(page, 'Draw Letters');
    assert.equal(rows[0].code_letter, 'A');
    failSave = true;
    await entryAction(page, names[0], 'Edit');
    const staleInput = await page.$('input[placeholder="A-Z"]');
    await staleInput.click({ clickCount: 3 }); await staleInput.press('Backspace'); await staleInput.type('Z');
    await clickText(page, 'Assign');
    await waitText(page, 'Refresh and review the edit again.');
    assert.equal(rows[0].code_letter, 'A');
    assert.equal(editRequests, 3);
    await clickText(page, 'Cancel');
    locked = true;
    await openCodes(page, base);
    await waitText(page, 'Event is locked.');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('[role="button"]')].some(el => el.textContent === 'Draw Letters')), false);
    locked = false;
    rows.splice(0);
    await openCodes(page, base);
    await waitText(page, 'No participants found.');
    const drawDisabled = await page.evaluate(() => document.querySelector('[aria-label="Draw Letters"]')?.getAttribute('aria-disabled'));
    assert.equal(drawDisabled, 'true');
    assert.deepEqual(errors, []);
    console.log('PASS: direct assignment, fixed-preserving draw/redraw, swap preview/payload, stale-save error, locked/empty states, and compact modal at 320/375/768/1024/1440px.');
    console.log(`Synthetic UI screenshots: ${path.join(output, 'screenshots')}`);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
