const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { bundle } = require("../tools/build-page.js");
function fixture(options = {}) {
  const events = new Map(), calls = [];
  const timelines = [];
  const windowEvents = new Map(), values = new Map();
  const config = { status: "restore", intercept: () => false, delayImage: false, resolveImages: [] };
  const systemArt = 'http://127.0.0.1:19999/'+'a'.repeat(32)+'/'+'b'.repeat(64)+'.png';
  const context = { EnhanceNCM: { cacheLocalArtwork: () => systemArt,
      updateSystemTimeline: (position, duration, active) => timelines.push({ position, duration, active }) },
    document: { createElement: () => ({ getContext: () => ({drawImage(){}}), toDataURL: () => 'data:image/png;base64,test' }) }, URL, URLSearchParams, setTimeout, clearTimeout,
    devicePixelRatio: options.devicePixelRatio,
    screen: { availLeft: 0, availTop: 0, availWidth: 1920, availHeight: 1080 },
    localStorage: { setItem(key, value) { values.set(key, value); }, getItem: key => values.get(key) || null,
      removeItem(key) { values.delete(key); } },
    addEventListener(name, callback) { windowEvents.set(name, callback); },
    removeEventListener(name) { windowEvents.delete(name); },
    Image: class { naturalWidth = 800; naturalHeight = 800; set src(value) { calls.push({ name: "preload", args: [value] });
      if (config.delayImage) config.resolveImages.push(() => this.onload?.());
      else queueMicrotask(() => config.failImage ? this.onerror?.() : this.onload?.()); } }, channel: {
    registerCall(name, callback) { events.set(name, callback); },
    call(name, callback, args) {
      calls.push({ name, args });
      if (config.intercept(name, callback, args)) return;
      if (name === "winhelper.getWindowInfo") return callback({ status: config.status });
      if (name === "winhelper.showWindow") { config.status = args[0]; events.get("winhelper.onSizeStatus")?.(config.status, 1200, 800); }
      if (name === "winhelper.launchWindow") values.set("enhancencm.trayMenu.ready.v1",
        new URL(args[0]).searchParams.get("enhancencm-tray"));
      callback();
    }
  } };
  vm.runInNewContext(bundle(), context);
  return { sdk: context.EnhanceNCM.sdk, namespace: context.EnhanceNCM, events, calls, timelines, config, values,
    storage(key, value) { windowEvents.get("storage")?.({ key, newValue: value }); } };
}
const song = { id: 1, name: "Test song", ar: [{ name: "Artist" }], al: { id: 7, name: "Album", picUrl: "https://example.com/cover?type=webp" } };
const playing = { songId: "1", playId: "native-1", status: "playing", current: 0 };

test("launching an existing instance activates the window and releases its listener", async () => {
  const { sdk, events, calls } = fixture();
  const release = sdk.window.subscribeActivate(() => sdk.window.activate());
  events.get("ipc.onipcmessagerecived")(1);
  events.get("ipc.onipcmessagerecived")(3);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.filter(c => c.name === "winhelper.bringWindowToTop").length, 1);
  release(); events.get("ipc.onipcmessagerecived")(1);
  assert.equal(calls.filter(c => c.name === "winhelper.bringWindowToTop").length, 1);
});

test("artwork URLs use stable native cache keys and are safe to normalize repeatedly", () => {
  const { sdk } = fixture();
  const original = "https://p4.music.126.net/cover/example.jpg?param=200y200&type=webp";
  const cached = sdk.artwork.getUrl(original);
  assert.ok(cached.startsWith("orpheus://cache?https://p4.music.126.net/"));
  const image = new URL(cached.slice("orpheus://cache?".length));
  assert.equal(image.searchParams.get("thumbnail"), "320y320");
  assert.equal(image.searchParams.get("type"), "jpg");
  assert.equal(image.searchParams.has("param"), false);
  assert.equal(sdk.artwork.getUrl(original), cached);
  assert.equal(sdk.artwork.getUrl(cached), cached);
  assert.equal(sdk.artwork.getUrl("file:///private/image.png"), "");
  assert.throws(() => sdk.artwork.getUrl(original, -1), /artwork size/);
});

test("window controls use verified commands and report native maximize state", async () => {
  const { sdk, calls, events } = fixture();
  const states = [], window = sdk.window;
  const release = window.subscribe(state => states.push(state.maximized));
  await window.toggleMaximize(); await window.toggleMaximize(); await window.minimize();
  await window.drag(); await window.resize("bottomright"); await window.close();
  assert.deepEqual(states, [true, false, false]);
  assert.deepEqual(calls.filter(c => c.name === "winhelper.showWindow").map(c => c.args[0]), ["maximize", "restore", "minimize"]);
  assert.equal(calls.find(c => c.name === "winhelper.sizeWindow").args[0], "bottomright");
  await assert.rejects(window.resize("invalid"), /unsupported/);
  release(); events.get("winhelper.onSizeStatus")("maximize");
  assert.equal(states.length, 3);
});
test("system media publishes metadata, cover and status without resending on progress", async () => {
  const { sdk, calls, events } = fixture();
  const actions = [];
  const session = sdk.systemMedia.createSession(action => actions.push(action));
  await session.update(song, playing);
  const info = calls.find(c => c.name === "player.setInfo").args[0];
  assert.equal(info.playId, "1"); assert.equal(info.songName, "Test song");
  assert.equal(info.artistName, "Artist"); assert.equal(info.albumName, "Album");
  assert.equal(info.url, "https://example.com/cover?type=jpg");
  assert.equal(calls.find(c => c.name === "winhelper.setWindowTitle").args[0], "Test song - Artist");
  assert.equal(calls.find(c => c.name === "trayicon.setToolTip").args[0], "Test song - Artist");
  const count = calls.length;
  await session.update(song, { ...playing, current: 12 });
  assert.equal(calls.length, count);
  await session.update(song, { ...playing, status: "paused" });
  assert.equal(calls.filter(c => c.name === "player.setMiniPlayerState").at(-1).args[0].playstate, 1);
  const pausedThumbnail = calls.filter(c => c.name === "app.setThumbnail").at(-1).args[0];
  assert.equal(pausedThumbnail.btnMiddle.tooltip, "播放");
  assert.deepEqual([pausedThumbnail.btnLeft.id, pausedThumbnail.btnMiddle.id, pausedThumbnail.btnRight.id], [300, 301, 302]);
  assert.equal(pausedThumbnail.albumCoverUrl, "https://example.com/cover?type=jpg");
  events.get("player.onaction")("next", "smtc");
  events.get("player.onaction")("unknown", "smtc");
  assert.deepEqual(actions, ["next"]);
  await session.dispose();
  assert.equal(calls.filter(c => c.name === "player.setMiniPlayerState").at(-1).args[0].playstate, 2);
  const preloaded = calls.findIndex(c => c.name === "preload");
  assert.equal(calls[preloaded].args[0], "orpheus://cache?https://example.com/cover?type=jpg");
  assert.ok(calls.findIndex(c => c.name === "app.setThumbnail") > preloaded);
  assert.ok(calls.findIndex(c => c.name === "player.setCover") > preloaded);
  assert.equal(calls.filter(c => c.name === "player.setInfo").at(-1).args[0].songName, "");
  assert.equal(calls.filter(c => c.name === "winhelper.setWindowTitle").at(-1).args[0], "网易云音乐");
  assert.equal(calls.filter(c => c.name === "trayicon.setToolTip").at(-1).args[0], "网易云音乐");
  events.get("player.onaction")("play", "smtc");
  assert.deepEqual(actions, ["next"]);
});
test("system media timeline follows playback and publishes manual seek jumps", async () => {
  const { sdk, timelines } = fixture();
  const session = sdk.systemMedia.createSession(() => {});
  await session.update(song, { ...playing, duration: 180, current: 12.2 });
  assert.deepEqual(timelines.at(-1), { position: 12.2, duration: 180, active: true });
  const count = timelines.length;
  await session.update(song, { ...playing, duration: 180, current: 12.8 });
  assert.equal(timelines.length, count, "sub-second progress does not flood the native bridge");
  await session.update(song, { ...playing, duration: 180, current: 84.5 });
  assert.deepEqual(timelines.at(-1), { position: 84.5, duration: 180, active: true });
  await session.clear();
  assert.deepEqual(timelines.at(-1), { position: 0, duration: 0, active: false });
  await session.dispose();
});
test("taskbar artwork reuses the same Native cache key as the visible UI", async () => {
  const { sdk, calls } = fixture();
  const cover = "https://p4.music.126.net/cover/example.jpg?param=200y200&type=webp";
  const session = sdk.systemMedia.createSession(() => {});
  await session.update({ ...song, al: { ...song.al, picUrl: cover } }, playing);
  const thumbnail = calls.find(c => c.name === "app.setThumbnail").args[0];
  assert.equal("orpheus://cache?" + thumbnail.albumCoverUrl, sdk.artwork.getUrl(cover));
  assert.ok(calls.findIndex(c => c.name === "preload") < calls.findIndex(c => c.name === "player.setInfo"),
    "cover lookup starts in parallel with Native metadata updates");
  await session.dispose();
});
test("selected track cover is available before its audio finishes loading", async () => {
  const { sdk, calls } = fixture();
  const session = sdk.systemMedia.createSession(() => {});
  await session.update(song, { ...playing, status: "loading" });
  assert.equal(calls.find(c => c.name === "player.setInfo").args[0].songName, "Test song");
  assert.ok(calls.find(c => c.name === "app.setThumbnail").args[0].albumCoverUrl);
  assert.equal(calls.find(c => c.name === "player.setMiniPlayerState").args[0].playstate, 1);
  await session.dispose();
});
test("loading-to-playing transition shares one in-flight cover lookup", async () => {
  const { sdk, calls, config } = fixture();
  config.delayImage = true;
  const session = sdk.systemMedia.createSession(() => {});
  const pending = session.update(song, { ...playing, status: "loading" });
  for (let i = 0; i < 10 && !config.resolveImages.length; i++) await new Promise(resolve => setTimeout(resolve, 0));
  const playingUpdate = session.update(song, playing);
  for (let i = 0; i < 10; i++) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.filter(c => c.name === "preload").length, 1);
  config.resolveImages[0]();
  await Promise.all([pending, playingUpdate]);
  assert.equal(calls.filter(c => c.name === "preload").length, 1);
  assert.equal(calls.filter(c => c.name === "app.setThumbnail").at(-1).args[0].btnMiddle.tooltip, "暂停");
  await session.dispose();
});
test("taskbar buttons and custom tray window control the current session", async () => {
  const { sdk, namespace, calls, events, values, storage } = fixture();
  let cursor = { x: 120, y: 1070 };
  namespace.cursorPosition = () => cursor;
  const actions = [], shellActions = [];
  const session = sdk.systemMedia.createSession((action, source) => actions.push([action, source]),
    action => action === "getLikeState" ? { liked: true, canLike: true } : shellActions.push(action));
  await session.update(song, playing);
  const thumbnail = calls.find(c => c.name === "app.setThumbnail").args[0];
  assert.deepEqual([thumbnail.btnLeft.id, thumbnail.btnMiddle.id, thumbnail.btnRight.id], [300, 301, 302]);
  assert.match(thumbnail.btnMiddle.url, /pause_dark\.ico$/);
  events.get("player.onthumbnailaction")(300);
  events.get("player.onthumbnailaction")({ id: 301 });
  events.get("player.onthumbnailaction")("302");
  events.get("trayicon.onclick")();
  events.get("trayicon.onrightclick")();
  cursor = { x: 1800, y: 1070 };
  for (let i = 0; i < 10 && !calls.some(c => c.name === "winhelper.launchWindow"); i++)
    await new Promise(resolve => setTimeout(resolve, 0));
  const popup = calls.filter(c => c.name === "winhelper.launchWindow").at(-1).args;
  assert.match(popup[0], /enhancencm-tray=/);
  assert.equal(popup[1].width, 212);
  assert.equal(popup[1].height, 132);
  assert.equal(popup[1].x, 14);
  assert.equal(popup[1].y, 930);
  assert.equal(popup[2].taskbarButton, false);
  assert.equal(popup[2].visible, true);
  assert.equal(JSON.parse(values.get("enhancencm.trayMenu.state.v1")).bounds.width, 212);
  assert.equal(JSON.parse(values.get("enhancencm.trayMenu.state.v1")).liked, true);
  assert.equal(calls.some(c => c.name === "winhelper.popupMenu"), false);
  const token = JSON.parse(values.get("enhancencm.trayMenu.state.v1")).token;
  storage("enhancencm.trayMenu.action.v1", JSON.stringify({ token, action: "toggle" }));
  storage("enhancencm.trayMenu.action.v1", JSON.stringify({ token, action: "next" }));
  storage("enhancencm.trayMenu.action.v1", JSON.stringify({ token, action: "like" }));
  storage("enhancencm.trayMenu.action.v1", JSON.stringify({ token, action: "exit" }));
  assert.deepEqual(actions, [["prev", "thumbnail"], ["pause", "thumbnail"], ["next", "thumbnail"],
    ["pause", "tray"], ["next", "tray"]]);
  assert.deepEqual(shellActions, ["open", "like", "exit"]);
  await session.update(song, { ...playing, status: "paused" });
  const pausedThumbnail = calls.filter(c => c.name === "app.setThumbnail").at(-1).args[0];
  assert.deepEqual([pausedThumbnail.btnLeft.id, pausedThumbnail.btnMiddle.id, pausedThumbnail.btnRight.id], [300, 301, 302]);
  assert.match(pausedThumbnail.btnMiddle.url, /play_dark\.ico$/);
  events.get("player.onthumbnailaction")(301);
  events.get("trayicon.onrightclick")();
  assert.equal(JSON.parse(values.get("enhancencm.trayMenu.state.v1")).playing, false);
  assert.deepEqual(actions.at(-1), ["play", "thumbnail"]);
  await session.dispose();
  events.get("trayicon.onclick")(); events.get("player.onthumbnailaction")(301);
  assert.deepEqual(shellActions, ["open", "like", "exit"]);
  assert.equal(actions.length, 6);
});
test("tray event coordinates are converted from logical to physical pixels", async () => {
  const { sdk, calls, events, config } = fixture({ devicePixelRatio: 1.5 });
  config.intercept = (name, callback) => {
    if (name !== "os.getSystemInfo") return false;
    callback({ workArea: { x: 0, y: 0, width: 2560, height: 1528 } });
    return true;
  };
  const session = sdk.systemMedia.createSession(() => {}, () => ({ liked: false, canLike: false }));
  await session.update(song, playing);
  events.get("trayicon.onrightclick")({ x: 1421, y: 1052 });
  for (let i = 0; i < 10 && !calls.some(c => c.name === "winhelper.launchWindow"); i++)
    await new Promise(resolve => setTimeout(resolve, 0));
  const bounds = calls.filter(c => c.name === "winhelper.launchWindow").at(-1).args[1];
  assert.deepEqual(JSON.parse(JSON.stringify(bounds)),
    { x: 1973, y: 1318, width: 318, height: 198, factor: 1.5 });
  await session.dispose();
});
test("a newer track or disposal supersedes pending system metadata writes", async () => {
  const { sdk, calls, config } = fixture();
  let finish;
  config.intercept = (name, callback, args) => {
    if (name !== "player.setInfo" || args[0].playId !== "1") return false;
    finish = callback; return true;
  };
  const session = sdk.systemMedia.createSession(() => {});
  const old = session.update(song, playing);
  for (let i = 0; i < 10 && !finish; i++) await new Promise(resolve => setTimeout(resolve, 0));
  const latest = session.update({ ...song, id: 2, name: "New song", al: {} }, { ...playing, songId: "2" });
  finish(); await Promise.all([old, latest]);
  assert.equal(calls.filter(c => c.name === "player.setInfo").at(-1).args[0].songName, "New song");
  assert.deepEqual(calls.filter(c => c.name === "winhelper.setWindowTitle").map(c => c.args[0]), ["New song - Artist"]);
  assert.equal(calls.some(c => c.name === "player.setCover"), false);
  await session.dispose();
  const count = calls.length;
  await session.update(song, playing);
  assert.equal(calls.length, count);
});
test("window and tray labels use the original artist separator and restore the default without a song", async () => {
  const { sdk, calls } = fixture();
  const session = sdk.systemMedia.createSession(() => {});
  await session.update({ ...song, ar: [{ name: "First" }, { name: "Second" }] }, playing);
  assert.equal(calls.filter(c => c.name === "winhelper.setWindowTitle").at(-1).args[0], "Test song - First/Second");
  assert.equal(calls.filter(c => c.name === "trayicon.setToolTip").at(-1).args[0], "Test song - First/Second");
  await session.clear();
  assert.equal(calls.filter(c => c.name === "winhelper.setWindowTitle").at(-1).args[0], "网易云音乐");
  await session.dispose();
});


test("local taskbar and SMTC covers use the converted Native cache key across pause updates", async () => {
  const { sdk, calls } = fixture();
  const local = sdk.localMusic.create("D:\\Music\\local.flac", {title:"Local"});
  const session = sdk.systemMedia.createSession(() => {});
  await session.update(local, {...playing,songId:local.id});
  await session.update(local, {...playing,songId:local.id,status:"paused"});
  const thumbnails = calls.filter(c => c.name === "app.setThumbnail").map(c => c.args[0]);
  assert.ok(thumbnails.length >= 2);
  for (const thumbnail of thumbnails) {
    assert.match(thumbnail.albumCoverUrl, /^http:\/\/127\.0\.0\.1:/);
    assert.equal(thumbnail.defaultCover, undefined);
    assert.deepEqual([thumbnail.btnLeft.id,thumbnail.btnMiddle.id,thumbnail.btnRight.id],[300,301,302]);
  }
  assert.equal(thumbnails.at(-1).btnMiddle.tooltip,"播放");
  assert.equal(calls.find(c=>c.name==='player.setCover').args[0],thumbnails[0].albumCoverUrl);
  assert.equal(calls.filter(c=>c.name==='preload').at(-1).args[0],'orpheus://cache?'+thumbnails[0].albumCoverUrl);
  await session.dispose();
});

test("missing embedded artwork keeps the default cover across playback state changes", async () => {
  const { sdk, calls, config } = fixture();
  config.failImage = true;
  const local = sdk.localMusic.create("D:\\Music\\no-cover.wav");
  const session = sdk.systemMedia.createSession(() => {});
  await session.update(local, {...playing,songId:local.id});
  await session.update(local, {...playing,songId:local.id,status:"paused"});
  for (const call of calls.filter(c => c.name === "app.setThumbnail")) {
    assert.match(call.args[0].defaultCover,/default_disc\.png$/);
    assert.equal(call.args[0].albumCoverUrl,undefined);
  }
  await session.dispose();
});


test("cold startup completes Native window setup before system media initialization", async () => {
  const {sdk,namespace,config,calls}=fixture();
  namespace._entry={active:true,storage:{downloadDir:"D:\\Music",cacheDir:"D:\\Cache",capacity:"10"}};
  let ready;
  config.intercept=(name,callback)=>{if(name==='winhelper.initMainWindow'){ready=callback;return true;}return false;};
  const session=sdk.systemMedia.createSession(()=>{});
  const updating=session.update(song,playing);
  const starting=sdk.window.initialize();
  for(let i=0;i<20&&!ready;i++)await new Promise(r=>setTimeout(r,0));
  assert.equal(calls.filter(c=>c.name==='winhelper.initMainWindow').length,1);
  assert.equal(calls.some(c=>c.name==='player.setSMTCEnable'),false);
  ready();await Promise.all([starting,updating]);
  assert.ok(calls.findIndex(c=>c.name==='player.setSMTCEnable')>calls.findIndex(c=>c.name==='app.appStartUpEnd'));
  await session.dispose();
});
