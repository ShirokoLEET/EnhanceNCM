const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");
test("a different theme reuses the SDK player and switches views without restarting playback", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator("#refresh-library:enabled").waitFor();
    await page.evaluate(fs.readFileSync("examples/themes/minimal.js", "utf8"));
    await page.evaluate(async () => {
      await disposeMusic(); document.querySelector("#enhancencm-ui-root").remove();
      window.sharedPlayer = EnhanceNCM.sdk.player.createSession();
      sharedPlayer.connectSystemMedia();
      window.mountExample = () => {
        const host = document.createElement("div"); host.id = "example-theme"; document.body.append(host);
        const cleanup = EnhanceNCMExampleTheme(sharedPlayer)({ root: host.attachShadow({ mode: "open" }), sdk: EnhanceNCM.sdk });
        return () => { cleanup(); host.remove(); };
      };
      window.detachTheme = mountExample();
      await sharedPlayer.play({ id: 1, name: "Shared song" }, { queue: [{ id: 1, name: "Shared song" }, { id: 2, name: "Next song" }] });
    });
    await page.locator("#song").filter({ hasText: "Shared song" }).waitFor();
    const before = await page.evaluate(() => ({ playId: sharedPlayer.getState().playback.playId,
      calls: previewNative.calls.filter(c => /audioplayer\.(play|stop|load)$/.test(c.name)).length }));
    await page.evaluate(() => { detachTheme(); window.detachTheme = mountExample(); });
    assert.equal(await page.locator("#song").textContent(), "Shared song · 未知艺人");
    assert.deepEqual(await page.evaluate(() => ({ playId: sharedPlayer.getState().playback.playId,
      calls: previewNative.calls.filter(c => /audioplayer\.(play|stop|load)$/.test(c.name)).length })), before);
    await page.locator("#toggle").click();
    assert.equal(await page.evaluate(() => sharedPlayer.getState().playback.status), "paused");
    await page.locator("#next").click();
    await page.locator("#song").filter({ hasText: "Next song" }).waitFor();
    await page.evaluate(async () => { detachTheme(); await sharedPlayer.dispose(); });
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
