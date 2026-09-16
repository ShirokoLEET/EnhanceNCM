// Account fixtures for the local UI preview; no real account requests.
(function (root) {
  "use strict";
  var sdk = root.EnhanceNCM.sdk;
  var flags = new URLSearchParams(root.location.search);
  var calls = [];
  root.previewLibrary = { calls: calls, signedOut: flags.has("signedout"), failLike: false, failLikedIds: flags.has("likedidserror") };
  var sample = [
    { id: 3, name: "海岸线", ar: [{ name: "岛屿来信" }], al: { name: "海的另一边", picUrl: root.location.origin + "/cover/2.svg" }, dt: 202000 },
    { id: 5, name: "在路上", ar: [{ name: "林间" }], al: { name: "山与远方", picUrl: root.location.origin + "/cover/4.svg" }, dt: 224000 },
    { id: 7, name: "风经过的地方", ar: [{ name: "南方来客" }], al: { name: "Blue Hour", picUrl: root.location.origin + "/cover/0.svg" }, dt: 246000 }
  ];
  var liked = flags.has("manyliked") ? Array.from({ length: 503 }, function (_, index) {
    return Object.assign({}, sample[index % 3], { id: 1001 + index, name: "喜欢的旋律 " + (index + 1) });
  }) : sample;
  if (flags.has("emptyliked")) liked = [];
  var likedMeta = { id: 900, name: "我喜欢的音乐", specialType: 5, trackCount: liked.length, creator: { userId: "42" } };
  var created = flags.has("emptycreated") ? [] : Array.from({ length: flags.has("manycreated") ? 32 : 2 }, function (_, index) {
    return { id: 501 + index, name: index === 0 ? "清晨出发" : index === 1 ? "夜晚的耳机" : "自建歌单 " + (index + 1), trackCount: 3, coverImgUrl: root.location.origin + "/cover/" + index % 6 + ".svg", creator: { userId: "42" } };
  });
  var subscribed = flags.has("emptysubscribed") ? [] : Array.from({ length: flags.has("manysubscribed") ? 32 : 2 }, function (_, index) {
    return { id: 801 + index, name: index === 0 ? "雨天书房" : index === 1 ? "周末漫步" : "收藏歌单 " + (index + 1), trackCount: 3, coverImgUrl: root.location.origin + "/cover/" + (index + 2) % 6 + ".svg", creator: { userId: "99" }, subscribed: true };
  });
  function signedIn() {
    if (root.previewLibrary.signedOut) { var error = new Error("signed out"); error.code = "LOGIN_REQUIRED"; throw error; }
  }
  sdk.account = { getCurrent: async function () {
    calls.push({ name: "getCurrent" }); signedIn();
    return { userId: "42", profile: { nickname: "音乐漫游者" } };
  } };
  sdk.playlists.listCreated = async function (options) {
    calls.push({ name: "listCreated", options: options }); signedIn();
    if (flags.has("libraryerror")) throw new Error("preview library failed");
    var source = [likedMeta].concat(created);
    return { items: source.slice(options.offset, options.offset + options.limit), more: source.length > options.offset + options.limit };
  };
  sdk.playlists.listSubscribed = async function (options) {
    calls.push({ name: "listSubscribed", options: options }); signedIn();
    if (flags.has("subscribederror")) throw new Error("preview subscribed playlists failed");
    return { items: subscribed.slice(options.offset, options.offset + options.limit), more: subscribed.length > options.offset + options.limit };
  };
  sdk.playlists.getLiked = async function () {
    calls.push({ name: "getLiked" }); signedIn();
    return flags.has("noliked") ? null : likedMeta;
  };
  sdk.songs.listLiked = async function (options) {
    calls.push({ name: "listLiked", options: options }); signedIn();
    if (flags.has("likederror")) throw new Error("preview liked songs failed");
    return liked.slice(options.offset, options.offset + options.limit).filter(function (song) { return !flags.has("sparse") || song.id !== 1050; });
  };
  sdk.songs.getLikedIds = async function () {
    calls.push({ name: "getLikedIds" }); signedIn();
    if (root.previewLibrary.failLikedIds) throw new Error("preview liked IDs failed");
    return flags.has("noliked") ? [] : liked.map(function (song) { return String(song.id); });
  };
  sdk.songs.setLiked = async function (id, value) {
    calls.push({ name: "setLiked", id: String(id), liked: value }); signedIn();
    if (root.previewLibrary.failLike) throw new Error("preview like failed");
    var index = liked.findIndex(function (song) { return String(song.id) === String(id); });
    if (value && index < 0) {
      var song = tracks.find(function (item) { return String(item.id) === String(id); });
      if (song) liked.unshift(song);
    } else if (!value && index >= 0) liked.splice(index, 1);
    likedMeta.trackCount = liked.length;
    return { code: 200 };
  };
  sdk.songs.getLyrics = async function (id) {
    calls.push({ name: "getLyrics", id: String(id) });
    if (flags.has("lyricerror")) throw new Error("preview lyric failed");
    if (flags.has("nolyrics")) return { lines: [], synced: false };
    return { synced: true, lines: [
      { time: 0, text: "街灯刚刚亮起" },
      { time: 8, text: "耳边响起熟悉的旋律" },
      { time: 16, text: "沿着夜色慢慢走" },
      { time: 24, text: "让这一刻停留", translation: "Stay a little longer" },
      { time: 32, text: "风经过的地方" },
      { time: 40, text: "还有未说完的话" }
    ] };
  };
  var get = sdk.playlists.get;
  var getTracks = sdk.playlists.getTracks;
  sdk.playlists.get = async function (id) { return created.concat(subscribed).find(function (item) { return String(item.id) === String(id); }) || get(id); };
  sdk.playlists.getTracks = async function (id, options) {
    calls.push({ name: "getTracks", id: id, options: options });
    return created.concat(subscribed).some(function (item) { return String(item.id) === String(id); }) ? sample.slice().reverse() : getTracks(id, options);
  };
  var batches = { roaming: 0, heartmode: 0 };
  root.previewLibrary.failRecommendations = flags.has("recommendationerror");
  sdk.cache = { refresh: async function () { calls.push({ name: "refreshCache" }); } };
  function recommend(kind) {
    signedIn();
    if (root.previewLibrary.failRecommendations) throw new Error("preview recommendation failed");
    if (flags.has("emptyrecommendations")) return [];
    var offset = batches[kind] === undefined ? 0 : batches[kind]++ * 3;
    return sample.map(function (song, i) { return Object.assign({}, song, { id: 7001 + offset + i, name: kind + " 推荐 " + (offset + i + 1) }); });
  }
  sdk.recommendations = {
    getRecommendedPlaylists: async function () {
      calls.push({ name: "getRecommendedPlaylists" });
      if (flags.has("homeerror")) throw new Error("preview homepage recommendations failed");
      if (flags.has("emptyrecommendations")) return [];
      return Array.from({ length: 6 }, function (_, index) {
        return { id: 601 + index, name: "推荐歌单 " + (index + 1),
          coverImgUrl: root.location.origin + "/cover/" + index + ".svg", playCount: 10000 + index };
      });
    },
    getDailySongs: async function () { calls.push({ name: "getDailySongs" }); return recommend("daily"); },
    getPrivateRadar: async function () { calls.push({ name: "getPrivateRadar" }); recommend("radar"); return flags.has("emptyrecommendations") ? null : created[0]; },
    getPrivateRoaming: async function () { calls.push({ name: "getPrivateRoaming" }); return recommend("roaming"); },
    getHeartMode: async function (options) { calls.push({ name: "getHeartMode", options: options }); return recommend("heartmode"); }
  };
})(globalThis);
