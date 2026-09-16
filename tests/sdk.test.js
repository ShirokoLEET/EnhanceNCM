const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const { bundle, output } = require("../tools/build-page.js");

const source = bundle();

test("build artifact matches the layered page sources", () => {
  const build = require("../tools/build-page.js");
  assert.equal(fs.readFileSync(output, "utf8"), build.hostBundle());
  assert.equal(fs.readFileSync(build.sdkOutput, "utf8"), build.sdkBundle());
  assert.equal(fs.readFileSync(build.themeOutput, "utf8"), build.themeBundle());
});

function sdk(responses, calls) {
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    APP_CONF: {
      apiDomain: "https://interfacepc.music.163.com",
      deviceId: "test-device",
      appver: "3.1.39",
    },
    legacyNativeCmder: {
      async call(name, options) {
        calls.push({ name, options });
        if (name === "network.aegisEncrypt") {
          return { errorCode: 0, encryptedBody: "B=encrypted&S=signature" };
        }
        return { code: 0, status: 200, blob: JSON.stringify(responses.shift()) };
      },
    },
  };
  vm.runInNewContext(source, context);
  return context.EnhanceNCM.sdk;
}

test("song detail uses desktop XeAPI encryption and native fetch", async () => {
  const calls = [];
  const music = sdk([{ code: 200, songs: [{ id: 186016, name: "Test" }] }], calls);
  assert.equal((await music.songs.get(186016)).id, 186016);
  assert.equal(calls[0].name, "network.aegisEncrypt");
  const envelope = JSON.parse(calls[0].options.body);
  assert.equal(envelope.method, "POST");
  assert.equal(new URLSearchParams(atob(envelope.body)).get("e_r"), "true");
  assert.equal(new URLSearchParams(atob(envelope.body)).get("c"), '[{"id":186016}]');
  assert.equal(calls[1].name, "network.fetch");
  assert.equal(calls[1].options.url,
    "https://interfacepc.music.163.com/xeapi/v3/song/detail");
  assert.equal(calls[1].options.isDecrypt, true);
  assert.equal(calls[1].options.isXeapi, true);
  assert.equal(calls[1].options.body, "B=encrypted&S=signature");
});

test("song search uses the current PC endpoint with pagination and returns song details", async () => {
  const calls = [];
  const music = sdk([{ code: 200, data: {
    resources: [
      { resourceId: "12", alg: "search-alg", baseInfo: { simpleSongData: {
        id: 12, name: "测试歌曲", ar: [{ name: "歌手" }], al: { name: "专辑" }
      } }, extInfo: { lyrics: "歌词片段" } },
      { resourceId: "13", baseInfo: { simpleSongData: { id: 13, name: "另一首" } } },
    ], totalCount: 281, hasMore: true, queryRewrite: { keyword: "测试" }
  } }], calls);
  const result = await music.songs.search("  测试 歌曲  ", { limit: 2, offset: 10, needCorrect: false });
  assert.deepEqual(Array.from(result.items, song => [song.id, song.name, song.lyrics]),
    [[12, "测试歌曲", "歌词片段"], [13, "另一首", null]]);
  assert.equal(result.items[0].alg, "search-alg");
  assert.equal(result.total, 281);
  assert.equal(result.more, true);
  assert.equal(result.queryRewrite.keyword, "测试");
  const request = calls.find(call => call.name === "network.fetch");
  assert.equal(request.options.url, "https://interfacepc.music.163.com/xeapi/search/song/list/page");
  const body = new URLSearchParams(atob(JSON.parse(calls[0].options.body).body));
  assert.deepEqual([body.get("keyword"), body.get("scene"), body.get("limit"), body.get("offset"), body.get("needCorrect")],
    ["测试 歌曲", "normal", "2", "10", "false"]);
});

test("song search handles empty pages and validates parameters before sending", async () => {
  const calls = [];
  const music = sdk([{ code: 200, data: { resources: [], totalCount: 0, hasMore: false } }], calls);
  await assert.rejects(music.songs.search("  "), error => error.name === "TypeError");
  await assert.rejects(music.songs.search("test", { limit: 0 }), error => error.name === "RangeError");
  await assert.rejects(music.songs.search("test", { offset: -1 }), error => error.name === "RangeError");
  await assert.rejects(music.songs.search("test", { needCorrect: "false" }), error => error.name === "TypeError");
  assert.equal(calls.length, 0);
  const empty = await music.songs.search("不存在的歌曲");
  assert.equal(empty.items.length, 0);
  assert.equal(empty.total, 0);
  assert.equal(empty.more, false);
  const body = new URLSearchParams(atob(JSON.parse(calls[0].options.body).body));
  assert.deepEqual([body.get("limit"), body.get("offset"), body.get("needCorrect")], ["30", "0", "true"]);
});

test("song lyrics use the desktop endpoint and parse synchronized lines and translations", async () => {
  const calls = [];
  const music = sdk([{ code: 200,
    lrc: { lyric: "[00:01.20]第一句\n[00:03.5][00:05.50]第二句\n[ar:歌手]\n[00:07.00]" },
    tlyric: { lyric: "[00:01.20]First line\n[00:05.50]Second line" }
  }], calls);
  await assert.rejects(music.songs.getLyrics(0), error => error.name === "TypeError");
  assert.equal(calls.length, 0);
  const result = await music.songs.getLyrics("123");
  assert.equal(result.synced, true);
  assert.deepEqual(Array.from(result.lines, line => [line.time, line.text, line.translation || ""]), [
    [1.2, "第一句", "First line"], [3.5, "第二句", ""], [5.5, "第二句", "Second line"]
  ]);
  const request = calls.find(call => call.name === "network.fetch");
  assert.equal(request.options.url, "https://interfacepc.music.163.com/xeapi/song/lyric/v1");
  const body = new URLSearchParams(atob(JSON.parse(calls[0].options.body).body));
  assert.deepEqual([body.get("id"), body.get("lv"), body.get("tv"), body.get("yv")], ["123", "-1", "-1", "-1"]);
});

test("song lyrics handle word timing, missing lyrics and unsynchronized text", async () => {
  const music = sdk([
    { code: 200, yrc: { lyric: "[1000,2000](0,300,0)你(300,300,0)好\n[4000,1000](0,100,0)世界" } },
    { code: 200, nolyric: true },
    { code: 200, lrc: { lyric: "没有时间轴\n第二行" } }
  ], []);
  const timed = await music.songs.getLyrics(1);
  assert.deepEqual(Array.from(timed.lines, line => [line.time, line.text]), [[1, "你好"], [4, "世界"]]);
  const missing = await music.songs.getLyrics(2);
  assert.equal(missing.synced, false);
  assert.equal(missing.lines.length, 0);
  const plain = await music.songs.getLyrics(3);
  assert.equal(plain.synced, false);
  assert.deepEqual(Array.from(plain.lines, line => line.text), ["没有时间轴", "第二行"]);
});

test("playlist tracks retain playlist ordering and requested page", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, playlist: { trackIds: [{ id: 1 }, { id: 2 }, { id: 3 }] } },
    { code: 200, songs: [{ id: 3 }, { id: 2 }] },
  ], calls);
  const songs = await music.playlists.getTracks(123, { offset: 1, limit: 2 });
  assert.deepEqual(Array.from(songs, song => song.id), [2, 3]);
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 2);
});

test("current account and created playlists exclude subscriptions with correct pagination", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42, nickname: "Test" }, account: { id: 42 } },
    { code: 200, playlist: [
      { id: 5, creator: { userId: 42 }, subscribed: false, specialType: 5 },
      { id: 9, creator: { userId: 99 }, subscribed: true },
      { id: 10, creator: { userId: 42 }, subscribed: false },
    ], more: true },
    { code: 200, playlist: [{ id: 11, creator: { userId: 42 }, subscribed: false }], more: false },
  ], calls);
  const page = await music.playlists.listCreated({ limit: 1, offset: 1 });
  assert.deepEqual(Array.from(page.items, item => item.id), [10]);
  assert.equal(page.more, true);
  assert.equal(calls.filter(call => call.name === "network.fetch")[0].options.url,
    "https://interfacepc.music.163.com/xeapi/w/nuser/account/get");
  const secondPage = JSON.parse(calls[4].options.body);
  assert.equal(new URLSearchParams(atob(secondPage.body)).get("uid"), "42");
  assert.equal(new URLSearchParams(atob(secondPage.body)).get("offset"), "3");
});

test("subscribed playlists paginate over the current account's mixed playlist list", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42 } },
    { code: 200, playlist: [
      { id: 5, creator: { userId: 42 }, subscribed: false, specialType: 5 },
      { id: 10, creator: { userId: 99 }, subscribed: true },
      { id: 11, creator: { userId: 98 }, subscribed: true },
      { id: 12, creator: { userId: 97 }, subscribed: false },
    ], more: true },
    { code: 200, playlist: [
      { id: 13, creator: { userId: 96 }, subscribed: true },
      { id: 14, creator: { userId: 42 }, subscribed: false },
    ], more: false },
  ], calls);
  const page = await music.playlists.listSubscribed({ limit: 1, offset: 1 });
  assert.deepEqual(Array.from(page.items, item => item.id), [11]);
  assert.equal(page.more, true);
  const fetches = calls.filter(call => call.name === "network.fetch");
  assert.equal(fetches.length, 3);
  assert.ok(fetches[1].options.url.endsWith("/xeapi/user/playlist"));
  const encryptions = calls.filter(call => call.name === "network.aegisEncrypt");
  const secondPage = new URLSearchParams(atob(JSON.parse(encryptions[2].options.body).body));
  assert.equal(secondPage.get("uid"), "42");
  assert.equal(secondPage.get("offset"), "4");
});

test("subscribed playlists handle empty results, invalid pagination and signed-out accounts", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, account: { id: 42 } },
    { code: 200, playlist: [{ id: 5, creator: { userId: 42 }, subscribed: false }], more: false },
    { code: 200, profile: null, account: null },
  ], calls);
  await assert.rejects(music.playlists.listSubscribed({ limit: -1 }), error => error.name === "RangeError");
  await assert.rejects(music.playlists.listSubscribed({ offset: -1 }), error => error.name === "RangeError");
  assert.equal(calls.length, 0);
  const empty = await music.playlists.listSubscribed();
  assert.equal(empty.items.length, 0);
  assert.equal(empty.more, false);
  await assert.rejects(music.playlists.listSubscribed(), error => error.code === "LOGIN_REQUIRED");
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 3);
});

test("adding a song verifies ownership and uses the current client playlist endpoint", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42 } },
    { code: 200, playlist: { id: 100, creator: { userId: 42 }, subscribed: false } },
    { code: 200, trackIds: [7] },
  ], calls);
  const result = await music.playlists.addTrack(100, "7");
  assert.equal(result.code, 200);
  const fetches = calls.filter(call => call.name === "network.fetch");
  assert.equal(fetches.length, 3);
  assert.ok(fetches[2].options.url.endsWith("/xeapi/v1/playlist/manipulate/tracks"));
  const encryptions = calls.filter(call => call.name === "network.aegisEncrypt");
  const body = new URLSearchParams(atob(JSON.parse(encryptions[2].options.body).body));
  assert.deepEqual([body.get("trackIds"), body.get("pid"), body.get("op")],
    ["[7]", "100", "add"]);
});

test("removing a song verifies ownership and uses the client delete operation", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42 } },
    { code: 200, playlist: { id: 100, creator: { userId: 42 }, subscribed: false } },
    { code: 200, trackIds: [7] },
  ], calls);
  const result = await music.playlists.removeTrack("100", 7);
  assert.equal(result.code, 200);
  const fetches = calls.filter(call => call.name === "network.fetch");
  assert.equal(fetches.length, 3);
  assert.ok(fetches[2].options.url.endsWith("/xeapi/v1/playlist/manipulate/tracks"));
  const encryptions = calls.filter(call => call.name === "network.aegisEncrypt");
  const body = new URLSearchParams(atob(JSON.parse(encryptions[2].options.body).body));
  assert.deepEqual([body.get("trackIds"), body.get("pid"), body.get("op")],
    ["[7]", "100", "del"]);
});

test("playlist track mutations reject invalid IDs and playlists not owned by the current account", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, account: { id: 42 } },
    { code: 200, playlist: { id: 100, creator: { userId: 99 }, subscribed: true } },
  ], calls);
  await assert.rejects(music.playlists.addTrack(0, 7), error => error.name === "TypeError");
  await assert.rejects(music.playlists.addTrack(100, "7&bad"), error => error.name === "TypeError");
  await assert.rejects(music.playlists.removeTrack("bad", 7), error => error.name === "TypeError");
  assert.equal(calls.length, 0);
  await assert.rejects(music.playlists.addTrack(100, 7), error =>
    error.name === "EnhanceNCMError" && error.code === "PLAYLIST_NOT_OWNED");
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 2);
  assert.equal(calls.some(call => call.options && call.options.url &&
    call.options.url.endsWith("/xeapi/v1/playlist/manipulate/tracks")), false);
});

test("liked playlist and liked songs use specialType 5 and preserve track order", async () => {
  const calls = [];
  const account = { code: 200, profile: { userId: 42 } };
  const list = { code: 200, playlist: [
    { id: 9, creator: { userId: 99 }, subscribed: true, specialType: 5 },
    { id: 100, creator: { userId: 42 }, subscribed: false, specialType: 5 },
  ], more: false };
  const music = sdk([account, list, account, list,
    { code: 200, playlist: { trackIds: [{ id: 3 }, { id: 2 }, { id: 1 }] } },
    { code: 200, songs: [{ id: 1 }, { id: 2 }] },
  ], calls);
  assert.equal((await music.playlists.getLiked()).id, 100);
  const songs = await music.songs.listLiked({ limit: 2, offset: 1 });
  assert.deepEqual(Array.from(songs, song => song.id), [2, 1]);
  assert.equal(calls.filter(call => call.name === "network.fetch")[4].options.url,
    "https://interfacepc.music.163.com/xeapi/v6/playlist/detail");
});

test("liked song IDs cover the full account playlist without requesting details", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42 } },
    { code: 200, playlist: [{ id: 100, creator: { userId: 42 }, specialType: 5 }], more: false },
    { code: 200, playlist: { trackIds: [{ id: 3 }, { id: 2 }, { id: 1 }] } },
  ], calls);
  assert.deepEqual(Array.from(await music.songs.getLikedIds()), ["3", "2", "1"]);
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 3);
});

test("song like and unlike use the current client's trackId, userid and boolean like", async () => {
  const calls = [];
  const account = { code: 200, profile: { userId: 42 } };
  const music = sdk([account, { code: 200 }, account, { code: 200 }], calls);
  await music.songs.like(186016);
  await music.songs.unlike("186016");
  const requests = calls.filter(call => call.name === "network.fetch" && call.options.url.endsWith("/xeapi/song/like"));
  assert.equal(requests.length, 2);
  const encrypted = calls.filter(call => call.name === "network.aegisEncrypt");
  assert.deepEqual([encrypted[1], encrypted[3]].map(call => {
    const envelope = JSON.parse(call.options.body);
    const body = new URLSearchParams(atob(envelope.body));
    return [body.get("trackId"), body.get("userid"), body.get("like")];
  }), [["186016", "42", "true"], ["186016", "42", "false"]]);
});

test("song like validates input and preserves server or login errors", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42 } }, { code: 403, message: "forbidden" },
    { code: 200, profile: null, account: null },
  ], calls);
  await assert.rejects(music.songs.setLiked("1&bad", true), error => error.name === "TypeError");
  await assert.rejects(music.songs.setLiked(1, "true"), error => error.name === "TypeError");
  assert.equal(calls.length, 0);
  await assert.rejects(music.songs.setLiked(1, true), error => error.code === 403 && error.path === "/api/song/like");
  await assert.rejects(music.songs.unlike(1), error => error.code === "LOGIN_REQUIRED");
  assert.equal(calls.filter(call => call.name === "network.fetch" && call.options.url.endsWith("/xeapi/song/like")).length, 1);
});

test("daily recommendations use the current account and support both client response versions", async () => {
  const calls = [];
  const account = { code: 200, profile: { userId: 42 } };
  const music = sdk([account, { code: 200, data: { dailySongs: [{ id: 1 }, { id: 2 }] } },
    account, { code: 200, recommend: [{ id: 3 }] }], calls);
  assert.deepEqual(Array.from(await music.recommendations.getDailySongs(), song => song.id), [1, 2]);
  assert.deepEqual(Array.from(await music.recommendations.getDailySongs({ version: 1, limit: 12 }), song => song.id), [3]);
  const fetches = calls.filter(call => call.name === "network.fetch");
  assert.ok(fetches[1].options.url.endsWith("/xeapi/v3/discovery/recommend/songs"));
  assert.ok(fetches[3].options.url.endsWith("/xeapi/v1/discovery/recommend/songs"));
  const encryptions = calls.filter(call => call.name === "network.aegisEncrypt");
  assert.equal(new URLSearchParams(atob(JSON.parse(encryptions[1].options.body).body)).get("limit"), "30");
  assert.equal(new URLSearchParams(atob(JSON.parse(encryptions[3].options.body).body)).get("limit"), "12");
});

test("homepage recommended playlists use the PC recommendation block", async () => {
  const calls = [];
  const music = sdk([{ code: 200, data: { blocks: [
    { blockCode: "OTHER", creatives: [{ resources: [{ resourceId: 1 }] }] },
    { blockCode: "HOMEPAGE_BLOCK_PLAYLIST_RCMD", creatives: [
      { alg: "personalized", resources: [{ resourceId: 123, resourceExtInfo: { playCount: 456 } }],
        uiElement: { mainTitle: { title: "推荐一" }, image: { imageUrl: "https://example.com/1.jpg" } } },
      { resources: [{ resourceId: "789" }], uiElement: { mainTitle: { title: "推荐二" } } },
      { resources: [] },
    ] },
  ] } }], calls);
  const playlists = await music.recommendations.getRecommendedPlaylists();
  assert.deepEqual(Array.from(playlists, item => [item.id, item.name, item.coverImgUrl, item.playCount, item.alg]), [
    [123, "推荐一", "https://example.com/1.jpg", 456, "personalized"],
    ["789", "推荐二", undefined, undefined, undefined],
  ]);
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 1);
  assert.ok(calls[1].options.url.endsWith("/xeapi/homepage/block/page"));
  const body = new URLSearchParams(atob(JSON.parse(calls[0].options.body).body));
  assert.deepEqual(JSON.parse(body.get("cursor")), {
    offset: 0, blockCodeOrderList: ["HOMEPAGE_BLOCK_PLAYLIST_RCMD"]
  });
  assert.deepEqual(JSON.parse(body.get("extInfo")), { abInfo: { "hp-new-homepageV3.1": "t3" } });
  assert.equal(body.get("newStyle"), "true");
});

test("homepage recommended playlists return an empty array when the block is absent", async () => {
  const music = sdk([{ code: 200, data: { blocks: [{ blockCode: "OTHER", creatives: [] }] } }], []);
  assert.equal((await music.recommendations.getRecommendedPlaylists()).length, 0);
});

test("private radar resolves the account's featured playlist instead of a fixed ID", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42 } },
    { code: 200, data: { blocks: [{ code: "OTHER", creatives: [] },
      { code: "CUSTOMIZE_PLAYLIST_MGC", creatives: [
        { resources: [{ resourceType: "song", resourceId: 4 }] },
        { resources: [{ resourceType: "playlist", resourceId: 987 }] },
        { resources: [{ resourceType: "playlist", resourceId: 654 }] },
      ] }] } },
    { code: 200, playlist: { id: 987, name: "今天的私人雷达", specialType: 100, trackIds: [{ id: 1 }] } },
  ], calls);
  assert.equal((await music.recommendations.getPrivateRadar()).id, 987);
  const fetches = calls.filter(call => call.name === "network.fetch");
  assert.ok(fetches[1].options.url.endsWith("/xeapi/pc/customize/block/page"));
  assert.ok(fetches[2].options.url.endsWith("/xeapi/v6/playlist/detail"));
  const encryptions = calls.filter(call => call.name === "network.aegisEncrypt");
  assert.equal(new URLSearchParams(atob(JSON.parse(encryptions[1].options.body).body)).get("newStyle"), "true");
  assert.equal(new URLSearchParams(atob(JSON.parse(encryptions[2].options.body).body)).get("id"), "987");

  const empty = sdk([{ code: 200, profile: { userId: 42 } },
    { code: 200, data: { blocks: [] } }], []);
  assert.equal(await empty.recommendations.getPrivateRadar(), null);
});

test("private roaming fetches a batch without starting playback", async () => {
  const calls = [];
  const music = sdk([{ code: 200, profile: { userId: 42 } },
    { code: 200, data: [{ id: 8 }, { id: 9 }] }], calls);
  assert.deepEqual(Array.from(await music.recommendations.getPrivateRoaming({
    mode: "explore", sourceIds: [3, "5"]
  }), song => song.id), [8, 9]);
  const fetches = calls.filter(call => call.name === "network.fetch");
  assert.ok(fetches[1].options.url.endsWith("/xeapi/v1/radio/get"));
  const encryptions = calls.filter(call => call.name === "network.aegisEncrypt");
  const body = new URLSearchParams(atob(JSON.parse(encryptions[1].options.body).body));
  assert.deepEqual([body.get("imageFm"), body.get("mode"), body.get("sourceIds")], ["1", "explore", "3,5"]);
  assert.equal(calls.some(call => call.name.startsWith("audioplayer.")), false);
});

test("heart mode seeds from the liked playlist and returns ordered song details", async () => {
  const calls = [];
  const music = sdk([
    { code: 200, profile: { userId: 42 } },
    { code: 200, playlist: [{ id: 900, specialType: 5, creator: { userId: 42 } }], more: false },
    { code: 200, playlist: { trackIds: [{ id: 3 }, { id: 5 }] } },
    { code: 200, data: [
      { id: 7, alg: "personal", recommended: true, songInfo: { id: 7, name: "One" } },
      { id: 8, alg: "similar", recommended: false },
    ] },
    { code: 200, songs: [{ id: 8, name: "Two" }] },
  ], calls);
  const songs = await music.recommendations.getHeartMode();
  assert.deepEqual(Array.from(songs, song => [song.id, song.name, song.alg, song.recommended]),
    [[7, "One", "personal", true], [8, "Two", "similar", false]]);
  const fetches = calls.filter(call => call.name === "network.fetch");
  assert.ok(fetches[3].options.url.endsWith("/xeapi/playmode/intelligence/list"));
  assert.ok(fetches[4].options.url.endsWith("/xeapi/v3/song/detail"));
  const encryptions = calls.filter(call => call.name === "network.aegisEncrypt");
  const body = new URLSearchParams(atob(JSON.parse(encryptions[3].options.body).body));
  assert.deepEqual([body.get("playlistId"), body.get("songId"), body.get("startMusicId"), body.get("count"), body.get("type")],
    ["900", "3", "3", "2", "fromPlayOne"]);
});

test("heart mode accepts an explicit seed and handles an absent liked playlist", async () => {
  const calls = [];
  const music = sdk([{ code: 200, profile: { userId: 42 } },
    { code: 200, data: [{ id: 12, songInfo: { id: 12 } }] }], calls);
  assert.equal((await music.recommendations.getHeartMode({
    playlistId: 99, songId: 10, startMusicId: 11, count: 4, type: "fromPlayAll"
  }))[0].id, 12);
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 2);
  const body = new URLSearchParams(atob(JSON.parse(calls.filter(call => call.name === "network.aegisEncrypt")[1].options.body).body));
  assert.deepEqual([body.get("playlistId"), body.get("songId"), body.get("startMusicId"), body.get("count"), body.get("type")],
    ["99", "10", "11", "4", "fromPlayAll"]);
  const empty = sdk([{ code: 200, profile: { userId: 42 } },
    { code: 200, playlist: [], more: false }], []);
  assert.equal((await empty.recommendations.getHeartMode()).length, 0);
});

test("personal recommendations validate options before network and require login", async () => {
  const calls = [];
  const music = sdk([{ code: 200, account: null, profile: null }], calls);
  await assert.rejects(music.recommendations.getDailySongs({ version: 2 }), error => error.name === "TypeError");
  await assert.rejects(music.recommendations.getDailySongs({ limit: 0 }), error => error.name === "RangeError");
  await assert.rejects(music.recommendations.getPrivateRoaming({ mode: "a&b" }), error => error.name === "TypeError");
  await assert.rejects(music.recommendations.getPrivateRoaming({ sourceIds: ["1&x"] }), error => error.name === "TypeError");
  await assert.rejects(music.recommendations.getHeartMode({ songId: 0 }), error => error.name === "TypeError");
  await assert.rejects(music.recommendations.getHeartMode({ type: "unknown" }), error => error.name === "TypeError");
  assert.equal(calls.length, 0);
  await assert.rejects(music.recommendations.getPrivateRadar(), error => error.code === "LOGIN_REQUIRED");
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 1);
});

test("current account methods report signed-out and absent liked playlist", async () => {
  const calls = [];
  const anonymous = sdk([{ code: 200, account: null, profile: null }], calls);
  await assert.rejects(anonymous.account.getCurrent(), error => error.code === "LOGIN_REQUIRED");
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 1);

  const signedIn = sdk([
    { code: 200, account: { id: 42 } },
    { code: 200, playlist: [{ id: 1, creator: { userId: 42 } }], more: false },
  ], []);
  assert.equal(await signedIn.playlists.getLiked(), null);
});

test("current-account pagination is validated before network access", async () => {
  const calls = [];
  const music = sdk([], calls);
  await assert.rejects(music.playlists.listCreated({ limit: -1 }), error =>
    error.name === "RangeError");
  await assert.rejects(music.songs.listLiked({ offset: -1 }), error =>
    error.name === "RangeError");
  assert.equal(calls.length, 0);
});

test("empty playlist page does not request song details", async () => {
  const calls = [];
  const music = sdk([{ code: 200, playlist: { trackIds: [] } }], calls);
  assert.equal((await music.playlists.getTracks(123)).length, 0);
  assert.equal(calls.filter(call => call.name === "network.fetch").length, 1);
});

test("validates IDs and pagination before network access", async () => {
  const calls = [];
  const music = sdk([], calls);
  await assert.rejects(music.songs.get("1&x=2"), error => error.name === "TypeError");
  await assert.rejects(music.playlists.listByUser(1, { limit: -1 }),
    error => error.name === "RangeError");
  assert.equal(calls.length, 0);
});

test("rejects API and native failures with explicit error codes", async () => {
  const calls = [];
  const music = sdk([{ code: 403, message: "private" }], calls);
  await assert.rejects(music.playlists.get(1), error =>
    error.name === "EnhanceNCMError" && error.code === 403 &&
    error.path === "/api/v6/playlist/detail");

  const context = { URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout };
  vm.runInNewContext(source, context);
  await assert.rejects(context.EnhanceNCM.sdk.songs.get(1), error =>
    error.code === "BRIDGE_UNAVAILABLE");
});

test("independent page uses the native channel without the original frontend", async () => {
  const calls = [];
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    location: { href: "about:blank#enhancencm", assign(url) { calls.push({ navigate: url }); } },
    channel: {
      call(command, callback, args) {
        calls.push({ command, args });
        if (command === "network.aegisEncrypt")
          callback({ errorCode: 0, encryptedBody: "encrypted" });
        else callback({ code: 0, status: 200,
          blob: JSON.stringify({ code: 200, songs: [{ id: 186016, name: "Test" }] }) });
      },
    },
  };
  vm.runInNewContext(source, context);
  assert.equal(context.APP_CONF, undefined);
  assert.equal(context.legacyNativeCmder, undefined);
  assert.equal((await context.EnhanceNCM.sdk.songs.get(186016)).name, "Test");
  assert.equal(calls[0].command, "network.aegisEncrypt");
  assert.equal(calls[0].args.length, 1);
  assert.equal(calls[1].args[0].url,
    "https://interfacepc.music.163.com/xeapi/v3/song/detail");
  context.EnhanceNCM.ui.setMode("original");
  assert.deepEqual(calls[2], { navigate: "orpheus://orpheus/pub/app.html" });
});

test("UI shell mounts in an isolated root and disposes cleanly", async () => {
  const events = [];
  const body = { appendChild(element) { events.push("append"); element.parent = this; } };
  const document = {
    body,
    createElement() {
      return {
        attachShadow() { return { mode: "open" }; },
        remove() { events.push("remove"); },
      };
    },
  };
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    document,
    APP_CONF: { apiDomain: "https://interfacepc.music.163.com", deviceId: "test", appver: "3" },
    legacyNativeCmder: { call() {} },
  };
  vm.runInNewContext(source, context);
  const app = context.EnhanceNCM.app;
  const host = await app.mount(({ root, sdk }) => {
    assert.equal(root.mode, "open");
    assert.equal(sdk, context.EnhanceNCM.sdk);
    events.push("render");
    return () => events.push("dispose");
  });
  assert.equal(host.id, "enhancencm-ui-root");
  await assert.rejects(app.mount(() => {}), error => error.message.includes("already mounted"));
  app.unmount();
  assert.deepEqual(events, ["append", "render", "dispose", "remove"]);
});

test("display mode switch validates and persists the selected interface", () => {
  const values = new Map();
  const navigations = [];
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    location: { href: "orpheus://orpheus/pub/app.html",
      assign(url) { navigations.push(url); } },
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
    },
  };
  vm.runInNewContext(source, context);
  const ui = context.EnhanceNCM.ui;
  assert.equal(ui.getMode(), "original");
  ui.setMode("enhanced");
  assert.equal(ui.getMode(), "enhanced");
  assert.deepEqual(JSON.parse(values.get("enhancencm.settings.v1")),
    { version: 1, mode: "enhanced", themeId: "spotify" });
  assert.equal(values.get("enhancencm.restorePending.v1"), "1");
  assert.deepEqual(navigations, ["about:blank#enhancencm"]);
  assert.throws(() => ui.setMode("other"), error => error.name === "TypeError");
});

test("incomplete automatic restore falls back to the original interface", () => {
  const values = new Map([
    ["enhancencm.settings.v1", JSON.stringify({ version: 1, mode: "enhanced", themeId: "future-theme" })],
    ["enhancencm.restorePending.v1", "1"],
  ]);
  const navigations = [];
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    document: { readyState: "loading", addEventListener() {} },
    location: { href: "orpheus://orpheus/pub/app.html", assign(url) { navigations.push(url); } },
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, value); },
      removeItem(key) { values.delete(key); },
    },
  };
  vm.runInNewContext(source, context);
  const app = context.EnhanceNCM;
  app.app = { mount: () => Promise.resolve() };
  app.ui.start();
  assert.deepEqual(navigations, []);
  assert.equal(values.has("enhancencm.restorePending.v1"), false);
  assert.deepEqual(JSON.parse(values.get("enhancencm.settings.v1")),
    { version: 1, mode: "original", themeId: "future-theme" });
});

test("UI mount does not require the native network bridge", async () => {
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    document: {
      body: { appendChild() {} },
      createElement() {
        return { attachShadow() { return {}; }, remove() {} };
      },
    },
  };
  vm.runInNewContext(source, context);
  const host = await context.EnhanceNCM.app.mount(() => {});
  assert.equal(host.id, "enhancencm-ui-root");
  context.EnhanceNCM.app.unmount();
});

function playbackFixture(audio, autoLoad = true) {
  const calls = [];
  const events = new Map();
  const context = {
    URL, URLSearchParams, TextEncoder, btoa, setTimeout, clearTimeout,
    channel: {
      registerCall(name, callback) { events.set(name, callback); },
      call(name, callback, args) {
        calls.push({ name, args });
        if (name === "network.aegisEncrypt")
          return callback({ errorCode: 0, encryptedBody: "encrypted" });
        if (name === "network.fetch")
          return callback({ code: 0, status: 200, blob: JSON.stringify({ code: 200,
            data: audio === undefined ? [] : [audio] }) });
        callback();
        if (name === "audioplayer.load" && autoLoad && audio && audio.url)
          setTimeout(() => events.get("audioplayer.onLoad")?.(args[0], { code: 0, duration: 120 }), 0);
      },
    },
  };
  vm.runInNewContext(source, context);
  return { player: context.EnhanceNCM.sdk.playback, calls, events };
}

test("Native playback loads the authorized stream and controls the current play ID", async () => {
  const { player, calls, events } = playbackFixture({
    id: 186016, url: "https://example.music.163.com/audio", md5: "digest",
    size: 1024, br: 320000, time: 120000, level: "exhigh", type: "mp3",
  });
  const states = [];
  const unsubscribe = player.subscribe(state => states.push(state.status));
  const playing = await player.play(186016, { level: "exhigh" });
  const loaded = calls.find(call => call.name === "audioplayer.load");
  assert.equal(loaded.args[0], playing.playId);
  assert.equal(loaded.args[1].type, 4);
  assert.equal(loaded.args[1].songId, "186016");
  assert.equal(loaded.args[1].musicurl, "https://example.music.163.com/audio");
  assert.equal(loaded.args[1].bitrate, 320);
  assert.equal(loaded.args[1].songDuration, "120000");
  assert.equal(calls.find(call => call.name === "audioplayer.play").args[0], playing.playId);
  assert.equal(playing.duration, 120);
  events.get("audioplayer.onPlayProgress")("other", 20);
  events.get("audioplayer.onPlayProgress")(playing.playId, 15);
  assert.equal(player.getState().current, 15);
  await player.seek(30);
  assert.deepEqual(Array.from(calls.find(call => call.name === "audioplayer.seek").args).slice(0, 1), [playing.playId]);
  events.get("audioplayer.onSeek")(playing.playId, "seek-id", 0, 30);
  assert.equal(player.getState().current, 30);
  await player.pause();
  await player.resume();
  await player.setVolume(0.4);
  assert.deepEqual(Array.from(calls.find(call => call.name === "audioplayer.setVolume").args), ["", "", 0.4]);
  assert.equal(player.getState().volume, 0.4);
  await player.stop();
  assert.equal(player.getState().status, "idle");
  assert.equal(calls.find(call => call.name === "audioplayer.stop").args[0], playing.playId);
  unsubscribe();
  assert.ok(states.includes("playing") && states.includes("paused"));
});

test("Native playback refuses unavailable streams and invalid controls", async () => {
  const { player, calls } = playbackFixture({ id: 1, url: null });
  await assert.rejects(player.play(1), error => error.code === "PLAY_UNAVAILABLE");
  assert.equal(calls.some(call => call.name === "audioplayer.load"), false);
  await assert.rejects(player.play("1&bad"), error => error.name === "TypeError");
  await assert.rejects(player.resume(), error => error.code === "NO_PLAYBACK");
  await assert.rejects(player.setVolume(2), error => error.name === "RangeError");
  await assert.rejects(player.seek(-1), error => error.name === "RangeError");
});

test("resumed playback seeks on the new authorized stream before issuing play", async () => {
  const { player, calls } = playbackFixture({ id: 1, url: "https://example.com/audio.mp3", br: 128000, type: "mp3" });
  await player.play(1, { startPosition: 43 });
  const seek = calls.findIndex(call => call.name === "audioplayer.seek");
  const play = calls.findIndex(call => call.name === "audioplayer.play");
  assert.ok(seek >= 0 && seek < play);
  assert.equal(calls[seek].args[2], 43);
  await player.stop();
  await assert.rejects(player.play(1, { startPosition: -1 }), /startPosition/);
});

test("a failed Native load reports an error and releases the audio session", async () => {
  const { player, calls, events } = playbackFixture({ id: 1, url: "https://example.com/a" }, false);
  const playing = player.play(1);
  for (let i = 0; i < 10 && !calls.some(call => call.name === "audioplayer.load"); i++)
    await new Promise(resolve => setTimeout(resolve, 0));
  const loaded = calls.find(call => call.name === "audioplayer.load");
  events.get("audioplayer.onLoad")(loaded.args[0], { code: 403 });
  await assert.rejects(playing, error => error.code === "LOAD_FAILED");
  assert.equal(player.getState().status, "error");
  assert.equal(player.getState().playId, null);
  assert.equal(calls.some(call => call.name === "audioplayer.play"), false);
  assert.equal(calls.find(call => call.name === "audioplayer.stop").args[0], loaded.args[0]);
});

test("stopping a pending load cancels playback and ignores later load events", async () => {
  const { player, calls, events } = playbackFixture({ id: 1, url: "https://example.com/a" }, false);
  // The callback fires asynchronously; stop before the load response arrives.
  const playing = player.play(1);
  for (let i = 0; i < 10 && !calls.some(call => call.name === "audioplayer.load"); i++)
    await new Promise(resolve => setTimeout(resolve, 0));
  const loaded = calls.find(call => call.name === "audioplayer.load");
  await player.stop();
  await assert.rejects(playing, error => error.code === "CANCELLED");
  events.get("audioplayer.onLoad")(loaded.args[0], { code: 0, duration: 100 });
  assert.equal(player.getState().status, "idle");
  assert.equal(calls.some(call => call.name === "audioplayer.play"), false);
});
