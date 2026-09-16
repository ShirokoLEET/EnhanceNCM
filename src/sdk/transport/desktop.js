(function (root) {
  "use strict";

  var namespace = root.EnhanceNCM || (root.EnhanceNCM = {});
  if (namespace._transport) return;

  function sdkError(message, code, path) {
    var error = new Error(message);
    error.name = "EnhanceNCMError";
    error.code = code;
    if (path) error.path = path;
    return error;
  }

  function form(data) {
    var params = new URLSearchParams();
    Object.keys(data).forEach(function (key) {
      var value = data[key];
      if (value !== undefined && value !== null) params.append(key, String(value));
    });
    return params.toString();
  }

  function base64Utf8(value) {
    var bytes = new TextEncoder().encode(value);
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function withTimeout(promise, label) {
    var timer;
    return Promise.race([
      promise,
      new Promise(function (_, reject) {
        timer = setTimeout(function () {
          reject(sdkError(label + " timed out", "TIMEOUT"));
        }, 60000);
      })
    ]).finally(function () { clearTimeout(timer); });
  }

  var networkReady = null;
  function initializeNetwork() {
    if (!(namespace._entry && namespace._entry.active)) return Promise.resolve();
    if (!networkReady) {
      // Original 3.1.39 initFetch initializes the client's Aegis service with
      // these defaults. Direct entry owns that lifecycle; secrets stay native.
      networkReady = withTimeout(namespace._native.call("network.initAegis", {
        updateIntervalMinute: 1, publicKeyUpdateIntervalSecond: 120,
        probeIntervalSecond: 300, probeIntervalSecondMax: 1200,
        degradeThreshold: 3, degradeTimeWindowSecond: 60
      }), "network.initAegis").then(function (result) {
        if (!result || result.errorCode !== 0)
          throw sdkError("desktop network initialization failed", "NETWORK_INIT_FAILED");
      }).catch(function (error) { networkReady = null; throw error; });
    }
    return networkReady;
  }

  async function desktopRequest(path, data) {
    if (!/^\/api\/[a-zA-Z0-9/_-]+$/.test(path))
      throw new TypeError("request path must be an /api/ path without a query string");
    var bridge = namespace._native;
    var config = root.APP_CONF;
    if (!bridge.ready()) {
      throw sdkError("desktop network bridge is not ready", "BRIDGE_UNAVAILABLE", path);
    }
    var domain;
    try {
      // The independent page has no APP_CONF. This is the desktop XeAPI host
      // observed in the original client; the allowlist below remains mandatory.
      domain = new URL(config && config.apiDomain || "https://interfacepc.music.163.com");
    } catch (_) {
      throw sdkError("unexpected desktop API domain", "INVALID_DOMAIN", path);
    }
    if (domain.protocol !== "https:" ||
        !/(^|\.)music\.163\.com$/.test(domain.hostname)) {
      throw sdkError("unexpected desktop API domain", "INVALID_DOMAIN", path);
    }
    await initializeNetwork();

    // The native bridge owns the login session; do not copy cookies into JS.
    var requestData = Object.assign({}, data, { e_r: true });
    var envelope = JSON.stringify({ method: "POST", body: base64Utf8(form(requestData)) });
    var encrypted = await withTimeout(
      Promise.resolve(bridge.call("network.aegisEncrypt", { body: envelope })),
      "network.aegisEncrypt"
    );
    if (!encrypted || encrypted.errorCode !== 0 ||
        typeof encrypted.encryptedBody !== "string" ||
        !encrypted.encryptedBody) {
      throw sdkError("desktop XeAPI encryption is unavailable", "ENCRYPT_UNAVAILABLE", path);
    }

    var result = await withTimeout(Promise.resolve(bridge.call("network.fetch", {
      url: domain.origin + "/xeapi/" + path.slice(5),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      retryCount: 3,
      isDecrypt: true,
      isXeapi: true,
      body: encrypted.encryptedBody
    })), "network.fetch");
    if (!result || result.code !== 0 || result.status !== 200)
      throw sdkError("desktop network request failed", "NETWORK_ERROR", path);

    var body;
    try {
      body = JSON.parse(result.blob);
    } catch (_) {
      throw sdkError("desktop returned invalid JSON", "INVALID_RESPONSE", path);
    }
    if (!body || Number(body.code) !== 200)
      throw sdkError("API returned code " + (body && body.code),
        body && body.code, path);
    return body;
  }

  Object.defineProperty(namespace, "_transport", {
    value: Object.freeze({ request: desktopRequest }), configurable: false
  });
})(globalThis);
