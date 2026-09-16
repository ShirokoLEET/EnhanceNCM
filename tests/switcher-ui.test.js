const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");

const script = fs.readFileSync(path.join(__dirname, "../src/host/ui/switcher.js"), "utf8");

test("original-client E is borderless and settings use opaque light and dark palettes", async () => {
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body style="margin:0;background:#464c50;color:#eee">
      <header style="height:64px;display:flex;align-items:center;padding:0 40px;background:#303438">
        <span>网易云音乐</span><span data-testid="tid_pc_nav_bar_account" style="margin-left:auto">账号</span>
      </header><div style="padding:42px">原版内容</div></body></html>`);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1100, height: 720 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      localStorage.setItem("currentTheme", "dark");
      window.EnhanceNCM = { app: { mount: async render => {
        const host = document.createElement("div");
        host.id = "enhancencm-ui-root";
        document.body.append(host);
        await render({ root: host.attachShadow({ mode: "open" }) });
      } } };
    });
    await page.addScriptTag({ content: script });
    const getAppearance = () => page.evaluate(() => {
      const shadow = document.querySelector("#enhancencm-ui-root").shadowRoot;
      const button = getComputedStyle(shadow.querySelector("#e-button"));
      const surface = getComputedStyle(shadow.querySelector("#surface"));
      return { theme: shadow.host.dataset.clientTheme, button: button.backgroundColor,
        surface: surface.backgroundColor, ink: surface.color, blur: surface.backdropFilter, buttonBlur: button.backdropFilter, border: button.borderWidth, radius: button.borderRadius, shadow: button.boxShadow };
    });
    const button = page.locator("#enhancencm-ui-root").locator("#e-button");
    await button.click();
    await page.mouse.move(800, 600);
    assert.equal(await page.locator("#enhancencm-ui-root").locator("#surface").isVisible(), true);
    const dark = await getAppearance();
    assert.equal(dark.theme, "dark");
    assert.equal(dark.blur, "none");
    assert.equal(dark.buttonBlur, "none");
    assert.equal(dark.border, "0px");
    assert.equal(dark.radius, "0px");
    assert.equal(dark.shadow, "none");
    assert.equal(dark.button, "rgba(0, 0, 0, 0)");
    assert.equal(dark.surface, "rgb(32, 32, 35)");
    await page.evaluate(() => {
      localStorage.setItem("currentTheme", "light");
      window.dispatchEvent(new StorageEvent("storage", { key: "currentTheme" }));
      document.body.style.background = "#dedede";
    });
    const light = await getAppearance();
    assert.equal(light.theme, "light");
    assert.notEqual(light.ink, dark.ink);
    assert.equal(light.surface, "rgb(255, 255, 255)");
    assert.equal(errors.length, 0, errors.join("\n"));
    const output = path.join(__dirname, "../out/switcher-ui");
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "settings-light.png") });
    await page.evaluate(() => {
      localStorage.setItem("currentTheme", "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: "currentTheme" }));
      document.body.style.background = "#464c50";
    });
    await page.screenshot({ path: path.join(output, "settings-dark.png") });
    await page.evaluate(() => window.EnhanceNCM.ui.setMode("enhanced"));
    await page.waitForURL("about:blank#enhancencm");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("enhancencm.settings.v1")).mode), "enhanced");
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
