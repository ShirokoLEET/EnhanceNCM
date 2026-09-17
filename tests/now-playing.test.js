const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const settingsSource = fs.readFileSync(path.join(__dirname, "../src/sdk/settings.js"), "utf8");
const nowPlayingSource = fs.readFileSync(path.join(__dirname, "../src/sdk/domain/now-playing.js"), "utf8");

function createContext() {
  const values = new Map();
  const native = { configure: [], publish: [], settingsJson: "" };
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
    },
    EnhanceNCM: {
      readNowPlayingSettings() { return native.settingsJson; },
      configureNowPlayingService(webApi, fileOutput) {
        native.configure.push([webApi, fileOutput]);
        native.settingsJson = JSON.stringify({ nowPlaying: { webApi, fileOutput } });
      },
      publishNowPlaying(...payload) { native.publish.push(payload.map(JSON.parse)); },
      _transport: { request: async () => ({ lrc: { lyric: "[00:01.00]歌词" } }) },
    },
  };
  vm.runInNewContext(settingsSource, context);
  vm.runInNewContext(nowPlayingSource, context);
  return { context, values, native };
}

test("now-playing settings are validated and persisted in the native JSON settings", () => {
  const { context, values, native } = createContext();
  assert.deepEqual(JSON.parse(JSON.stringify(context.EnhanceNCM._settings.nowPlaying())), { webApi: false, fileOutput: false });
  context.EnhanceNCM._settings.updateNowPlaying({ webApi: true, fileOutput: true });
  assert.deepEqual(JSON.parse(JSON.stringify(context.EnhanceNCM._settings.nowPlaying())), { webApi: true, fileOutput: true });
  assert.deepEqual(JSON.parse(native.settingsJson).nowPlaying,
    { webApi: true, fileOutput: true });
  assert.equal(values.get("enhancencm.settings.v1"), undefined);
  assert.deepEqual(native.configure.at(-1), [true, true]);
  assert.throws(() => context.EnhanceNCM._settings.updateNowPlaying({ webApi: "yes" }),
    error => error && error.name === "TypeError");
});

test("now-playing publishes the compatible track/player/progress shape and refreshes lyrics", async () => {
  const { context, native } = createContext();
  const service = context.EnhanceNCM._nowPlaying;
  service.configure({ webApi: true, fileOutput: true });
  const snapshot = {
    song: { id: 123, name: "测试歌曲", ar: [{ name: "歌手一" }, { name: "歌手二" }],
      al: { name: "测试专辑", picUrl: "https://example.test/cover.jpg" }, dt: 185000,
      url: "https://music.example.test/song/123" },
    repeatOne: false,
    playback: { status: "playing", current: 12.345, duration: 185, volume: 0.75 },
  };
  service.publish(snapshot);
  let payload = native.publish.at(-1);
  assert.deepEqual(payload[2], {
    author: "歌手一 / 歌手二", title: "测试歌曲", album: "测试专辑",
    cover: "https://example.test/cover.jpg", duration: 185, durationHuman: "3:05",
    url: "https://music.example.test/song/123", id: "123", isVideo: false,
    isAdvertisement: false, inLibrary: false,
  });
  assert.deepEqual(payload[1], {
    hasSong: true, isPaused: false, volumePercent: 75,
    seekbarCurrentPosition: 12, seekbarCurrentPositionHuman: "0:12",
    statePercent: 0.0667, likeStatus: "INDIFFERENT", repeatType: "NONE",
  });
  assert.deepEqual(payload[3], { progress: 12345 });
  await new Promise(resolve => setTimeout(resolve, 0));
  payload = native.publish.at(-1);
  assert.equal(payload[4].source, "netease");
  assert.equal(payload[4].hasLyric, true);
  assert.equal(payload[4].lrc, "[00:01.00]歌词");
  service.clear();
  assert.equal(native.publish.at(-1)[2].id, "");
});
