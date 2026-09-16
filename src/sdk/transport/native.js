(function (root) {
  "use strict";

  var namespace = root.EnhanceNCM || (root.EnhanceNCM = {});
  if (namespace._native) return;

  function ready() {
    return !!(root.channel && typeof root.channel.call === "function") ||
      !!(root.legacyNativeCmder && typeof root.legacyNativeCmder.call === "function");
  }

  function callArgs(command, args) {
    // channel is installed by the client in each main-frame V8 context, even
    // when the original frontend and its legacyNativeCmder wrapper are absent.
    if (root.channel && typeof root.channel.call === "function") {
      return new Promise(function (resolve, reject) {
        try {
          root.channel.call(command, function () {
            resolve(arguments.length > 1 ? Array.from(arguments) : arguments[0]);
          }, args);
        } catch (error) { reject(error); }
      });
    }
    if (root.legacyNativeCmder && typeof root.legacyNativeCmder.call === "function")
      return Promise.resolve(root.legacyNativeCmder.call.apply(root.legacyNativeCmder,
        [command].concat(args)));
    return Promise.reject(new Error("desktop Native channel is not ready"));
  }
  function call(command, options) { return callArgs(command, [options]); }

  // Native registerCall has no unregister counterpart. Keep one bridge callback
  // per event and remove only our JS listeners when a playback session ends.
  var events = Object.create(null);
  function subscribe(event, listener) {
    if (!/^audioplayer\.on(Load|PlayState|PlayProgress|End|Buffering|Seek|Volume)$/.test(event) &&
        !["player.onaction", "player.onthumbnailaction", "trayicon.onclick", "trayicon.onrightclick",
          "storage.onreadfromfiledone", "musiclibrary.onreadmusicinfo", "app.onplaylocalmusic", "winhelper.onSizeStatus", "winhelper.onclose", "storage.onexecsqldone", "ipc.onipcmessagerecived"].includes(event))
      throw new TypeError("unsupported Native event");
    if (typeof listener !== "function") throw new TypeError("listener must be a function");
    if (!root.channel || typeof root.channel.registerCall !== "function")
      throw new Error("desktop Native event channel is not ready");
    if (!events[event]) {
      var listeners = new Set();
      var callback = function () {
        var args = Array.from(arguments);
        listeners.forEach(function (fn) { try { fn.apply(null, args); } catch (_) {} });
      };
      // The desktop frontend marks its registerCall callbacks as websdk.
      Object.defineProperty(callback, "_from", { value: "websdk" });
      root.channel.registerCall(event, callback);
      events[event] = listeners;
    }
    events[event].add(listener);
    return function () { events[event].delete(listener); };
  }

  Object.defineProperty(namespace, "_native", {
    value: Object.freeze({ ready: ready, call: call, callArgs: callArgs, subscribe: subscribe }), configurable: false
  });
})(globalThis);
