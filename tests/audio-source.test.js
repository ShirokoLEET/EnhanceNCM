const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const sources = ["transport/native.js", "domain/audio-source.js", "domain/playback.js"].map(file => fs.readFileSync("src/sdk/" + file, "utf8")).join("\n");
function fixture() {
  const events = new Map(), calls = [];
  const controls = { owner: "42", vipType: 11, now: Date.now(), cached: 100, failQuery: false, loadCode: 0,
    urlRequests: 0, audio: { id: 1, code: 200, url: "https://preview.invalid/authorized", md5: "a".repeat(32), size: 10000,
      br: 128000, time: 200000, level: "standard", type: "mp3", format: "mp3", expi: 1200,
      freeTrialInfo: null, freeTrialPrivilege: { resConsumable: false, userConsumable: false } } };
  const context = { setTimeout, clearTimeout, Date: class extends Date { static now() { return controls.now; } },
    EnhanceNCM: { sdk: {
      account: { getCurrent: async () => { if (!controls.owner) throw new Error("signed out"); return { userId: controls.owner, profile: { vipType: controls.vipType } }; } },
      songs: { getUrl: async () => { controls.urlRequests++; return controls.audio; } }
    } },
    channel: {
      registerCall(name, callback) { events.set(name, callback); },
      call(name, callback, args) {
        calls.push({ name, args });
        if (name === "storage.queryNewCacheTrack") {
          if (controls.failQuery) throw new Error("cache query unavailable");
          return callback({ ...args[0], cached: controls.cached,
            playInfoStr: controls.corrupt ? "bad-json" : JSON.stringify({ ...controls.audio, resourceType: "track" }), ...controls.cacheOverride });
        }
        if (name === "audioplayer.load") {
          queueMicrotask(() => events.get("audioplayer.onLoad")(args[0], { code: controls.loadCode,
            duration: 200, openWholeCached: controls.cached === 100, preloadWholeCached: false }));
        }
        callback();
      }
    }
  };
  vm.runInNewContext(sources, context);
  return { player: context.EnhanceNCM._playback, source: context.EnhanceNCM._audioSource, controls, calls };
}
test("repeated playback uses Native whole cache and a still-authorized URL, with original cache metadata", async () => {
  const { player, controls, calls } = fixture();
  const first = await player.play(1), second = await player.play(1);
  assert.equal(controls.urlRequests, 1);
  assert.equal(first.audioCache.urlSource, "network");
  assert.equal(second.audioCache.urlSource, "memory");
  assert.equal(second.audioCache.cacheComplete, true);
  assert.equal(second.audioCache.openWholeCached, true);
  assert.equal(second.audioCache.hasNativePlayInfo, true);
  const info = calls.find(c => c.name === "audioplayer.load").args[1];
  assert.equal(JSON.parse(info.playInfoStr).resourceType, "track");
  assert.equal(JSON.parse(info.playInfoStr).freeTrialInfo, null);
  assert.equal(JSON.parse(info.extHeader)["X-SONG-INFO"], "10000;200000");
  const query = calls.find(c => c.name === "storage.queryNewCacheTrack").args[0];
  assert.equal(query.bitrate, 128);
  assert.equal(query.md5, controls.audio.md5);
  await player.pause(); await player.resume();
  assert.equal(controls.urlRequests, 1);
  await player.stop();
});
test("account, membership, quality and expiry changes require fresh authorization", async () => {
  const { player, controls } = fixture();
  await player.play(1);
  controls.owner = "43"; await player.play(1);
  controls.vipType = 0; await player.play(1);
  await player.play(1, { level: "exhigh" });
  controls.now += 300001; await player.play(1, { level: "exhigh" });
  controls.owner = null; await player.play(1); await player.play(1);
  assert.equal(controls.urlRequests, 7);
  await player.stop();
});
test("trial and full-trial authorizations never become reusable full-song metadata", async () => {
  for (const trial of [{ freeTrialInfo: { start: 0, end: 30 } }, { freeTrialPrivilege: { resConsumable: true, userConsumable: true } }]) {
    const { player, controls, calls } = fixture();
    Object.assign(controls.audio, trial);
    await player.play(1); await player.play(1);
    assert.equal(controls.urlRequests, 2);
    assert.equal(calls.filter(c => c.name === "storage.queryNewCacheTrack").length, 0);
    assert.equal(calls.find(c => c.name === "audioplayer.load").args[1].playInfoStr, "");
    await player.stop();
  }
});
test("partial caches, corrupt metadata and unavailable queries still use the authorized Native stream", async () => {
  for (const config of [{ cached: 40 }, { failQuery: true }, { corrupt: true }, { cacheOverride: { md5: "wrong" } }]) {
    const { player, controls } = fixture(); Object.assign(controls, config);
    const state = await player.play(1);
    assert.equal(state.status, "playing");
    if (config.cached || config.failQuery || config.cacheOverride) assert.equal(state.audioCache.cacheComplete, false);
    if (!config.cached) assert.equal(state.audioCache.hasNativePlayInfo, false);
    await player.stop();
  }
});
test("failed load invalidates remembered authorization; cancelled account checks never fetch a URL", async () => {
  const { player, controls } = fixture();
  controls.loadCode = 403;
  await assert.rejects(player.play(1), cause => cause.code === "LOAD_FAILED");
  controls.loadCode = 0; await player.play(1);
  assert.equal(controls.urlRequests, 2);
  const pending = player.play(2); const rejected = assert.rejects(pending, cause => cause.code === "CANCELLED");
  await player.stop(); await rejected;
  assert.equal(controls.urlRequests, 2);
});
