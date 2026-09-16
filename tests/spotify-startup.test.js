const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || 'playwright');
const { createServer } = require('../tools/preview-music.js');

test('packaged Spotify theme mounts with direct entry and production playback persistence enabled', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const settings = fs.readFileSync('src/sdk/settings.js', 'utf8');
    const persistence = fs.readFileSync('src/sdk/domain/player-persistence.js', 'utf8');
    const theme = fs.readFileSync(require('../tools/build-page.js').themeOutput, 'utf8');
    await page.route('**/standalone.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      EnhanceNCM._entry = { active: true };
      window.sessionReads = [];
      EnhanceNCM._libraryCache = { sessions: {
        read: async owner => { sessionReads.push(owner); return null; }, save: async () => {}
      } };
      ${settings}
      ${persistence}
      ${theme}
    ` }));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#refresh-library:enabled').waitFor();
    await page.waitForFunction(() => sessionReads.length > 0);
    assert.equal(await page.locator('.brand').textContent(), 'EnhanceNCM');
    assert.equal(await page.evaluate(() => EnhanceNCM._settings.playback().restoreQueue), true);
    assert.deepEqual(errors, []);
    await page.evaluate(() => disposeMusic());
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
