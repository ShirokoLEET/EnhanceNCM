(function (root) {
  "use strict";

  var namespace = root.EnhanceNCM;
  if (namespace.app) return;
  var host = null;
  var dispose = null;
  var mounting = false;
  var generation = 0;
  var unmounting = null;
  var mountingCompletion = null;

  function bridgeReady() {
    return root.document && root.document.body && namespace._native.ready();
  }

  function whenReady(timeoutMs) {
    timeoutMs = timeoutMs === undefined ? 10000 : timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0)
      return Promise.reject(new RangeError("timeoutMs must be a non-negative integer"));
    return new Promise(function (resolve, reject) {
      var deadline = Date.now() + timeoutMs;
      function check() {
        if (bridgeReady()) return resolve(namespace.sdk);
        if (Date.now() >= deadline)
          return reject(new Error("EnhanceNCM desktop bridge is not ready"));
        setTimeout(check, 50);
      }
      check();
    });
  }

  async function mount(renderer) {
    if (typeof renderer !== "function") throw new TypeError("renderer must be a function");
    if (unmounting) await unmounting;
    if (host || mounting) throw new Error("EnhanceNCM UI is already mounted");
    mounting = true;
    var current = ++generation;
    var completeMount;
    var completion = new Promise(function (resolve) { completeMount = resolve; });
    mountingCompletion = completion;
    try {
      // The UI switcher must remain available even if native networking is late.
      if (!root.document || !root.document.body)
        throw new Error("EnhanceNCM document body is not ready");
      if (current !== generation) return null;
      var element = root.document.createElement("div");
      element.id = "enhancencm-ui-root";
      var shadow = element.attachShadow({ mode: "open" });
      root.document.body.appendChild(element);
      host = element;
      var cleanup = await renderer({ root: shadow, sdk: namespace.sdk });
      if (current !== generation) {
        if (typeof cleanup === "function") await cleanup();
        element.remove();
        return null;
      }
      if (typeof cleanup === "function") dispose = cleanup;
      return element;
    } catch (error) {
      if (host && current === generation) host.remove();
      if (current === generation) host = null;
      throw error;
    } finally {
      if (current === generation) mounting = false;
      if (mountingCompletion === completion) mountingCompletion = null;
      completeMount();
    }
  }

  function unmount() {
    if (unmounting) return unmounting;
    if (namespace._localFiles) namespace._localFiles.dispose();
    ++generation;
    mounting = false;
    var cleanup = dispose;
    dispose = null;
    var element = host;
    host = null;
    var pendingMount = mountingCompletion;
    try {
      var result = cleanup ? cleanup() : null;
      if (pendingMount || (result && typeof result.then === "function")) {
        unmounting = Promise.all([result, pendingMount]).finally(function () {
          if (element) element.remove();
          unmounting = null;
        });
        return unmounting;
      }
      if (element) element.remove();
      return Promise.resolve();
    } catch (cause) {
      if (element) element.remove();
      return Promise.reject(cause);
    }
  }

  namespace.app = Object.freeze({ isStandalone: function () { return !!(namespace._entry && namespace._entry.active) || !!(root.location && root.location.href === "about:blank#enhancencm"); }, whenReady: whenReady, mount: mount, unmount: unmount });
})(globalThis);
