// Example only; not bundled or automatically selected. The host owns player.
// Load this file before calling EnhanceNCMExampleTheme(player).
(function (root) {
  "use strict";
  root.EnhanceNCMExampleTheme = function (player) {
    return function render(context) {
      var shadow = context.root, sdk = context.sdk, disposed = false;
      shadow.innerHTML = '<style>:host{display:block;font:16px system-ui;padding:24px;background:#18181b;color:#fff}' +
        'button{font:inherit;margin:8px;padding:10px 16px}button svg{pointer-events:none}</style>' +
        '<h1>Minimal Music</h1><p id="song"></p><p id="time"></p>' +
        '<button id="daily">载入每日推荐</button><button id="previous">上一首</button>' +
        '<button id="toggle">播放</button><button id="next">下一首</button><p id="status" role="status"></p>';
      var get = function (id) { return shadow.querySelector(id); };
      function update(state) {
        if (disposed) return;
        get("#song").textContent = state.song ? state.song.name + " · " + sdk.presentation.artists(state.song) : "还没有选择歌曲";
        get("#time").textContent = sdk.presentation.time(state.playback.current);
        get("#toggle").textContent = state.loading ? "取消加载" : (state.playback.pendingStatus || state.playback.status) === "playing" ? "暂停" : "播放";
      }
      async function act(action) {
        try { await action(); }
        catch (cause) { if (!disposed) get("#status").textContent = cause.message; }
      }
      get("#daily").onclick = function () { act(async function () {
        var songs = await sdk.recommendations.getDailySongs();
        if (disposed) return;
        if (songs.length) await player.play(songs[0], { queue: songs, source: "daily" });
        else get("#status").textContent = "今天暂时没有推荐";
      }); };
      get("#previous").onclick = function () { act(player.previous); };
      get("#toggle").onclick = function () { act(player.toggle); };
      get("#next").onclick = function () { act(player.next); };
      var release = player.subscribe(update);
      update(player.getState());
      // Changing the theme releases the view, not the shared audio session.
      return function () { disposed = true; release(); shadow.textContent = ""; };
    };
  };
})(globalThis);
