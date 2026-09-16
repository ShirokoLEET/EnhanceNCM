const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function fixture() {
  const events = [];
  const context = { EnhanceNCM: { sdk: {}, _native: { ready: () => true } },
    document: { body: { appendChild() {} }, createElement() {
      return { attachShadow: () => ({}), remove: () => events.push("remove") };
    } }, setTimeout };
  vm.runInNewContext(fs.readFileSync("src/host/app.js", "utf8"), context);
  return { app: context.EnhanceNCM.app, events };
}
test("theme replacement awaits asynchronous renderer cleanup", async () => {
  const { app, events } = fixture();
  let finish;
  await app.mount(() => () => new Promise(resolve => { finish = resolve; }));
  const unmount = app.unmount();
  const next = app.mount(() => { events.push("new-theme"); });
  await Promise.resolve();
  assert.deepEqual(events, []);
  finish(); await unmount; await next;
  assert.deepEqual(events, ["remove", "new-theme"]);
  await app.unmount();
});
test("unmount during an async mount waits for late cleanup before another theme starts", async () => {
  const { app, events } = fixture();
  let finishRender, finishCleanup;
  const mounting = app.mount(() => new Promise(resolve => { finishRender = resolve; }));
  const unmount = app.unmount();
  const next = app.mount(() => { events.push("new-theme"); });
  finishRender(() => new Promise(resolve => { finishCleanup = resolve; }));
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(finishCleanup);
  assert.equal(events.includes("new-theme"), false);
  finishCleanup(); await mounting; await unmount; await next;
  assert.equal(events.at(-1), "new-theme");
  await app.unmount();
});
