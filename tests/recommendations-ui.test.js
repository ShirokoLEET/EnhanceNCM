const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");

test("four personal modes integrate native playback, batch continuation, stale loads and 500-song paging", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", cause => errors.push(cause.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function open(kind) {
    await page.locator(`.sidebar [data-view="${kind}"]`).click();
    await page.locator("#reload-recommended:enabled").waitFor();
  }
  try {
    await page.goto(base);
    await page.locator("#refresh-library:enabled").waitFor();
    await page.screenshot({ path: path.join(__dirname, "../out/music-ui/personal-home.png") });
    await open("daily");
    assert.equal(await page.locator("#tracks tr").count(), 3);
    assert.equal(await page.locator("#list-heading").textContent(), "每日推荐");
    await page.locator("#play-all").click();
    await page.locator("#now-title").filter({ hasText: "daily 推荐 1" }).waitFor();
    await open("radar");
    assert.equal(await page.locator("#list-heading").textContent(), "私人雷达");
    assert.equal(await page.evaluate(() => previewLibrary.calls.find(c => c.name === "getTracks" && c.id === 501).options.limit), 500);
    for (const kind of ["roaming", "heartmode"]) {
      await open(kind);
      await page.locator("#tracks [data-play]").last().click();
      await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
      assert.equal(await page.locator("#shuffle").isDisabled(), true);
      await page.evaluate(() => previewNative.emit("audioplayer.onEnd", EnhanceNCM.sdk.playback.getState().playId, {}));
      await page.locator("#now-title").filter({ hasText: `${kind} 推荐 4` }).waitFor();
      assert.equal(await page.locator("#tracks tr").count(), 6);
      if (kind === "heartmode") assert.equal(await page.evaluate(() => previewLibrary.calls.filter(c => c.name === "getHeartMode").at(-1).options.songId), 7003);
    }
    await page.screenshot({ path: path.join(__dirname, "../out/music-ui/heart-mode.png") });
    await page.locator("#more-recommended").click();
    await page.locator("#reload-recommended:enabled").waitFor();
    assert.equal(await page.locator("#tracks tr").count(), 9);

    // A late next batch cannot replace a song selected from another playlist.
    await open("roaming");
    await page.evaluate(() => { EnhanceNCM.sdk.recommendations.getPrivateRoaming = () => new Promise(resolve => { window.finishRoaming = resolve; }); });
    await page.locator("#tracks [data-play]").last().click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#next").click();
    await page.waitForFunction(() => !!window.finishRoaming);
    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    await page.locator('#tracks [data-play="1"]').click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().songId === "1" && EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.evaluate(() => finishRoaming([{ id: 9991, name: "Late roaming" }]));
    assert.equal(await page.locator("#now-title").textContent(), "落日来信");

    // Regular playlists page by source offsets, not returned song count.
    await page.evaluate(() => {
      window.pageRequests = [];
      EnhanceNCM.sdk.playlists.get = async () => ({ name: "大歌单", trackCount: 503 });
      EnhanceNCM.sdk.playlists.getTracks = async (id, options) => {
        pageRequests.push(options);
        return Array.from({ length: Math.min(options.limit, 503 - options.offset) }, (_, i) => ({ id: options.offset + i + 8001, name: "分页歌曲 " + (options.offset + i + 1) })).filter(song => song.id !== 8050);
      };
    });
    await page.locator("#reload-playlist").click();
    await page.locator("#list-heading").filter({ hasText: "大歌单" }).waitFor();
    assert.equal(Number(await page.locator("#tracks").getAttribute("data-total")), 499);
    assert.ok(await page.locator("#tracks [data-song]").count() <= 80);
    await page.locator("#more-playlist").click();
    await page.locator("#more-playlist").waitFor({ state: "hidden" });
    assert.equal(Number(await page.locator("#tracks").getAttribute("data-total")), 502);
    assert.ok(await page.locator("#tracks [data-song]").count() <= 80);
    assert.deepEqual(await page.evaluate(() => pageRequests.map(o => [o.limit, o.offset])), [[500, 0], [500, 500]]);
    for (const query of ["?signedout", "?emptyrecommendations", "?recommendationerror"]) {
      await page.goto(base + query);
      await page.locator("#refresh-library:enabled").waitFor();
      await open("daily");
      assert.equal(await page.locator("#play-all").isDisabled(), true);
      if (query === "?signedout") assert.match(await page.locator("#recommendation-status").textContent(), /先在网易云原版登录/);
      if (query === "?recommendationerror") {
        await page.evaluate(() => { previewLibrary.failRecommendations = false; });
        await page.locator("#reload-recommended").click();
        await page.locator("#play-all:enabled").waitFor();
      }
    }
    await page.goto(base);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(__dirname, "../out/music-ui/personal-narrow.png") });
    assert.ok(await page.locator("main").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
