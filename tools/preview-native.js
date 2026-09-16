// Browser-only fixture for the existing playback SDK. No sound or Native access.
(function (root) {
  "use strict";
  var events = new Map();
  var calls = [];
  var timer = null;
  var current = 0;
  var active = null;
  var volume = 1;
  var windowStatus = "restore";
  function emit(name) {
    var callback = events.get(name);
    if (callback) callback.apply(null, Array.prototype.slice.call(arguments, 1));
  }
  function halt() { root.clearInterval(timer); timer = null; }
  root.previewNative = { calls: calls, emit: emit, imageRequests: [], failStop: false, failControls: false };
  var NativeImage = root.Image;
  var imageSource = Object.getOwnPropertyDescriptor(root.HTMLImageElement.prototype, "src");
  root.Image = function () {
    var image = new NativeImage();
    Object.defineProperty(image, "src", {
      get: function () { return imageSource.get.call(image); },
      set: function (value) {
        root.previewNative.imageRequests.push(value);
        imageSource.set.call(image, value.replace(/^orpheus:\/\/cache\?/, ""));
      }
    });
    return image;
  };
  root.channel = {
    registerCall: function (name, callback) { events.set(name, callback); },
    call: function (name, callback, args) {
      calls.push({ name: name, args: args });
      if (root.previewNative.failStop && name === "audioplayer.stop") throw new Error("Preview stop failed");
      if (root.previewNative.failControls && /\.(pause|play|seek|setVolume)$/.test(name)) throw new Error("Preview control failed");
      switch (name) {
        case "os.isFileExist": callback(!args[0].includes("missing")); return;
        case "app.getDefaultMusicPlayPath": callback(root.previewNative.startupPath || ""); return;
        case "musiclibrary.readMusicInfo":
          root.setTimeout(function () { emit("musiclibrary.onreadmusicinfo", args[0], args[1], 0,
            { title: args[1].split(/[\\/]/).pop().replace(/\.[^.]+$/, ""), artist: "本地艺人", album: "本地专辑", duration: 180000, bitrate: 320 }); }, 0);
          break;
        case "winhelper.getWindowInfo": callback({ status: windowStatus, visible: true }); return;
        case "winhelper.showWindow": windowStatus = args[0]; emit("winhelper.onSizeStatus", windowStatus, 1440, 1000); break;
        case "winhelper.dragWindow": case "winhelper.sizeWindow": case "winhelper.setWindowTitle": case "trayicon.setToolTip": case "app.exit":
        case "player.setSMTCEnable": case "player.setInfo": case "player.setCover": case "player.setCoverDefault": case "player.setMiniPlayerState": case "app.setThumbnail": break;
        case "audioplayer.load":
          halt(); active = args[0]; current = 0;
          root.setTimeout(function () { emit("audioplayer.onLoad", args[0], { code: 0, duration: 180 }); }, 0);
          break;
        case "audioplayer.play":
          halt(); active = args[0];
          emit("audioplayer.onPlayState", active, args[1], 1);
          timer = root.setInterval(function () {
            current = Math.min(180, current + 0.25);
            emit("audioplayer.onPlayProgress", active, current);
            if (current >= 180) { halt(); emit("audioplayer.onEnd", active, {}); }
          }, 250);
          break;
        case "audioplayer.pause":
          halt(); emit("audioplayer.onPlayState", args[0], args[1], 2); break;
        case "audioplayer.stop":
          if (active === args[0]) { halt(); active = null; } break;
        case "audioplayer.seek":
          current = args[2]; emit("audioplayer.onSeek", args[0], args[1], 0, current); break;
        case "audioplayer.setVolume":
          volume = args[2]; break;
        default: throw new Error("Unexpected preview command: " + name);
      }
      callback();
    }
  };
  root.addEventListener("pagehide", halt);
})(globalThis);
