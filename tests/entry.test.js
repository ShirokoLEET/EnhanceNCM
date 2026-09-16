const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { bundle } = require("../tools/build-page.js");
const source = fs.readFileSync(require.resolve("../src/host/entry.js"), "utf8");
const key = "enhancencm.settings.v1", pendingKey = "enhancencm.restorePending.v1";
const original = "orpheus://orpheus/pub/app.html";

function fixture(options = {}) {
  const values = new Map([[key, JSON.stringify({ version: 1, mode: "enhanced", themeId: "future-theme" })]]);
  if (options.mode) values.set(key, JSON.stringify({ version: 1, mode: options.mode, themeId: "future-theme" }));
  if (options.pending) values.set(pendingKey, "1");
  if (options.legacy) { values.delete(key); values.set("enhancencm.displayMode.v1", "enhanced"); }
  const calls = [], timers = new Map(); let nextId = 0;
  const context = {
    URL,
    EnhanceNCM: { _startMusic() { calls.push("mount"); },
      _startup: { read() { return options.noStorage ? null : { downloadDir: "D:\\Music", cacheDir: "D:\\Cache", capacity: "10" }; }, observeOriginal() {} } },
    location: { href: options.url || original, reload() { calls.push("reload"); } },
    document: { readyState: options.late ? "complete" : "loading", documentElement: null,
      open() { calls.push("open"); if (options.writeError) throw Error("document error"); },
      write(html) { calls.push("write"); this.html = html; }, close() { calls.push("close"); } },
    stop() { calls.push("stop"); },
    setTimeout(fn, ms) { const id = ++nextId; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    localStorage: { getItem: key => values.get(key) || null,
      setItem(key, value) { if (options.blocked) throw Error("storage blocked"); values.set(key, value); },
      removeItem: key => values.delete(key) }
  };
  vm.runInNewContext(source, context);
  function tick(ms) {
    for (const [id, timer] of [...timers]) if (timer.ms === ms) { timers.delete(id); timer.fn(); }
  }
  return { context, calls, values, timers, tick };
}

test("direct entry stops the original parser and mounts after native context creation without navigation", () => {
  const f = fixture();
  assert.deepEqual(f.calls, ["stop"]);
  assert.equal(f.values.get(pendingKey), "1");
  f.tick(0);
  assert.deepEqual(f.calls, ["stop", "open", "write", "close", "mount"]);
  assert.equal(f.context.location.href, original);
  assert.equal(f.context.document.html.includes("<script"), false);
  f.context.EnhanceNCM._entry.confirm();
  f.tick(15000);
  assert.equal(f.calls.includes("reload"), false);
});
test("tray popup entry renders its own document without starting the full client", () => {
  const f = fixture({ url: original + "?enhancencm-tray=token-1" });
  f.context.EnhanceNCM._startTrayMenu = () => f.calls.push("tray");
  assert.deepEqual(f.calls, ["stop"]);
  f.tick(0);
  assert.deepEqual(f.calls, ["stop", "open", "write", "close", "tray"]);
  assert.equal(f.context.EnhanceNCM._trayMenuToken, "token-1");
  assert.equal(f.values.has(pendingKey), false);
});

test("original mode, other frames, and late injection leave the original document untouched", () => {
  for (const options of [{ mode: "original" }, { url: "orpheus://orpheus/pub/login.html" },
    { url: original + "-other" }, { url: "https://example.com/" }, { late: true }]) {
    const f = fixture(options);
    assert.deepEqual(f.calls, []);
    assert.equal(f.context.EnhanceNCM._entry, undefined);
  }
});

test("legacy enhanced preference and original entry query/hash use direct startup", () => {
  for (const options of [{ legacy: true }, { url: original + "#/home" }, { url: original + "?foo=1" }]) {
    const f = fixture(options);
    assert.deepEqual(f.calls, ["stop"]);
    assert.equal(f.values.get(pendingKey), "1");
  }
});

test("interrupted startup restores the original mode while retaining the theme", () => {
  const f = fixture({ pending: true });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(JSON.parse(f.values.get(key)), { version: 1, mode: "original", themeId: "future-theme" });
  assert.equal(f.values.has(pendingKey), false);
});

test("unwritable recovery state never interrupts the original page", () => {
  const f = fixture({ blocked: true });
  assert.deepEqual(f.calls, []);
});

test("upgrade without native paths initializes through the original client once", () => {
  const f = fixture({ noStorage: true });
  assert.deepEqual(f.calls, []);
  assert.equal(JSON.parse(f.values.get(key)).mode, "enhanced");
  assert.equal(f.values.has(pendingKey), false);
});

test("document failure and missing renderer recover by reloading once in original mode", () => {
  for (const options of [{ writeError: true }, {}]) {
    const f = fixture(options);
    if (!options.writeError) delete f.context.EnhanceNCM._startMusic;
    f.tick(0); f.tick(15000);
    assert.equal(f.calls.filter(x => x === "reload").length, 1);
    assert.equal(JSON.parse(f.values.get(key)).mode, "original");
    assert.equal(f.values.has(pendingKey), false);
  }
});

test("a stalled startup has a bounded recovery path", () => {
  const f = fixture(); f.tick(0); f.tick(15000);
  assert.equal(f.calls.at(-1), "reload");
  assert.equal(JSON.parse(f.values.get(key)).mode, "original");
});

test("native direct startup completes main-window lifecycle and respects autorun", async () => {
  for (const autorun of [false, true]) {
    const calls = [];
    const context = { URL, URLSearchParams, setTimeout, clearTimeout,
      channel: { call(name, callback) { calls.push(name); callback(name === "app.getAppStartType" ? (autorun ? "autorun" : "normal") : undefined); } } };
    vm.runInNewContext(bundle(), context);
    await context.EnhanceNCM.sdk.window.initialize();
    assert.deepEqual(calls, ["winhelper.initMainWindow", "os.getSystemInfo", "winhelper.setWindowPosition", "winhelper.setWindowIconFromLocalFile", "winhelper.finishLoadMainWindow",
      "trayicon.setIcon", "trayicon.setToolTip", "trayicon.wasInstall", "trayicon.install", "app.appStartUpEnd", "app.getAppStartType",
      ...autorun ? [] : ["winhelper.showWindow", "winhelper.bringWindowToTop"]]);
  }
});
test("an already installed tray icon is updated without installing it twice", async () => {
  const calls = [];
  const context = { URL, URLSearchParams, setTimeout, clearTimeout,
    channel: { call(name, callback, args) { calls.push({ name, args }); callback(name === "trayicon.wasInstall" ? true : "normal"); } } };
  vm.runInNewContext(bundle(), context);
  await context.EnhanceNCM.sdk.window.initialize();
  assert.equal(calls.find(c => c.name === "trayicon.setIcon").args[0],
    "orpheus://orpheus/pub/public/assets/img/common/tray/app.ico");
  assert.equal(calls.find(c => c.name === "winhelper.setWindowIconFromLocalFile").args[0],
    "orpheus://orpheus/pub/public/assets/img/common/tray/app_min.ico");
  assert.equal(calls.some(c => c.name === "trayicon.install"), false);
});

test("a taskbar icon command without a callback cannot block tray startup", async () => {
  const calls = [];
  const context = { URL, URLSearchParams, setTimeout, clearTimeout,
    channel: { call(name, callback) {
      calls.push(name);
      if (name === "winhelper.setWindowIconFromLocalFile") return;
      callback(name === "app.getAppStartType" ? "autorun" : undefined);
    } } };
  vm.runInNewContext(bundle(), context);
  await context.EnhanceNCM.sdk.window.initialize();
  assert.ok(calls.includes("winhelper.finishLoadMainWindow"));
  assert.ok(calls.includes("trayicon.setIcon"));
  assert.ok(calls.includes("trayicon.install"));
});

test("direct network requests share native initialization before encrypting", async () => {
  let initCallback, initialized = false;
  const calls = [];
  const context = { URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    EnhanceNCM: { _entry: { active: true } },
    channel: { call(name, callback) {
      calls.push(name);
      if (name === "network.initAegis") { initCallback = () => { initialized = true; callback({ errorCode: 0 }); }; return; }
      if (name === "network.aegisEncrypt") { assert.equal(initialized, true); callback({ errorCode: 0, encryptedBody: "native-body" }); return; }
      callback({ code: 0, status: 200, blob: '{"code":200}' });
    } } };
  vm.runInNewContext(bundle(), context);
  const transport = context.EnhanceNCM._transport;
  const requests = [transport.request("/api/test", {}), transport.request("/api/test", {})];
  assert.deepEqual(calls, ["network.initAegis"]);
  initCallback(); await Promise.all(requests);
  assert.equal(calls.filter(name => name === "network.initAegis").length, 1);
  assert.equal(calls.filter(name => name === "network.aegisEncrypt").length, 2);
});

test("failed native network initialization can retry and never sends unencrypted data", async () => {
  const calls = [];
  const context = { URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    EnhanceNCM: { _entry: { active: true } },
    channel: { call(name, callback) { calls.push(name); callback({ errorCode: -1 }); } } };
  vm.runInNewContext(bundle(), context);
  for (let attempt = 0; attempt < 2; attempt++)
    await assert.rejects(context.EnhanceNCM._transport.request("/api/test", {}), { code: "NETWORK_INIT_FAILED" });
  assert.deepEqual(calls, ["network.initAegis", "network.initAegis"]);
});

test("cold entry restores usable window bounds and clamps a removed monitor", async () => {
  let position;
  const saved = { x: 4000, y: -1000, width: 1600, height: 1000 };
  const context = { URL, URLSearchParams, setTimeout, clearTimeout,
    localStorage: { getItem: () => JSON.stringify(saved) },
    channel: { call(name, callback, args) {
      if (name === "os.getSystemInfo") return callback({ workArea: { x: -1280, y: 0, width: 1280, height: 720 } });
      if (name === "winhelper.setWindowPosition") position = JSON.parse(JSON.stringify(args[0]));
      callback();
    } } };
  vm.runInNewContext(bundle(), context);
  await context.EnhanceNCM.sdk.window.initialize();
  assert.deepEqual(position, { x: -1280, y: 0, width: 1280, height: 720, topmost: false });
});
