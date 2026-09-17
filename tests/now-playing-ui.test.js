const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");

const script = fs.readFileSync(path.join(__dirname, "../src/host/ui/switcher.js"), "utf8");

test("settings expose independent web API and streaming file output switches", async () => {
  const server = http.createServer((request, response) => response.end("<!doctype html><html><body></body></html>"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage();
  try {
    await page.goto("http://127.0.0.1:" + server.address().port + "/");
    await page.evaluate(() => {
      const state = { webApi: false, fileOutput: false };
      window.__nowPlayingSettings = state;
      window.EnhanceNCM = {
        sdk: { settings: {
          getNowPlaying() { return { webApi: state.webApi, fileOutput: state.fileOutput }; },
          setNowPlaying(value) { state.webApi = value.webApi; state.fileOutput = value.fileOutput; return value; },
        } },
        app: { mount: async render => {
          const host = document.createElement("div");
          host.id = "enhancencm-ui-root";
          document.body.append(host);
          await render({ root: host.attachShadow({ mode: "open" }) });
        }, unmount: async () => {} },
      };
    });
    await page.addScriptTag({ content: script });
    const root = page.locator("#enhancencm-ui-root");
    await root.locator("#e-button").click();
    const web = root.getByRole("switch", { name: /网页 API/ });
    const file = root.getByRole("switch", { name: /直播软件文件输出/ });
    assert.equal(await web.getAttribute("aria-checked"), "false");
    assert.equal(await file.getAttribute("aria-checked"), "false");
    await web.click();
    assert.equal(await web.getAttribute("aria-checked"), "true");
    assert.deepEqual(await page.evaluate(() => window.__nowPlayingSettings), { webApi: true, fileOutput: false });
    await file.click();
    assert.equal(await file.getAttribute("aria-checked"), "true");
    assert.deepEqual(await page.evaluate(() => window.__nowPlayingSettings), { webApi: true, fileOutput: true });
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("enhancencm.settings.v1")).nowPlaying), undefined);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
