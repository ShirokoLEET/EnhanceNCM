const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const songs = [{ id: "1", name: "One", dt: 180000, url: "https://temporary-audio.invalid/token" }, { id: "2", name: "Two", dt: 240000 }];
const saved = () => ({ version: 1, queue: songs, songId: "2", position: 73, source: "playlist:10", shuffle: true, repeatOne: true });
function fixture(records = new Map(), preferences = {}) {
  let state = { songId: null, playId: null, status: "idle", current: 0, volume: 1, duration: 0 };
  const listeners = new Set(), calls = [], writes = [];
  const config = { rememberVolume: true, restoreQueue: true, restorePosition: true, autoPlay: false, volume: 0.35, previousVolume: 0.35, ...preferences };
  const emit = change => { state = { ...state, ...change }; listeners.forEach(fn => fn(state)); };
  const playback = { getState: () => state, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async play(id, options) { calls.push(["play", id, options.startPosition]); emit({ songId: id, playId: "p-" + id, status: "playing", current: options.startPosition || 0 }); },
    async pause() { calls.push(["pause"]); emit({ status: "paused" }); },
    async resume() { calls.push(["resume"]); emit({ status: "playing" }); },
    async stop() { calls.push(["stop"]); emit({ songId: null, playId: null, status: "idle", current: 0 }); },
    async seek(position) { emit({ current: position }); }, async setVolume(volume) { calls.push(["volume", volume]); emit({ volume }); } };
  const context = { setTimeout, clearTimeout, EnhanceNCM: { sdk: { playback } } };
  for (const name of ["player-session", "player-persistence"])
    vm.runInNewContext(fs.readFileSync("src/sdk/domain/" + name + ".js", "utf8"), context);
  const player = context.EnhanceNCM._player.createSession({ previousVolume: config.previousVolume });
  const store = { async read(owner) { return records.get(owner) || null; }, async save(owner, record) {
    const clone = JSON.parse(JSON.stringify(record)); records.set(owner, clone); writes.push({ owner, record: clone });
  } };
  const controller = context.EnhanceNCM._playerPersistence.attach(player, { store,
    settings: { playback: () => ({ ...config }), updatePlayback: change => Object.assign(config, change) } });
  return { player, controller, store, calls, writes, config, emit,
    async close() { controller.dispose(); await player.dispose(); } };
}

test("restores a paused queue and position without opening any audio stream; click continues at the saved second", async () => {
  const f = fixture(new Map([["42", saved()]]), { volume: 0, previousVolume: 0.4 });
  try {
    await f.controller.restoreVolume(); await f.controller.restore("42", false);
    const state = f.player.getState();
    assert.equal(state.playback.status, "paused"); assert.equal(state.playback.playId, null);
    assert.equal(state.playback.current, 73); assert.equal(state.song.id, "2");
    assert.deepEqual(Array.from(state.queue, s => s.id), ["1", "2"]);
    assert.equal(state.shuffle, true); assert.equal(state.repeatOne, true);
    assert.deepEqual(f.calls, [["volume", 0]]);
    await f.player.toggle();
    assert.deepEqual(f.calls.at(-1), ["play", "2", 73]);
  } finally { await f.close(); }
});

test("exit checkpoint survives native stop, strips temporary URLs and restores in another page", async () => {
  const records = new Map(), f = fixture(records);
  try {
    await f.controller.restore("42", true); await f.controller.restoreVolume();
    await f.player.play(songs[1], { queue: songs }); f.emit({ current: 81 });
    await f.controller.prepareExit(); await f.player.stop();
    assert.equal(records.get("42").position, 81);
    assert.equal(records.get("42").queue[0].url, undefined);
    assert.equal(f.config.volume, 0.35);
  } finally { await f.close(); }
  const next = fixture(records);
  try { await next.controller.restore("42", false); assert.equal(next.player.getState().playback.current, 81); }
  finally { await next.close(); }
});

test("restored mute remembers the last nonzero volume", async () => {
  const f = fixture(new Map(), { volume: 0, previousVolume: 0.4 });
  try {
    await f.controller.restoreVolume();
    assert.equal(f.player.getState().playback.volume, 0);
    await f.player.toggleMute();
    assert.equal(f.player.getState().playback.volume, 0.4);
    assert.equal(f.config.volume, 0.4);
  } finally { await f.close(); }
});

test("late disk reads cannot replace the user's new selection", async () => {
  const f = fixture(); let complete;
  f.store.read = () => new Promise(resolve => { complete = resolve; });
  try {
    const restore = f.controller.restore("42", true);
    await f.player.play(songs[0], { queue: [songs[0]] });
    complete(saved()); await restore;
    assert.equal(f.player.getState().song.id, "1");
    await f.controller.prepareExit(); assert.equal(f.writes.at(-1).record.songId, "1");
  } finally { await f.close(); }
});

test("confirmed account changes stop the old session and ignore stale cached identities", async () => {
  const other = { ...saved(), songId: "1", position: 10 };
  const f = fixture(new Map([["42", saved()], ["43", other]]));
  try {
    await f.controller.restore("42", false);
    await f.controller.restore("43", true);
    await f.controller.restore("42", false);
    assert.equal(f.player.getState().song.id, "1");
    await f.controller.prepareExit();
    assert.ok(f.writes.every(write => write.owner === "43"));
  } finally { await f.close(); }
});

test("restore flags, corrupt data and a missing selected song remain usable", async () => {
  for (const preferences of [{ restoreQueue: false }, { restorePosition: false }]) {
    const f = fixture(new Map([["42", saved()]]), preferences);
    try {
      await f.controller.restore("42", true);
      if (preferences.restoreQueue === false) assert.equal(f.player.getState().queue.length, 0);
      else assert.equal(f.player.getState().playback.current, 0);
    } finally { await f.close(); }
  }
  const f = fixture(new Map([["42", { version: 7, queue: songs }]]));
  try { await f.controller.restore("42", true); assert.equal(f.player.getState().song, null); }
  finally { await f.close(); }
});

test("a failed exit save is reported and can be retried without losing position", async () => {
  const f = fixture(); const save = f.store.save;
  try {
    await f.controller.restore("42", true); await f.player.play(songs[0]); f.emit({ current: 39 });
    f.store.save = async () => { throw Error("disk full"); };
    await assert.rejects(f.controller.prepareExit(), /disk full/);
    f.controller.cancelExit(); f.store.save = save;
    await f.controller.prepareExit(); assert.equal(f.writes.at(-1).record.position, 39);
  } finally { await f.close(); }
});

test("slow saves coalesce and an exit checkpoint retains the newest position", async () => {
  const f=fixture(); const save=f.store.save;let complete,started=0;
  try {
    await f.controller.restore('42',true);await f.player.play(songs[0]);
    f.store.save=async(owner,record)=>{started++;await new Promise(r=>complete=r);return save(owner,record);};
    const first=f.controller.flush();await new Promise(r=>setTimeout(r,0));
    f.emit({current:55});const second=f.controller.flush();
    assert.equal(first,second);assert.equal(started,1);
    f.store.save=save;complete();await first;
    await f.controller.prepareExit();assert.equal(f.writes.at(-1).record.position,55);
  }finally{await f.close();}
});

test("retry re-reads a failed restore for the same account", async () => {
  const f=fixture(new Map([['42',saved()]]));const read=f.store.read;
  try {
    f.store.read=async()=>{throw Error('not ready');};
    await assert.rejects(f.controller.restore('42',true),/not ready/);
    f.store.read=read;await f.controller.retry();
    assert.equal(f.player.getState().song.id,'2');assert.equal(f.player.getState().playback.current,73);
  }finally{await f.close();}
});
