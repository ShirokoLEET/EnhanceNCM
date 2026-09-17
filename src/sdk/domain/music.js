(function (root) {
  "use strict";

  var namespace = root.EnhanceNCM;
  if (namespace.sdk) return;
  var send = namespace._transport.request;
  var cache = namespace._libraryCache, cacheOwner = null;
  function cached(key, loader) { return cache.load(cacheOwner, key, loader); }

  function id(value, name) {
    if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0)
      return String(value);
    throw new TypeError(name + " must be a positive integer ID (number or string)");
  }

  function integer(value, name, fallback, maximum) {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < 0 || value > maximum)
      throw new RangeError(name + " must be an integer between 0 and " + maximum);
    return value;
  }

  function positiveInteger(value, name, fallback, maximum) {
    var result = integer(value, name, fallback, maximum);
    if (result < 1) throw new RangeError(name + " must be a positive integer");
    return result;
  }

  function ids(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 1000)
      throw new RangeError("ids must contain 1 to 1000 song IDs");
    return values.map(function (value) { return id(value, "song ID"); });
  }

  async function songsGetMany(values) {
    var normalized = ids(values);
    var response = await send("/api/v3/song/detail", {
      c: "[" + normalized.map(function (value) { return '{"id":' + value + "}"; }).join(",") + "]"
    });
    return response.songs || [];
  }

  async function songsSearch(keyword, options) {
    if (typeof keyword !== "string" || !keyword.trim() || keyword.trim().length > 200)
      throw new TypeError("keyword must be a nonempty string of at most 200 characters");
    options = options || {};
    var limit = positiveInteger(options.limit, "limit", 30, 100);
    var offset = integer(options.offset, "offset", 0, Number.MAX_SAFE_INTEGER);
    var needCorrect = options.needCorrect === undefined ? true : options.needCorrect;
    if (typeof needCorrect !== "boolean") throw new TypeError("needCorrect must be a boolean");
    var response = await send("/api/search/song/list/page", {
      keyword: keyword.trim(), scene: "normal", limit: limit,
      offset: offset, needCorrect: needCorrect
    });
    var data = response.data || {};
    return {
      items: (data.resources || []).map(function (resource) {
        var song = resource.baseInfo && resource.baseInfo.simpleSongData ||
          { id: resource.resourceId };
        return Object.assign({}, song, {
          lyrics: resource.extInfo && resource.extInfo.lyrics || null,
          alg: resource.alg
        });
      }),
      total: Number(data.totalCount) || 0,
      more: !!data.hasMore,
      queryRewrite: data.queryRewrite || null
    };
  }

  async function songsGetLyrics(value) {
    if (namespace._localMusic.isLocal(value)) return namespace._localMusic.getLyrics(value);
    var songId = id(value, "song ID");
    var response = await send("/api/song/lyric/v1", {
      id: songId, lv: -1, tv: -1, rv: -1, yv: -1
    });
    return namespace._lyrics.parse(response);
  }

  async function playlistGet(value) {
    var playlistId = id(value, "playlist ID");
    return cached("playlist:" + playlistId, async function () {
      var response = await send("/api/v6/playlist/detail", { id: playlistId, n: 100000, s: 8 });
      return response.playlist;
    });
  }

  function accountError() {
    var error = new Error("no current music account is signed in");
    error.name = "EnhanceNCMError";
    error.code = "LOGIN_REQUIRED";
    return error;
  }

  async function accountGetCurrent() {
    var response;
    try { response = await send("/api/w/nuser/account/get", {}); }
    catch (cause) { cacheOwner = null; throw cause; }
    var profile = response.profile || null;
    var account = response.account || null;
    var userId = profile && profile.userId || account && account.id;
    if (!userId) { cacheOwner = null; throw accountError(); }
    cacheOwner = id(userId, "current user ID");
    return { userId: id(userId, "current user ID"), profile: profile, account: account };
  }

  async function playlistListByUser(uid, options) {
    options = options || {};
    var data = {
      uid: id(uid, "user ID"),
      limit: integer(options.limit, "limit", 30, 1000),
      offset: integer(options.offset, "offset", 0, Number.MAX_SAFE_INTEGER),
      includeVideo: true
    };
    return cached("user-playlists:" + JSON.stringify(data), async function () {
      var response = await send("/api/user/playlist", data);
      return { items: response.playlist || [], more: !!response.more };
    });
  }

  function isCreated(playlist, userId) {
    return playlist && playlist.creator &&
      String(playlist.creator.userId) === userId && playlist.subscribed !== true;
  }

  async function playlistListFiltered(options, include) {
    options = options || {};
    var limit = integer(options.limit, "limit", 30, 1000);
    var offset = integer(options.offset, "offset", 0, Number.MAX_SAFE_INTEGER);
    var userId = (await accountGetCurrent()).userId;
    var matched = [];
    var sourceOffset = 0;
    var more = true;
    // The source mixes created and subscribed playlists. Scan it so offset/more
    // refer to the filtered list rather than a single source page.
    while (more && matched.length <= offset + limit) {
      var page = await playlistListByUser(userId, { limit: 100, offset: sourceOffset });
      if (!page.items.length && page.more) throw new Error("playlist pagination did not advance");
      page.items.forEach(function (item) { if (include(item, userId)) matched.push(item); });
      sourceOffset += page.items.length;
      more = page.more;
    }
    return { items: matched.slice(offset, offset + limit), more: matched.length > offset + limit };
  }

  function playlistListCreated(options) {
    return playlistListFiltered(options, isCreated);
  }

  function playlistListSubscribed(options) {
    return playlistListFiltered(options, function (playlist) {
      return playlist && playlist.subscribed === true;
    });
  }

  function playlistOwnershipError() {
    var error = new Error("the target playlist is not created by the current account");
    error.name = "EnhanceNCMError";
    error.code = "PLAYLIST_NOT_OWNED";
    return error;
  }

  async function playlistManipulateTrack(playlistValue, songValue, operation) {
    var playlistId = id(playlistValue, "playlist ID");
    var songId = id(songValue, "song ID");
    var userId = (await accountGetCurrent()).userId;
    var playlist = await playlistGet(playlistId);
    if (!isCreated(playlist, userId)) throw playlistOwnershipError();
    var result = await send("/api/v1/playlist/manipulate/tracks", {
      trackIds: "[" + songId + "]", pid: playlistId, op: operation
    });
    await cache.clear(userId).catch(function () {});
    return result;
  }

  function playlistAddTrack(playlistValue, songValue) {
    return playlistManipulateTrack(playlistValue, songValue, "add");
  }

  function playlistRemoveTrack(playlistValue, songValue) {
    return playlistManipulateTrack(playlistValue, songValue, "del");
  }

  async function playlistGetLiked() {
    var userId = (await accountGetCurrent()).userId;
    var offset = 0;
    var more = true;
    while (more) {
      var page = await playlistListByUser(userId, { limit: 100, offset: offset });
      var liked = page.items.find(function (item) {
        return isCreated(item, userId) && Number(item.specialType) === 5;
      });
      if (liked) return liked;
      if (!page.items.length && page.more) throw new Error("playlist pagination did not advance");
      offset += page.items.length;
      more = page.more;
    }
    return null;
  }

  async function playlistGetLikedTracks(options) {
    options = options || {};
    integer(options.limit, "limit", 500, 1000);
    integer(options.offset, "offset", 0, Number.MAX_SAFE_INTEGER);
    var liked = await playlistGetLiked();
    return liked ? playlistGetTracks(liked.id, options) : [];
  }

  async function songsGetLikedIds() {
    var liked = await playlistGetLiked();
    if (!liked) return [];
    var playlist = await playlistGet(liked.id);
    return (playlist && playlist.trackIds || []).map(function (track) {
      return id(track.id, "track ID");
    });
  }

  async function songsSetLiked(value, liked) {
    var trackId = id(value, "song ID");
    if (typeof liked !== "boolean") throw new TypeError("liked must be a boolean");
    var userId = (await accountGetCurrent()).userId;
    var result = await send("/api/song/like", { trackId: trackId, userid: userId, like: liked });
    await cache.clear(userId).catch(function () {});
    return result;
  }

  async function playlistGetTracks(value, options) {
    options = options || {};
    var owner = cacheOwner;
    var limit = integer(options.limit, "limit", 500, 1000);
    var offset = integer(options.offset, "offset", 0, Number.MAX_SAFE_INTEGER);
    var playlist = await playlistGet(value);
    var refs = (playlist && playlist.trackIds || []).slice(offset, offset + limit);
    var trackIds = refs.map(function (track) { return id(track.id, "track ID"); });
    if (!trackIds.length) return [];
    return cache.load(owner, "tracks:" + id(value, "playlist ID") + ":" + JSON.stringify(refs), async function () {
      var songs = await cache.readTracks(refs);
      var byId = new Map(songs.map(function (song) { return [String(song.id), song]; }));
      var missing = trackIds.filter(function (trackId) { return !byId.has(trackId); });
      if (missing.length) (await songsGetMany(missing)).forEach(function (song) { byId.set(String(song.id), song); });
      return trackIds.map(function (trackId) { return byId.get(trackId); }).filter(function (song) { return song !== undefined; });
    });
  }

  async function recommendationsGetDailySongs(options) {
    options = options || {};
    var version = options.version === undefined ? 3 : options.version;
    if (version !== 1 && version !== 3) throw new TypeError("version must be 1 or 3");
    var limit = positiveInteger(options.limit, "limit", 30, 1000);
    await accountGetCurrent();
    var response = await send(version === 3 ? "/api/v3/discovery/recommend/songs" :
      "/api/v1/discovery/recommend/songs", { limit: limit });
    return version === 3 ? response.data && response.data.dailySongs || [] : response.recommend || [];
  }

  async function recommendationsGetRecommendedPlaylists() {
    var response = await send("/api/homepage/block/page", {
      cursor: JSON.stringify({ offset: 0, blockCodeOrderList: ["HOMEPAGE_BLOCK_PLAYLIST_RCMD"] }),
      extInfo: JSON.stringify({ abInfo: { "hp-new-homepageV3.1": "t3" } }),
      newStyle: true
    });
    var blocks = response.data && response.data.blocks || [];
    var block = blocks.find(function (item) { return item.blockCode === "HOMEPAGE_BLOCK_PLAYLIST_RCMD"; });
    return (block && block.creatives || []).map(function (creative) {
      var resource = creative.resources && creative.resources[0];
      if (!resource || !resource.resourceId) return null;
      var ui = creative.uiElement || {};
      return {
        id: resource.resourceId,
        name: ui.mainTitle && ui.mainTitle.title,
        coverImgUrl: ui.image && ui.image.imageUrl,
        playCount: resource.resourceExtInfo && resource.resourceExtInfo.playCount,
        alg: creative.alg
      };
    }).filter(Boolean);
  }

  async function recommendationsGetPrivateRadar() {
    await accountGetCurrent();
    var response = await send("/api/pc/customize/block/page", { newStyle: true });
    var blocks = response.data && response.data.blocks || [];
    var block = blocks.find(function (item) { return item.code === "CUSTOMIZE_PLAYLIST_MGC"; });
    var creative = block && (block.creatives || []).find(function (item) {
      var resource = item.resources && item.resources[0];
      return resource && resource.resourceType === "playlist" && resource.resourceId;
    });
    return creative ? playlistGet(creative.resources[0].resourceId) : null;
  }

  async function recommendationsGetPrivateRoaming(options) {
    options = options || {};
    var imageFm = positiveInteger(options.imageFm, "imageFm", 1, 1000);
    var data = { imageFm: imageFm };
    if (options.mode !== undefined) {
      if (typeof options.mode !== "string" || !/^[a-zA-Z0-9_-]+$/.test(options.mode))
        throw new TypeError("mode must be a nonempty mode name");
      data.mode = options.mode;
    }
    if (options.sourceIds !== undefined) {
      if (!Array.isArray(options.sourceIds) || !options.sourceIds.length)
        throw new TypeError("sourceIds must be a nonempty array of song IDs");
      data.sourceIds = ids(options.sourceIds).join(",");
    }
    await accountGetCurrent();
    var response = await send("/api/v1/radio/get", data);
    return response.data || [];
  }

  async function recommendationsGetHeartMode(options) {
    options = options || {};
    var playlistId = options.playlistId === undefined ? null : id(options.playlistId, "playlist ID");
    var songId = options.songId === undefined ? null : id(options.songId, "song ID");
    var startMusicId = options.startMusicId === undefined ? null : id(options.startMusicId, "start song ID");
    var count = options.count === undefined ? null : positiveInteger(options.count, "count", 1, 100000);
    var type = options.type === undefined ? "fromPlayOne" : options.type;
    if (type !== "fromPlayOne" && type !== "fromPlayAll")
      throw new TypeError("type must be fromPlayOne or fromPlayAll");
    if (!playlistId) {
      var liked = await playlistGetLiked();
      if (!liked) return [];
      playlistId = id(liked.id, "playlist ID");
    } else await accountGetCurrent();
    if (!songId || !count) {
      var playlist = await playlistGet(playlistId);
      var trackIds = playlist && playlist.trackIds || [];
      if (!trackIds.length && !songId) return [];
      if (!songId) songId = id(trackIds[0].id, "song ID");
      if (!count) count = Math.max(1, trackIds.length);
    }
    var response = await send("/api/playmode/intelligence/list", {
      playlistId: playlistId, songId: songId, type: type,
      startMusicId: startMusicId || songId, count: count
    });
    var items = response.data || [];
    var missing = items.filter(function (item) { return !item.songInfo && item.id; })
      .map(function (item) { return id(item.id, "song ID"); });
    var details = [];
    for (var offset = 0; offset < missing.length; offset += 1000)
      details.push.apply(details, await songsGetMany(missing.slice(offset, offset + 1000)));
    var byId = new Map(details.map(function (song) { return [String(song.id), song]; }));
    return items.map(function (item) {
      return Object.assign({}, item.songInfo || byId.get(String(item.id)) || { id: item.id },
        { alg: item.alg, recommended: item.recommended });
    });
  }

  namespace.sdk = Object.freeze({
    account: Object.freeze({ getCurrent: accountGetCurrent }),
    songs: Object.freeze({
      get: async function (value) { return (await songsGetMany([value]))[0] || null; },
      getMany: songsGetMany,
      search: songsSearch,
      getLyrics: songsGetLyrics,
      listLiked: playlistGetLikedTracks,
      getLikedIds: songsGetLikedIds,
      setLiked: songsSetLiked,
      like: function (value) { return songsSetLiked(value, true); },
      unlike: function (value) { return songsSetLiked(value, false); },
      getUrl: async function (value, level) {
        var songId = id(value, "song ID");
        level = level === undefined ? "standard" : level;
        if (!/^(standard|exhigh|lossless|hires|jyeffect|vivid|jymaster|sky)$/.test(level))
          throw new TypeError("unsupported audio level");
        var response = await send("/api/song/enhance/player/url/v1", {
          ids: "[" + songId + "]", level: level, encodeType: "flac"
        });
        return (response.data || [])[0] || null;
      }
    }),
    localMusic: namespace._localMusic,
    playback: namespace._playback,
    audioCache: Object.freeze({ getState: namespace._audioSource.getState, clearMemory: namespace._audioSource.clearMemory }),
    player: namespace._player,
    persistence: namespace._playerPersistence,
    settings: Object.freeze({
      getPlayback: namespace._settings.playback,
      setPlayback: namespace._settings.updatePlayback,
      getNowPlaying: namespace._settings.nowPlaying,
      setNowPlaying: namespace._settings.updateNowPlaying
    }),
    librarySnapshots: namespace._libraryCache.snapshot,
    coverColors: namespace._coverColors,
    presentation: namespace._presentation,
    window: namespace._shell.window,
    artwork: namespace._shell.artwork,
    systemMedia: namespace._shell.systemMedia,
    cache: Object.freeze({ getState: cache.getState, refresh: async function () {
      var owner = (await accountGetCurrent()).userId;
      await cache.clear(owner);
    } }),
    playlists: Object.freeze({
      get: playlistGet,
      listByUser: playlistListByUser,
      listCreated: playlistListCreated,
      listSubscribed: playlistListSubscribed,
      addTrack: playlistAddTrack,
      removeTrack: playlistRemoveTrack,
      getLiked: playlistGetLiked,
      getLikedTracks: playlistGetLikedTracks,
      getTracks: playlistGetTracks
    }),
    recommendations: Object.freeze({
      getDailySongs: recommendationsGetDailySongs,
      getRecommendedPlaylists: recommendationsGetRecommendedPlaylists,
      getPrivateRadar: recommendationsGetPrivateRadar,
      getPrivateRoaming: recommendationsGetPrivateRoaming,
      getHeartMode: recommendationsGetHeartMode
    })
  });
  namespace.sdkVersion = 14;
})(globalThis);
