const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");

test("self-drawn tray window shows playback state and sends the selected action", async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 212, height: 132 } });
  try {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.evaluate(() => {
      const values = window.__trayValues = new Map([[
        "enhancencm.trayMenu.state.v1", JSON.stringify({ token: "test-token", playing: true, title: "Test song",
          liked: true, canLike: true, bounds: { x: 20, y: 20, width: 212, height: 132, factor: 1 } })
      ]]);
      Object.defineProperty(window, "localStorage", { configurable: true, value: {
        getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)
      } });
      window.__trayNativeCalls = [];
      window.EnhanceNCM = { _trayMenuToken: "test-token", _native: { callArgs: (name, args) => {
        window.__trayNativeCalls.push([name, args]); return Promise.resolve();
      } } };
      window.close = () => { window.__trayClosed = true; };
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../src/host/ui/tray-menu.js"), "utf8") });
    await page.evaluate(() => EnhanceNCM._startTrayMenu());
    assert.equal(await page.locator('[role="menu"]').count(), 1);
    assert.equal(await page.locator('[data-action="toggle"]').getAttribute("aria-label"), "暂停");
    assert.equal(await page.locator('[role="menuitem"]').count(), 5);
    assert.equal(await page.locator("#panel").evaluate(element => element.getBoundingClientRect().width), 212);
    assert.equal(await page.locator("#panel").evaluate(element => element.getBoundingClientRect().height), 132);
    assert.equal(await page.locator("#song-title").textContent(), "Test song");
    assert.equal(await page.locator("#song-title").evaluate(element => getComputedStyle(element).textAlign), "center");
    assert.equal(await page.locator("#song-title").evaluate(element => getComputedStyle(element).userSelect), "none");
    assert.equal(await page.locator("#like").getAttribute("aria-pressed"), "true");
    assert.deepEqual(await page.locator("#controls button").allTextContents(), ["⏮︎", "⏸︎", "⏭︎", "♥︎"]);
    await page.waitForFunction(() => localStorage.getItem("enhancencm.trayMenu.ready.v1") === "test-token");
    assert.deepEqual(await page.evaluate(() => window.__trayNativeCalls.slice(0, 3).map(call => call[0])),
      ["winhelper.setWindowSizeLimit", "winhelper.setWindowPosition", "winhelper.showWindow"]);
    assert.deepEqual(await page.evaluate(() => window.__trayNativeCalls[0][1]),
      [{ x: 212, y: 132 }, { x: 212, y: 132 }]);
    await page.locator('[data-action="next"]').click();
    const result = await page.evaluate(() => JSON.parse(localStorage.getItem("enhancencm.trayMenu.action.v1")));
    assert.equal(result.token, "test-token");
    assert.equal(result.action, "next");
    assert.equal(typeof result.time, "number");
    assert.equal(await page.evaluate(() => window.__trayNativeCalls.at(-1)[0]), "winhelper.destroyWindow");
  } finally { await browser.close(); }
});

test("a native minimum-size clamp never reveals an oversized tray window", async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 300, height: 180 } });
  try {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.evaluate(() => {
      const values = window.__trayValues = new Map([[
        "enhancencm.trayMenu.state.v1", JSON.stringify({ token: "test-token", playing: true,
          bounds: { x: 20, y: 20, width: 212, height: 132, factor: 1 } })
      ]]);
      Object.defineProperty(window, "localStorage", { configurable: true, value: {
        getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value)
      } });
      window.__trayNativeCalls = [];
      window.EnhanceNCM = { _trayMenuToken: "test-token", _native: { callArgs: name => {
        window.__trayNativeCalls.push(name); return Promise.resolve();
      } } };
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../src/host/ui/tray-menu.js"), "utf8") });
    await page.evaluate(() => EnhanceNCM._startTrayMenu());
    await page.waitForFunction(() => window.__trayNativeCalls.includes("winhelper.destroyWindow"));
    assert.equal(await page.evaluate(() => window.__trayNativeCalls.some((name, index) =>
      name === "winhelper.showWindow" && index < window.__trayNativeCalls.indexOf("winhelper.destroyWindow"))), false);
    assert.equal(await page.evaluate(() => localStorage.getItem("enhancencm.trayMenu.ready.v1")), null);
  } finally { await browser.close(); }
});

test("fallback menu is drawn over the app and dismisses outside", async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
  try {
    await page.setContent("<!doctype html><html><body><main>Music app</main></body></html>");
    await page.evaluate(() => { window.EnhanceNCM = {}; });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "../src/host/ui/tray-menu.js"), "utf8") });
    await page.evaluate(() => EnhanceNCM._trayMenuUi.showFallback(action => { window.__trayAction = action; },
      { title: "Paused song", playing: false, liked: false, canLike: true }));
    assert.equal(await page.locator('[data-action="toggle"]').getAttribute("aria-label"), "播放");
    assert.equal(await page.locator('[data-action="toggle"]').textContent(), "▶︎");
    assert.equal(await page.locator("#song-title").textContent(), "Paused song");
    assert.equal(await page.locator("#like").getAttribute("aria-pressed"), "false");
    await page.mouse.click(30, 30);
    assert.equal(await page.locator('[role="menu"]').count(), 0);
    await page.evaluate(() => EnhanceNCM._trayMenuUi.showFallback(action => { window.__trayAction = action; },
      { title: "Paused song", playing: false, canLike: true }));
    await page.locator("#like").click();
    assert.equal(await page.evaluate(() => window.__trayAction), "like");
    await page.evaluate(() => EnhanceNCM._trayMenuUi.showFallback(action => { window.__trayAction = action; },
      { title: "Paused song", playing: false }));
    assert.equal(await page.locator("#like").isDisabled(), true);
    await page.locator('[data-action="previous"]').click();
    assert.equal(await page.evaluate(() => window.__trayAction), "previous");
  } finally { await browser.close(); }
});
