(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM || (root.EnhanceNCM = {});
  var key = "enhancencm.nativeStartup.v1", storageReady = null;
  function valid(value) {
    return value && typeof value.downloadDir === "string" && typeof value.cacheDir === "string" &&
      value.downloadDir.length < 32768 && value.cacheDir.length < 32768 &&
      !/[\0]/.test(value.downloadDir + value.cacheDir) &&
      Number.isFinite(Number(value.capacity)) && Number(value.capacity) > 0;
  }
  function read() {
    try {
      var saved = JSON.parse(root.localStorage.getItem(key));
      return saved && saved.version === 1 && valid(saved.storage) ? saved.storage : null;
    } catch (_) { return null; }
  }
  function observeOriginal() {
    // Capture only the original client's storage configuration, never music
    // data or credentials. Detach as soon as its one-time init is dispatched.
    var attempts = 0, timer = root.setInterval(function () {
      if (!root.channel || typeof root.channel.call !== "function") {
        if (++attempts >= 200) root.clearInterval(timer);
        return;
      }
      root.clearInterval(timer);
      var channel = root.channel, original = channel.call;
      var expiry;
      function detach() {
        if (channel.call === wrapped) channel.call = original;
        root.clearTimeout(expiry);
      }
      function wrapped(name, callback, args) {
        if (name === "storage.init" && Array.isArray(args)) {
          var storage = { downloadDir: args[0], capacity: String(args[1]), cacheDir: args[2] };
          if (valid(storage)) {
            try { root.localStorage.setItem(key, JSON.stringify({ version: 1, storage: storage })); } catch (_) {}
          }
          detach();
        }
        return original.apply(this, arguments);
      }
      channel.call = wrapped;
      expiry = root.setTimeout(detach, 15000);
    }, 0);
  }
  function initializeStorage() {
    if (!(namespace._entry && namespace._entry.active)) return Promise.resolve();
    if (!storageReady) {
      var config = namespace._entry.storage;
      if (!valid(config)) return Promise.reject(new Error("Native storage configuration is unavailable"));
      var timeout;
      storageReady = Promise.race([
        namespace._native.callArgs("storage.init", [config.downloadDir, String(config.capacity), config.cacheDir]),
        new Promise(function (_, reject) { timeout = root.setTimeout(function () { reject(new Error("Native storage initialization timed out")); }, 5000); })
      ]).finally(function () { root.clearTimeout(timeout); })
        .catch(function (error) { storageReady = null; throw error; });
    }
    return storageReady;
  }
  namespace._startup = Object.freeze({ read: read, observeOriginal: observeOriginal, initializeStorage: initializeStorage });
})(globalThis);
