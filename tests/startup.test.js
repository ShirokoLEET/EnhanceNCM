const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../src/sdk/startup.js"), "utf8");
const key = "enhancencm.nativeStartup.v1";

test("original startup captures configured paths and capacity, then restores the bridge", () => {
  const saved = new Map(); let poll;
  const calls = [];
  function original(name, callback, args) { calls.push({ name, args }); callback?.(); }
  const context = { channel: { call: original },
    localStorage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) },
    setInterval(fn) { poll = fn; }, clearInterval() {}, setTimeout, clearTimeout };
  vm.runInNewContext(source, context);
  context.EnhanceNCM._startup.observeOriginal(); poll();
  context.channel.call("network.fetch", () => {}, { credentials: "never persist" });
  assert.equal(saved.size, 0);
  const args = vm.runInNewContext('["D:\\\\Music", "10", "E:\\\\CustomCache"]');
  context.channel.call("storage.init", () => {}, args);
  assert.equal(context.channel.call, original);
  assert.equal(saved.size, 1);
  assert.deepEqual(JSON.parse(saved.get(key)), { version: 1, storage: { downloadDir: "D:\\Music", capacity: "10", cacheDir: "E:\\CustomCache" } });
  assert.equal(calls.length, 2);
});

test("UI and playback share storage initialization without changing the configured paths", async () => {
  const storage = { downloadDir: "D:\\Music", cacheDir: "E:\\CustomCache", capacity: "10" };
  const calls = []; let complete;
  const context = { setTimeout, clearTimeout, EnhanceNCM: { _entry: { active: true, storage },
    _native: { callArgs(name, args) { calls.push({ name, args: Array.from(args) }); return new Promise(resolve => { complete = resolve; }); } } } };
  vm.runInNewContext(source, context);
  const startup = context.EnhanceNCM._startup;
  const first = startup.initializeStorage(), second = startup.initializeStorage();
  assert.equal(first, second);
  assert.deepEqual(calls, [{ name: "storage.init", args: ["D:\\Music", "10", "E:\\CustomCache"] }]);
  complete([storage.downloadDir, storage.cacheDir]); await Promise.all([first, second]);
});

test("invalid storage configuration fails before invoking native initialization", async () => {
  const context = { setTimeout, clearTimeout, EnhanceNCM: { _entry: { active: true, storage: { capacity: -1 } } } };
  vm.runInNewContext(source, context);
  await assert.rejects(context.EnhanceNCM._startup.initializeStorage(), /configuration is unavailable/);
});


test("failed Native initialization can be retried instead of caching rejection", async () => {
  let calls=0;
  const context={setTimeout,clearTimeout,EnhanceNCM:{_entry:{active:true,storage:{downloadDir:"D:\\Music",cacheDir:"D:\\Cache",capacity:"10"}},
    _native:{callArgs:async()=>{if(++calls===1)throw Error("temporarily unavailable");}}}};
  vm.runInNewContext(source,context);
  await assert.rejects(context.EnhanceNCM._startup.initializeStorage(),/temporarily/);
  await context.EnhanceNCM._startup.initializeStorage();
  assert.equal(calls,2);
});
