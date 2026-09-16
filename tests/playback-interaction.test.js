const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");

test("a playback progress tick between pointer down and up must not swallow pause", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    await page.locator("#play-all:enabled").click();
    await page.locator('#play[aria-label="暂停"][aria-busy="false"]').waitFor();
    await page.evaluate(() => {
      const root = document.querySelector("#enhancencm-ui-root").shadowRoot;
      window.previousPlayIcon = root.querySelector("#play svg");
      window.previousMuteIcon = root.querySelector("#mute svg");
    });
    const bounds = await page.locator("#play svg").boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.evaluate(() => {
      const state = EnhanceNCM.sdk.playback.getState();
      previewNative.emit("audioplayer.onPlayProgress", state.playId, state.current + 0.1);
    });
    assert.equal(await page.evaluate(() => {
      const root = document.querySelector("#enhancencm-ui-root").shadowRoot;
      return previousPlayIcon === root.querySelector("#play svg") && previousMuteIcon === root.querySelector("#mute svg");
    }), true, "unchanged control icons keep their DOM nodes during progress updates");
    await page.mouse.up();
    assert.equal(await page.evaluate(() => previewNative.calls.filter(c => c.name === "audioplayer.pause").length), 1,
      "repainting progress must preserve the pointer's original target until click");
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().status), "paused");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
