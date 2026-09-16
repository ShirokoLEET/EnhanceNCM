const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");

test("home renders SDK recommended playlists and opens the selected playlist without showing the chart", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator("#albums [data-playlist]").first().waitFor();
    assert.equal(await page.locator("#albums [data-playlist]").count(), 6);
    assert.equal(await page.locator("#hot-chart,#hero-play").count(), 0);
    assert.equal(await page.locator(".track-section").isVisible(), false);
    assert.equal(await page.locator("#discover").innerText().then(value => /热门歌曲|热歌榜/.test(value)), false);
    assert.equal(await page.evaluate(() => previewLibrary.calls.some(call => call.name === "getRecommendedPlaylists")), true);

    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    await page.locator('#tracks tr').first().waitFor();
    await page.locator('[data-view="discover"]').click();
    await page.evaluate(() => {
      const get = EnhanceNCM.sdk.playlists.get;
      EnhanceNCM.sdk.playlists.get = id => String(id) === "601"
        ? new Promise(resolve => { window.finishSelected = () => resolve({ id: "601", name: "推荐歌单 1", trackCount: 8 }); })
        : get(id);
    });
    await page.locator('#albums [data-playlist="601"]').click();
    await page.waitForFunction(() => !!window.finishSelected);
    assert.equal(await page.locator("#list-heading").textContent(), "推荐歌单 1");
    assert.equal(await page.locator("#tracks tr").count(), 0, "old chart songs must disappear as soon as a new playlist is selected");
    assert.equal(await page.locator('#notice').isVisible(), false, 'loading a playlist should not open the bottom notice');
    await page.evaluate(() => finishSelected());
    await page.locator('#tracks [data-play="1"]').waitFor();
    assert.equal(await page.locator("#list-heading").textContent(), "推荐歌单 1");
    assert.equal(await page.evaluate(() => previewLibrary.calls.some(call => call.name === "getTracks" && String(call.id) === "601")), true);

    await page.locator('#sidebar-created [data-playlist="501"]').click();
    await page.locator("#list-heading").filter({ hasText: "清晨出发" }).waitFor();
    await page.locator("#tracks tr").first().waitFor();
    assert.equal(await page.locator("#tracks tr").count(), 3);
    await page.evaluate(() => {
      const get = EnhanceNCM.sdk.playlists.get;
      EnhanceNCM.sdk.playlists.get = id => String(id) === "602"
        ? new Promise(resolve => { window.finishLatePlaylist = () => resolve({ id: "602", name: "过期歌单", trackCount: 8 }); })
        : get(id);
    });
    await page.locator('[data-view="discover"]').click();
    await page.locator('#albums [data-playlist="602"]').click();
    await page.waitForFunction(() => !!window.finishLatePlaylist);
    await page.locator('#sidebar-created [data-playlist="501"]').click();
    await page.locator("#list-heading").filter({ hasText: "清晨出发" }).waitFor();
    await page.evaluate(() => finishLatePlaylist());
    assert.equal(await page.locator("#list-heading").textContent(), "清晨出发");
    assert.equal(await page.locator("#tracks tr").count(), 3);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("home recommendation errors keep a visible retry action", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/?homeerror`);
    await page.locator("#home-recommendation-status").filter({ hasText: "加载失败" }).waitFor();
    assert.equal(await page.locator("#albums button").count(), 0);
    await page.evaluate(() => {
      EnhanceNCM.sdk.recommendations.getRecommendedPlaylists = async () =>
        [{ id: 700, name: "恢复的歌单", coverImgUrl: "" }];
    });
    await page.locator("#refresh-home-playlists").click();
    await page.locator('#albums [data-playlist="700"]').waitFor();
    assert.equal(await page.locator("#home-recommendation-status").isVisible(), false);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("home shows created and subscribed playlists, with collection pagination and a narrow song scrollbar", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/?manysubscribed`);
    await page.locator('#home-created-grid [data-playlist="501"]').waitFor();
    await page.locator('#home-subscribed-grid [data-playlist="801"]').waitFor();
    assert.equal(await page.locator('#home-created-grid button').count(), 2);
    assert.equal(await page.locator('#home-subscribed-grid button').count(), 6);
    assert.equal(await page.locator('#sidebar-created [data-playlist="501"]').count(), 1);
    assert.equal(await page.locator('#sidebar-created [data-playlist="801"]').count(), 1);
    assert.equal(await page.locator('#sidebar-created .playlist-group-label').count(), 2);
    assert.equal(await page.locator('#connection').count(), 0);
    assert.equal(await page.evaluate(() => previewLibrary.calls.some(call => call.name === "listSubscribed")), true);
    assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el, '::-webkit-scrollbar').display), 'none');
    const output = path.join(__dirname, '../out/music-ui');
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'home-with-library.png') });
    await page.locator('#sidebar-created [data-playlist="801"]').click();
    await page.locator('#list-heading').filter({ hasText: '雨天书房' }).waitFor();
    await page.locator('#tracks tr').first().waitFor();
    assert.equal(await page.locator('#tracks tr').count(), 3);
    assert.equal(await page.locator('#notice').isVisible(), false);
    assert.equal(await page.locator('main').evaluate(el => getComputedStyle(el, '::-webkit-scrollbar').width), '6px');
    await page.locator('[data-view="subscribed"]').first().click();
    assert.equal(await page.locator('#subscribed-grid button').count(), 30);
    await page.locator('#more-subscribed').click();
    await page.locator('#more-subscribed').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#subscribed-grid button').count(), 32);
    assert.equal(await page.locator('#sidebar-created [data-playlist="832"]').count(), 1);
    assert.deepEqual(await page.evaluate(() => previewLibrary.calls.filter(call => call.name === 'listSubscribed').map(call => call.options.offset)), [0, 30]);
    await page.locator('#search').fill('收藏歌单 32');
    assert.equal(await page.locator('#subscribed-grid button').count(), 1);
    await page.locator('[data-view="discover"]').click();
    assert.equal(await page.locator('#home-subscribed-grid button').count(), 6);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("subscribed playlists show account and request failures independently of recommendations", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/?subscribederror`);
    await page.locator('#home-subscribed-status').filter({ hasText: '读取失败' }).waitFor();
    assert.equal(await page.locator('#home-created-grid button').count(), 2);
    assert.equal(await page.locator('#albums button').count(), 6);
    await page.goto(`http://127.0.0.1:${server.address().port}/?signedout`);
    await page.locator('#home-subscribed-status').filter({ hasText: '登录' }).waitFor();
    assert.equal(await page.locator('#home-subscribed-grid button').count(), 0);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
