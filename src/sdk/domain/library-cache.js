(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM, bridge = namespace._native;
  if (namespace._libraryCache) return;
  var table = "enhancencm_library_cache_v1";
  var init = null, serial = 0, writes = Promise.resolve();
  var memory = new Map(), flights = new Map(), epochs = new Map();
  var stats = { hits: 0, misses: 0, writes: 0, nativeTrackHits: 0, failures: 0 };
  function available() {
    // The original page owns its SQL event callback. Its SDK calls stay on the
    // network path; only the independent renderer installs our event mux.
    if (!(namespace._entry && namespace._entry.active) && root.location && root.location.href !== "about:blank#enhancencm") return false;
    return !!(root.channel && root.channel.call && root.channel.registerCall);
  }
  function quote(value) { return "'" + String(value).replace(/\0/g, "").replace(/'/g, "''") + "'"; }
  function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
  async function sql(query) {
    // Snapshot restore starts while the host is still initializing the window.
    // Native drops SQL submitted before storage.init completes on a cold start.
    if (namespace._startup) await namespace._startup.initializeStorage();
    return new Promise(function (resolve, reject) {
      var id = "enhancencm-cache-" + Date.now().toString(36) + "-" + (++serial);
      var timer, release = function () {};
      function finish(cause, rows) { clearTimeout(timer); release(); cause ? reject(cause) : resolve(rows || []); }
      try {
        release = bridge.subscribe("storage.onexecsqldone", function (requestId, code, rows) {
          if (requestId === id) finish(code === 0 ? null : new Error("Native cache SQL failed: " + code), rows);
        });
        timer = setTimeout(function () { finish(new Error("Native cache timed out")); }, 2500);
        // Like the original Database.execSql, completion comes from execsqldone.
        bridge.callArgs("storage.execsql", [id, query]).catch(finish);
      } catch (cause) { finish(cause); }
    });
  }
  function ready() {
    if (!init) init = sql("CREATE TABLE IF NOT EXISTS " + table + " (id TEXT PRIMARY KEY, jsonStr TEXT NOT NULL, updatedAt INTEGER NOT NULL);")
      .catch(function (cause) { init = null; throw cause; });
    return init;
  }
  function write(action) { var result = writes.then(action); writes = result.catch(function () { stats.failures++; }); return result; }
  async function load(owner, key, loader, options) {
    if (!owner || !available()) return loader();
    options = options || {};
    var epoch = epochs.get(owner) || 0, fullKey = owner + ":" + key;
    var token = fullKey + ":epoch:" + epoch;
    if (flights.has(token)) return copy(await flights.get(token));
    var job = (async function () {
      var entry = memory.get(fullKey), ttl = options.ttl || 300000;
      if (!entry && epoch === 0) {
        try {
          await ready();
          var rows = await sql("SELECT jsonStr,updatedAt FROM " + table + " WHERE id=" + quote(fullKey) + " LIMIT 1;");
          if (rows[0]) entry = { data: JSON.parse(rows[0].jsonStr), time: Number(rows[0].updatedAt) };
        } catch (_) { stats.failures++; }
      }
      if (entry && Date.now() - entry.time < ttl && Date.now() >= entry.time && epoch === (epochs.get(owner) || 0)) {
        stats.hits++; memory.set(fullKey, entry); return entry.data;
      }
      stats.misses++;
      var value = await loader();
      if (value !== undefined && epoch === (epochs.get(owner) || 0)) {
        entry = { data: copy(value), time: Date.now() };
        memory.set(fullKey, entry);
        if (memory.size > 200) memory.delete(memory.keys().next().value);
        await write(async function () {
          if (epoch !== (epochs.get(owner) || 0)) return;
          await ready();
          await sql("INSERT OR REPLACE INTO " + table + " (id,jsonStr,updatedAt) VALUES (" + quote(fullKey) + "," + quote(JSON.stringify(value)) + "," + entry.time + ");");
          stats.writes++;
          await sql("DELETE FROM " + table + " WHERE id IN (SELECT id FROM " + table +
            " WHERE id NOT LIKE 'snapshot:%' ORDER BY updatedAt DESC LIMIT -1 OFFSET 200);");
        }).catch(function () {});
      }
      return value;
    })();
    flights.set(token, job);
    try { return copy(await job); }
    finally { if (flights.get(token) === job) flights.delete(token); }
  }
  async function clear(owner) {
    if (!owner) return;
    epochs.set(owner, (epochs.get(owner) || 0) + 1);
    memory.forEach(function (_, key) { if (key.startsWith(owner + ":")) memory.delete(key); });
    if (!available()) return;
    await write(async function () {
      await ready();
      await sql("DELETE FROM " + table + " WHERE substr(id,1," + (owner.length + 1) + ")=" + quote(owner + ":") + ";");
    });
  }
  // Page snapshots are intentionally separate from the short-lived SDK response
  // cache. A stale snapshot remains usable while the account is revalidated.
  var snapshotAge = 7 * 24 * 60 * 60 * 1000;
  async function readSnapshot(owner, key) {
    if (!available() || !/^[1-9]\d*$/.test(String(owner)) || !key) return null;
    try {
      await ready();
      var rows = await sql("SELECT jsonStr,updatedAt FROM " + table + " WHERE id=" + quote("snapshot:" + owner + ":" + key) + " LIMIT 1;");
      if (!rows[0] || Date.now() - Number(rows[0].updatedAt) > snapshotAge) return null;
      return JSON.parse(rows[0].jsonStr);
    } catch (_) { stats.failures++; return null; }
  }
  async function saveSnapshot(owner, key, value) {
    if (!available() || !/^[1-9]\d*$/.test(String(owner)) || !key) return;
    await write(async function () {
      await ready();
      await sql("INSERT OR REPLACE INTO " + table + " (id,jsonStr,updatedAt) VALUES (" +
        quote("snapshot:" + owner + ":" + key) + "," + quote(JSON.stringify(value)) + "," + Date.now() + ");");
      await sql("DELETE FROM " + table + " WHERE id LIKE 'snapshot:%' AND updatedAt < " + (Date.now() - snapshotAge) + ";");
    });
  }
  async function lastAccount() {
    if (!available()) return null;
    try {
      await ready();
      var rows = await sql("SELECT jsonStr,updatedAt FROM " + table + " WHERE id='snapshot:last-account' LIMIT 1;");
      if (!rows[0] || Date.now() - Number(rows[0].updatedAt) > snapshotAge) return null;
      var account = JSON.parse(rows[0].jsonStr);
      return account && /^[1-9]\d*$/.test(String(account.userId)) ? account : null;
    } catch (_) { stats.failures++; return null; }
  }
  async function originalSnapshot() {
    if (!available()) return null;
    try {
      // Read only. The original frontend owns persistentModel and its writes.
      var rows = await sql("SELECT uniKey,jsonStr FROM persistentModel WHERE uniKey IN ('host','async:hostResource');");
      var values = new Map(rows.map(function (row) { return [row.uniKey, JSON.parse(row.jsonStr)]; }));
      var host = values.get("host"), resource = values.get("async:hostResource");
      var profile = host && host.data, data = resource && resource.data;
      var owner = String(profile && profile.uid);
      if (!/^[1-9]\d*$/.test(owner) || !data || !Array.isArray(data.createPlaylist) ||
        !Array.isArray(data.likeTrackIds) || !String(resource.vipChangeEvent || "").endsWith("," + owner) ||
        Number(host.clearTime) < Date.now() || Number(resource.clearTime) < Date.now()) return null;
      var created = data.createPlaylist.filter(function (item) { return item && Number(item.specialType) !== 5; });
      return { account: { userId: owner, nickname: profile.nickName || "" },
        created: { items: created, offset: data.createPlaylist.length, more: false },
        likedIds: data.likeTrackIds.map(String) };
    } catch (_) { return null; }
  }
  async function rememberAccount(account) {
    var owner = String(account && account.userId);
    if (!/^[1-9]\d*$/.test(owner)) return;
    if (!available()) return;
    await write(async function () {
      await ready();
      await sql("INSERT OR REPLACE INTO " + table + " (id,jsonStr,updatedAt) VALUES ('snapshot:last-account'," +
        quote(JSON.stringify({ userId: owner, nickname: account.profile && account.profile.nickname || "" })) + "," + Date.now() + ");");
    });
  }
  async function forgetAccount(owner) {
    if (!available()) return;
    await write(async function () {
      await ready();
      var current = await lastAccount();
      if (current && String(current.userId) === String(owner))
        await sql("DELETE FROM " + table + " WHERE id='snapshot:last-account';");
    });
  }
  async function readTracks(refs) {
    if (!available() || !refs.length) return [];
    // dbTrack is owned by the original client. Read its normalized metadata;
    // leave its schema, versions, privilege data and writes to that client.
    try {
      var ids = refs.map(function (ref) { return String(ref.id); });
      if (ids.some(function (id) { return !/^[1-9]\d*$/.test(id); })) return [];
      var rows = await sql("SELECT jsonStr FROM dbTrack WHERE id IN (" + ids.map(quote).join(",") + ");");
      var versions = new Map(refs.map(function (ref) { return [String(ref.id), ref.v]; }));
      var songs = rows.map(function (row) { try { return JSON.parse(row.jsonStr); } catch (_) { return null; } })
        .filter(function (song) { return song && song.name && versions.has(String(song.id)) &&
          Number.isFinite(versions.get(String(song.id))) && Number(song.version) === versions.get(String(song.id)); })
        .map(function (song) { return { id: song.id, name: song.name, ar: song.artists || [], al: song.album || {}, dt: song.duration || 0 }; });
      stats.nativeTrackHits += songs.length;
      return songs;
    } catch (_) { stats.failures++; return []; }
  }
  var sessionInit = null;
  function sessionOwner(owner) { return /^(guest|[1-9]\d*)$/.test(String(owner)); }
  function sessionReady() {
    if (!available()) return Promise.reject(new Error("Native session storage is unavailable"));
    if (!sessionInit) sessionInit = sql("CREATE TABLE IF NOT EXISTS enhancencm_player_session_v1 (owner TEXT PRIMARY KEY, jsonStr TEXT NOT NULL, updatedAt INTEGER NOT NULL);")
      .catch(function (cause) { sessionInit = null; throw cause; });
    return sessionInit;
  }
  async function readSession(owner) {
    if (!sessionOwner(owner)) throw new TypeError("invalid session owner");
    await sessionReady();
    var rows = await sql("SELECT jsonStr FROM enhancencm_player_session_v1 WHERE owner=" + quote(owner) + " LIMIT 1;");
    if (!rows[0]) return null;
    try { return JSON.parse(rows[0].jsonStr); } catch (_) { return null; }
  }
  function saveSession(owner, value) {
    if (!sessionOwner(owner)) return Promise.reject(new TypeError("invalid session owner"));
    var json = JSON.stringify(value);
    if (json.length > 8 * 1024 * 1024) return Promise.reject(new Error("Playback session is too large"));
    return write(async function () {
      await sessionReady();
      await sql("INSERT OR REPLACE INTO enhancencm_player_session_v1 (owner,jsonStr,updatedAt) VALUES (" + quote(owner) + "," + quote(json) + "," + Date.now() + ");");
    });
  }
  Object.defineProperty(namespace, "_libraryCache", { value: Object.freeze({ load: load, clear: clear,
    sessions: Object.freeze({ read: readSession, save: saveSession }),
    snapshot: Object.freeze({ read: readSnapshot, save: saveSnapshot, lastAccount: lastAccount,
      original: originalSnapshot,
      rememberAccount: rememberAccount, forgetAccount: forgetAccount }),
    readTracks: readTracks, getState: function () { return Object.freeze(Object.assign({}, stats)); } }) });
})(globalThis);
