const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || 'playwright');
test('original mode lists themes; selected theme has no E button or settings overlay', async () => {
  const server = http.createServer((req, res) => res.end('<!doctype html><body></body>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  async function boot(extra = [], themed = false) {
    await page.evaluate(({ extra, themed }) => {
      window.EnhanceNCM = { _native: { ready: () => true },
        _entry: themed ? { active: true, confirm() {}, recover(error) { throw error; } } : null,
        sdk: { window: { initialize: async () => {} } },
        _themeCatalog: [{ id: 'spotify', name: 'Spotify', source: 'EnhanceNCM.themes.register({ mount({root}) {root.innerHTML = "<h1>Spotify</h1>"; return () => localStorage.setItem("disposed", "yes");} });' }, ...extra] };
    }, { extra, themed });
    for (const file of ['app.js', 'themes.js', 'ui/switcher.js', 'theme-host.js'])
      await page.addScriptTag({ content: fs.readFileSync('src/host/' + file, 'utf8') });
    if (themed) {
      await page.evaluate(() => EnhanceNCM._startMusic());
      await page.waitForFunction(() => EnhanceNCM.themes.getActive());
    } else await page.locator('#enhancencm-ui-root #e-button').waitFor();
  }
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await boot();
    await page.locator('#enhancencm-ui-root #e-button').click();
    const modes = page.getByRole('radiogroup', { name: '界面模式', exact: true });
    assert.equal(await page.getByRole('radiogroup').count(), 1);
    assert.equal(await modes.getByRole('radio').count(), 2);
    assert.equal(await modes.getByRole('radio', { name: /网易云原版界面/ }).getAttribute('aria-checked'), 'true');
    assert.equal(await page.getByRole('heading', { name: '主题管理', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: '播放恢复', exact: true }).count(), 0);
    assert.equal(await page.getByRole('checkbox').count(), 0);
    assert.equal(await page.getByRole('radio', { name: 'Spotify', exact: true }).getAttribute('aria-checked'), 'false');
    await Promise.all([page.waitForEvent('load'), page.getByText('重新扫描主题（刷新页面）', { exact: true }).click()]);
    const added = { id: '中文主题', name: '中文主题', source: 'EnhanceNCM.themes.register({name:"中文主题",mount({root}) {root.innerHTML="<h1>新主题</h1>";}});' };
    await boot([added]);
    await page.locator('#enhancencm-ui-root #e-button').click();
    assert.equal(await modes.getByRole('radio').count(), 3);
    await page.getByRole('radio', { name: '中文主题', exact: true }).scrollIntoViewIfNeeded();
    fs.mkdirSync('out/themes-ui', { recursive: true });
    await page.screenshot({ path: 'out/themes-ui/settings.png' });
    await Promise.all([page.waitForEvent('load'), page.getByRole('radio', { name: '中文主题', exact: true }).click()]);
    await boot([added], true);
    await page.getByRole('heading', { name: '新主题', exact: true }).waitFor();
    assert.equal(await page.title(), '中文主题 · EnhanceNCM');
    assert.equal(await page.locator('#e-button').count(), 0);
    assert.equal(await page.locator('#enhancencm-settings-root').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
