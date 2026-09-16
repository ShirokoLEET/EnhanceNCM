const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");

test("lyrics view opens from the microphone or cover, follows playback, seeks and handles empty/error states", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const output = path.join(__dirname, "../out/music-ui");
  fs.mkdirSync(output, { recursive: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  async function load(query = "") {
    await page.goto(base + query);
    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    await page.locator('#tracks tr').first().waitFor();
  }
  try {
    await load();
    await page.locator("#lyrics-toggle").click();
    assert.equal(await page.locator("#lyrics-view").isVisible(), true);
    assert.match(await page.locator("#lyrics-status").textContent(), /播放一首歌曲/);
    assert.equal(await page.locator("#lyrics-toggle").getAttribute("aria-pressed"), "true");
    await page.locator("#cover-toggle").click();
    assert.equal(await page.locator("#lyrics-view").isVisible(), false);

    await page.locator("#play-all:enabled").click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#cover-toggle").click();
    await page.locator(".lyric-line").first().waitFor();
    assert.equal(await page.locator(".toolbar").isVisible(), false);
    assert.equal(await page.locator(".window-bar #refresh").isVisible(), true);
    assert.equal(await page.locator(".window-bar #original").isVisible(), true);
    await page.waitForFunction(() => getComputedStyle(document.querySelector("#enhancencm-ui-root").shadowRoot.querySelector("#lyrics-view")).backgroundColor !== "rgb(36, 36, 36)");
    const firstColor = await page.locator("#lyrics-view").evaluate(el => getComputedStyle(el).backgroundColor);
    assert.equal(await page.locator(".lyric-line").count(), 6);
    assert.equal(await page.locator(".lyric-line.active").first().textContent(), "街灯刚刚亮起");
    assert.equal(await page.locator("#lyrics-song").textContent(), "落日来信");
    await page.screenshot({ path: path.join(output, "lyrics-desktop.png") });
    await page.locator('[data-lyric-time="16"]').click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().current >= 16);
    assert.match(await page.locator(".lyric-line.active").textContent(), /沿着夜色/);
    await page.locator("#queue-toggle").click();
    assert.equal(await page.locator("#lyrics-view").isVisible(), false);
    assert.equal(await page.locator("#queue-panel").isVisible(), true);
    await page.locator("#close-queue").click();
    await page.locator("#lyrics-toggle").click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#lyrics-view").isVisible(), false);

    await page.locator("#lyrics-toggle").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator(".app").evaluate(el => el.scrollWidth - el.clientWidth), 0);
    await page.screenshot({ path: path.join(output, "lyrics-narrow.png") });
    await page.locator("#lyrics-close").click();
    assert.equal(await page.locator("#lyrics-view").isVisible(), false);

    await page.setViewportSize({ width: 1440, height: 900 });
    await load();
    await page.evaluate(() => {
      const original = EnhanceNCM.sdk.songs.getLyrics;
      EnhanceNCM.sdk.songs.getLyrics = id => String(id) === "1" ?
        new Promise(resolve => { window.releaseOldLyrics = resolve; }) : original(id);
    });
    await page.locator("#play-all:enabled").click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#lyrics-toggle").click();
    assert.match(await page.locator("#lyrics-status").textContent(), /正在加载/);
    await page.locator("#next").click();
    await page.locator("#lyrics-song").filter({ hasText: "慢慢喜欢这个世界" }).waitFor();
    await page.locator(".lyric-line").first().waitFor();
    await page.waitForFunction(previous => getComputedStyle(document.querySelector("#enhancencm-ui-root").shadowRoot.querySelector("#lyrics-view")).backgroundColor !== previous, firstColor);
    await page.evaluate(() => releaseOldLyrics({ synced: true, lines: [{ time: 0, text: "过期的歌词" }] }));
    assert.equal(await page.locator("#lyrics-song").textContent(), "慢慢喜欢这个世界");
    assert.equal(await page.locator("#lyrics-lines").getByText("过期的歌词").count(), 0);

    await load("?nolyrics");
    await page.locator("#play-all:enabled").click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#lyrics-toggle").click();
    await page.locator("#lyrics-status").filter({ hasText: "暂时没有歌词" }).waitFor();
    assert.equal(await page.locator("#lyrics-retry").isVisible(), false);

    await load("?lyricerror");
    await page.locator("#play-all:enabled").click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#cover-toggle").click();
    await page.locator("#lyrics-retry").waitFor();
    assert.match(await page.locator("#lyrics-status").textContent(), /加载失败/);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
