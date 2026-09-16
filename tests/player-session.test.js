const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function fixture() {
  let state = { songId: null, playId: null, status: "idle", current: 0, volume: 1, pendingStatus: null };
  const listeners = new Set(), calls = [], mediaCalls = [], controls = { stopFails: false };
  let sequence = 0, systemAction;
  const emit = change => { state = { ...state, ...change }; listeners.forEach(fn => fn(state)); };
  const playback = {
    getState: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async play(id) { calls.push(["play", id]); if (controls.deferPlay) await new Promise(resolve => { controls.completePlay = resolve; });
      emit({ songId: String(id), playId: String(++sequence), status: "playing", current: 0 }); },
    async pause() { calls.push(["pause"]); emit({ status: "paused" }); },
    async resume() { calls.push(["resume"]); emit({ status: "playing" }); },
    async stop() { calls.push(["stop"]); if (controls.stopFails) throw new Error("stop failed"); emit({ songId: null, playId: null, status: "idle" }); },
    async seek(seconds) { calls.push(["seek", seconds]); emit({ current: seconds }); },
    async setVolume(value) { emit({ volume: value }); }
  };
  const context = { EnhanceNCM: { sdk: { playback, songs: { get: async id => ({ id, name: "external" }) },
    systemMedia: { createSession(action) { systemAction = action; return {
      update: async (song, state) => mediaCalls.push(["update", song?.id, state.status]),
      clear: async () => mediaCalls.push(["clear"]), dispose: async () => mediaCalls.push(["dispose"])
    }; } } } } };
  vm.runInNewContext(fs.readFileSync("src/sdk/domain/player-session.js", "utf8"), context);
  return { create: context.EnhanceNCM._player.createSession, emit, calls, mediaCalls, controls,
    system: action => systemAction(action) };
}
const songs = [{ id: 1, name: "one", ar: [{ name: "artist" }] }, { id: 2, name: "two" }];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test("headless player owns queue, immutable snapshots, repeat and next/previous independently of UI", async () => {
  const f = fixture(), player = f.create();
  await player.play(songs[0], { queue: songs });
  assert.equal(player.getState().song.name, "one");
  assert.ok(Object.isFrozen(player.getState().queue[0].ar));
  const originalQueue = player.getState().queue;
  f.emit({ current: 8 });
  assert.equal(player.getState().queue, originalQueue);
  await player.previous(); assert.deepEqual(f.calls.at(-1), ["seek", 0]);
  await player.next(); assert.equal(player.getState().song.id, 2);
  player.setRepeatOne(true);
  const playId = player.getState().playback.playId;
  f.emit({ status: "ended", playId }); await flush();
  assert.equal(player.getState().song.id, 2);
  assert.equal(f.calls.filter(c => c[0] === "play").length, 3);
  player.setRepeatOne(false); f.emit({ status: "ended" }); await flush();
  assert.equal(f.calls.filter(c => c[0] === "play").length, 3, "queue end stops automatic looping");
  await player.dispose();
});

test("dynamic continuation coalesces requests and discards batches after another selection", async () => {
  const f = fixture(), player = f.create();
  let finish, requests = 0;
  await player.play(songs[0], { queue: [songs[0]], source: "roaming", loadMore: () => {
    requests++; return new Promise(resolve => { finish = resolve; });
  } });
  player.setShuffle(true); assert.equal(player.getState().shuffle, false);
  const first = player.next(), duplicate = player.next();
  assert.equal(requests, 1);
  finish([songs[0], songs[1]]); await Promise.all([first, duplicate]);
  assert.equal(player.getState().song.id, 2);
  assert.equal(player.getState().queue.length, 2);
  const stale = player.next();
  await player.play(songs[0], { queue: [songs[0]], source: "playlist" });
  finish([{ id: 3, name: "late" }]); await stale;
  assert.equal(player.getState().song.id, 1);
  assert.equal(player.getState().queue.length, 1);
  await player.dispose();
});

test("SMTC shares the same commands and metadata, and theme subscribers can detach without stopping audio", async () => {
  const f = fixture(), player = f.create();
  let renders = 0;
  const release = player.subscribe(() => renders++);
  player.connectSystemMedia();
  await player.play(songs[0], { queue: songs });
  await f.system("pause"); assert.equal(player.getState().playback.status, "paused");
  await f.system("play"); assert.equal(player.getState().playback.status, "playing");
  await f.system("next"); assert.equal(player.getState().song.id, 2);
  const published = f.mediaCalls.length;
  release(); const lastRender = renders;
  f.emit({ current: 1 });
  assert.equal(renders, lastRender);
  assert.equal(f.mediaCalls.length, published, "progress alone does not republish metadata");
  assert.equal(player.getState().playback.status, "playing");
  await player.dispose();
  assert.equal(f.mediaCalls.at(-1)[0], "dispose");
});
test("next track metadata is published while audio is still loading", async () => {
  const f = fixture(), player = f.create();
  player.connectSystemMedia();
  await player.play(songs[0], { queue: songs });
  f.controls.deferPlay = true;
  const next = player.next();
  assert.deepEqual(f.mediaCalls.at(-1), ["update", 2, "loading"]);
  assert.equal(player.getState().playback.songId, "1", "audio has not loaded the next track yet");
  f.controls.completePlay(); await next;
  assert.deepEqual(f.mediaCalls.at(-1), ["update", 2, "playing"]);
  await player.dispose();
});

test("failed disposal keeps ownership until stop is retried successfully", async () => {
  const f = fixture(), player = f.create();
  await player.play(songs[0]);
  assert.throws(() => f.create(), /already owns/);
  f.controls.stopFails = true;
  await assert.rejects(player.dispose(), /stop failed/);
  assert.throws(() => f.create(), /already owns/);
  f.controls.stopFails = false; await player.dispose();
  const next = f.create(); await next.dispose();
});

test("external SDK playback adopts metadata and mute restores the last nonzero volume", async () => {
  const f = fixture(), player = f.create();
  f.emit({ songId: "3", playId: "external", status: "playing" }); await flush();
  assert.equal(player.getState().song.name, "external");
  await player.setVolume(0.3); await player.toggleMute();
  assert.equal(player.getState().playback.volume, 0);
  await player.toggleMute(); assert.equal(player.getState().playback.volume, 0.3);
  await player.dispose();
});

test("insert next preserves playback and takes priority over shuffle without duplicates", async () => {
  const f = fixture(), player = f.create();
  await player.play(songs[0], { queue: songs });
  player.setShuffle(true);
  player.insertNext({id:3,name:'next'});
  assert.equal(player.getState().song.id,1);
  assert.equal(f.calls.length,1);
  player.insertNext(songs[1]);
  assert.deepEqual(Array.from(player.getState().queue, s=>s.id),[1,2,3]);
  await player.next(); assert.equal(player.getState().song.id,2);
  await player.dispose();
});
