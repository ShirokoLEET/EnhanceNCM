// Copy this folder to CloudMusic/EnhanceNCM/Minimal, then rescan themes.
EnhanceNCM.themes.register({
  name: "Minimal",
  mount({ root, sdk }) {
    const player = sdk.player.createSession();
    root.innerHTML = '<style>:host{display:block;min-height:100vh;padding:64px;box-sizing:border-box;background:#18181b;color:#fff;font:16px system-ui}button{font:inherit;padding:12px;margin:8px}</style>' +
      '<h1>Minimal</h1><p id="song">选择每日推荐开始播放</p><button id="daily">每日推荐</button><button id="toggle">播放 / 暂停</button><button id="next">下一首</button><p id="status" role="status"></p>';
    let disposed = false;
    function action(fn) { Promise.resolve().then(fn).catch(error => { if (!disposed) root.querySelector('#status').textContent = error.message; }); }
    const unsubscribe = player.subscribe(state => { root.querySelector('#song').textContent = state.song ? state.song.name : '选择每日推荐开始播放'; });
    root.querySelector('#daily').onclick = () => action(async () => {
      const songs = await sdk.recommendations.getDailySongs();
      if (!disposed && songs.length) await player.play(songs[0], { queue: songs, source: 'daily' });
    });
    root.querySelector('#toggle').onclick = () => action(() => player.toggle());
    root.querySelector('#next').onclick = () => action(() => player.next());
    player.connectSystemMedia();
    return async () => { disposed = true; unsubscribe(); await player.dispose(); };
  }
});
