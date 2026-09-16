const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
test("playback configuration preserves interface preferences, silent volume, and the paused restore policy", () => {
  const values = new Map([["enhancencm.settings.v1", JSON.stringify({ version: 1, mode: "enhanced", themeId: "custom",
    playback: { rememberVolume: false, restoreQueue: false, restorePosition: false } })]]);
  const context = { localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } };
  vm.runInNewContext(fs.readFileSync("src/sdk/settings.js", "utf8"), context);
  const settings = context.EnhanceNCM._settings;
  for (const key of ["rememberVolume", "restoreQueue", "restorePosition"]) assert.equal(settings.playback()[key], true);
  settings.updatePlayback({ volume: 0, previousVolume: 0.4, autoPlay: true,
    rememberVolume: false, restoreQueue: false, restorePosition: false });
  for (const key of ["rememberVolume", "restoreQueue", "restorePosition"])
    assert.equal(JSON.parse(values.get("enhancencm.settings.v1")).playback[key], true);
  assert.equal(settings.playback().volume, 0);
  assert.equal(settings.playback().autoPlay, false);
  assert.equal(JSON.parse(values.get("enhancencm.settings.v1")).themeId, "custom");
  vm.runInNewContext(fs.readFileSync("src/host/ui/switcher.js", "utf8"), context);
  context.EnhanceNCM.ui.setMode("original");
  assert.equal(settings.playback().volume, 0);
  assert.equal(settings.playback().restoreQueue, true);
  assert.throws(() => settings.updatePlayback({ volume: 2 }), /volume/);
});
