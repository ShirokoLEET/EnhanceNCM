const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { DatabaseSync } = require("node:sqlite");
const { bundle } = require("../tools/build-page.js");

function fixture(db = new DatabaseSync(":memory:")) {
  const events = new Map(), requests = [], state = { owner: "42", failSql: false };
  db.exec("CREATE TABLE IF NOT EXISTS dbTrack (id TEXT PRIMARY KEY,jsonStr TEXT)");
  const context = { URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    EnhanceNCM: { _transport: { request: async (path, data) => {
      requests.push({ path, data });
      if (path === "/api/w/nuser/account/get") return { profile: { userId: state.owner } };
      if (path === "/api/v6/playlist/detail") return { playlist: { id: data.id, name: "Cache fixture", trackIds: [{ id: 1, v: 2 }, { id: 2, v: 3 }] } };
      if (path === "/api/v3/song/detail") return { songs: JSON.parse(data.c).map(item => ({ id: item.id, name: "Fresh " + item.id })) };
      if (path === "/api/song/like") return { code: 200 };
      throw new Error("Unexpected request " + path);
    } } },
    channel: {
      registerCall: (name, fn) => events.set(name, fn),
      call(name, callback, args) {
        assert.equal(name, "storage.execsql");
        if (state.failSql) throw new Error("Native database unavailable");
        let rows, code = 0;
        try { rows = db.prepare(args[1]).all(); } catch (_) { code = 1; }
        callback();
        queueMicrotask(() => events.get("storage.onexecsqldone")(args[0], code, rows));
      }
    }
  };
  vm.runInNewContext(bundle(), context);
  return { namespace: context.EnhanceNCM, db, requests, state, sdk: context.EnhanceNCM.sdk, cache: context.EnhanceNCM._libraryCache };
}

test("native playlist cache persists across pages, coalesces loads and reuses version-matched dbTrack", async () => {
  const f = fixture();
  try {
    f.db.prepare("INSERT INTO dbTrack VALUES (?,?)").run("1", JSON.stringify({ id: "1", name: "Native", version: 2, artists: [{ name: "Artist" }], album: { name: "Album" }, duration: 2000 }));
    f.db.prepare("INSERT INTO dbTrack VALUES (?,?)").run("2", JSON.stringify({ id: "2", name: "Stale", version: 1 }));
    await f.sdk.account.getCurrent();
    const [meta, songs] = await Promise.all([f.sdk.playlists.get(10), f.sdk.playlists.getTracks(10)]);
    assert.equal(meta.id, "10");
    assert.deepEqual(Array.from(songs, song => song.name), ["Native", "Fresh 2"]);
    assert.equal(songs[0].ar[0].name, "Artist");
    assert.equal(f.requests.filter(r => r.path === "/api/v6/playlist/detail").length, 1);
    assert.equal(f.requests.find(r => r.path === "/api/v3/song/detail").data.c, '[{"id":2}]');
    const next = fixture(f.db);
    await next.sdk.account.getCurrent();
    assert.equal((await next.sdk.playlists.getTracks(10))[0].name, "Native");
    assert.equal(next.requests.length, 1, "a new page reads playlist metadata and songs through Native SQLite without content requests");
    assert.equal(next.sdk.cache.getState().hits, 2);
  } finally { f.db.close(); }
});

test("playback sessions are atomic, isolated by account and survive response-cache refresh", async () => {
  const f = fixture();
  try {
    const record = { version: 1, songId: "2", position: 47, queue: [{ id: "2", name: "Saved" }] };
    await f.cache.sessions.save("42", record);
    await f.cache.clear("42");
    const next = fixture(f.db);
    assert.deepEqual(JSON.parse(JSON.stringify(await next.cache.sessions.read("42"))), record);
    assert.equal(await next.cache.sessions.read("43"), null);
    await assert.rejects(f.cache.sessions.save("42' OR 1=1", record), /invalid session owner/);
  } finally { f.db.close(); }
});

test("account changes, refresh and successful likes invalidate the appropriate cache", async () => {
  const f = fixture();
  try {
    await f.sdk.account.getCurrent(); await f.sdk.playlists.get(10);
    f.state.owner = "43";
    await f.sdk.account.getCurrent(); await f.sdk.playlists.get(10);
    assert.equal(f.requests.filter(r => r.path === "/api/v6/playlist/detail").length, 2);
    await f.sdk.cache.refresh(); await f.sdk.playlists.get(10);
    await f.sdk.songs.like(1); await f.sdk.playlists.get(10);
    assert.equal(f.requests.filter(r => r.path === "/api/v6/playlist/detail").length, 4);
    f.state.owner = "42";
    await f.sdk.account.getCurrent(); await f.sdk.playlists.get(10);
    assert.equal(f.requests.filter(r => r.path === "/api/v6/playlist/detail").length, 4, "the other account's cache is preserved");
  } finally { f.db.close(); }
});

test("expired, corrupt or unavailable native caches fall back to content requests", async () => {
  const f = fixture();
  try {
    await f.sdk.account.getCurrent(); await f.sdk.playlists.get(10);
    f.db.exec("UPDATE enhancencm_library_cache_v1 SET updatedAt=1");
    const next = fixture(f.db);
    await next.sdk.account.getCurrent(); await next.sdk.playlists.get(10);
    assert.equal(next.requests.length, 2);
    f.db.exec("UPDATE enhancencm_library_cache_v1 SET jsonStr='broken'");
    const corrupt = fixture(f.db);
    await corrupt.sdk.account.getCurrent(); await corrupt.sdk.playlists.get(10);
    assert.equal(corrupt.requests.length, 2);
    const unavailable = fixture(f.db); unavailable.state.failSql = true;
    await unavailable.sdk.account.getCurrent();
    assert.equal((await unavailable.sdk.playlists.getTracks(10)).length, 2);
  } finally { f.db.close(); }
});

test("invalidation prevents a late request from writing stale playlist data", async () => {
  const f = fixture();
  try {
    let finish;
    const pending = f.cache.load("42", "late", () => new Promise(resolve => { finish = resolve; }));
    while (!finish) await new Promise(resolve => setTimeout(resolve, 0));
    await f.cache.clear("42"); finish({ old: true }); await pending;
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM enhancencm_library_cache_v1").get().n, 0);
    assert.equal((await f.cache.load("42", "late", async () => ({ fresh: true }))).fresh, true);
  } finally { f.db.close(); }
});

test("page snapshots outlive SDK freshness and stay scoped to the last confirmed account", async () => {
  const f = fixture();
  try {
    const snapshot = f.cache.snapshot;
    await snapshot.rememberAccount({ userId: "42", profile: { nickname: "First" } });
    await snapshot.save("42", "created", { items: [{ id: 501, name: "Saved" }] });
    await f.sdk.account.getCurrent(); await f.sdk.playlists.get(10);
    f.db.exec("UPDATE enhancencm_library_cache_v1 SET updatedAt=updatedAt-3600000 WHERE id LIKE 'snapshot:%'");
    const next = fixture(f.db);
    assert.equal((await next.cache.snapshot.lastAccount()).userId, "42");
    assert.equal((await next.cache.snapshot.read("42", "created")).items[0].name, "Saved");
    await next.sdk.cache.refresh();
    assert.equal((await next.cache.snapshot.read("42", "created")).items[0].name, "Saved",
      "refreshing SDK responses must not remove the visible page snapshot");
    assert.equal(await next.cache.snapshot.read("43", "created"), null);
    await next.cache.snapshot.rememberAccount({ userId: "43", profile: { nickname: "Second" } });
    assert.equal((await next.cache.snapshot.lastAccount()).userId, "43");
    await next.cache.snapshot.forgetAccount("42");
    assert.equal((await next.cache.snapshot.lastAccount()).userId, "43",
      "a late sign-out for another user cannot erase the new account marker");
    await next.cache.snapshot.forgetAccount("43");
    assert.equal(await next.cache.snapshot.lastAccount(), null);
  } finally { f.db.close(); }
});

test("page snapshots older than seven days and corrupt entries are ignored", async () => {
  const f = fixture();
  try {
    await f.cache.snapshot.rememberAccount({ userId: "42" });
    await f.cache.snapshot.save("42", "created", { items: [{ id: 1 }] });
    f.db.exec("UPDATE enhancencm_library_cache_v1 SET updatedAt=1 WHERE id='snapshot:42:created'");
    assert.equal(await f.cache.snapshot.read("42", "created"), null);
    f.db.exec("UPDATE enhancencm_library_cache_v1 SET jsonStr='broken',updatedAt=strftime('%s','now')*1000 WHERE id='snapshot:last-account'");
    assert.equal(await f.cache.snapshot.lastAccount(), null);
  } finally { f.db.close(); }
});

test("first enhanced launch can read the original account's persistent playlist model without altering it", async () => {
  const f = fixture();
  try {
    f.db.exec("CREATE TABLE persistentModel (uniKey TEXT PRIMARY KEY,jsonStr TEXT)");
    const expires = Date.now() + 86400000;
    const insert = f.db.prepare("INSERT INTO persistentModel VALUES (?,?)");
    insert.run("host", JSON.stringify({ clearTime: expires, data: { uid: "42", nickName: "Original" } }));
    insert.run("async:hostResource", JSON.stringify({ clearTime: expires, vipChangeEvent: "true,42",
      data: { createPlaylist: [{ id: "5", specialType: 5 }, { id: "10", name: "Original playlist" }], likeTrackIds: [1, 2] } }));
    const result = await f.cache.snapshot.original();
    assert.equal(result.account.userId, "42");
    assert.deepEqual(Array.from(result.created.items, item => item.name), ["Original playlist"]);
    assert.deepEqual(Array.from(result.likedIds), ["1", "2"]);
    assert.equal(f.db.prepare("SELECT count(*) AS n FROM persistentModel").get().n, 2);
    f.db.exec("UPDATE persistentModel SET jsonStr=replace(jsonStr, 'true,42', 'true,43') WHERE uniKey='async:hostResource'");
    assert.equal(await f.cache.snapshot.original(), null, "a model belonging to another account cannot be displayed");
  } finally { f.db.close(); }
});


test("cold-start session SQL waits for Native storage initialization", async () => {
  const f = fixture(); let ready;
  f.namespace._startup = { initializeStorage: () => new Promise(resolve => { ready = resolve; }) };
  const read = f.cache.sessions.read("42");
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='enhancencm_player_session_v1'").get().n, 0);
  f.namespace._startup = { initializeStorage: () => Promise.resolve() };
  ready();
  assert.equal(await read, null);
  f.db.close();
});
