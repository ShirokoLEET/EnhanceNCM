// Only public EnhanceNCM SDK data enters the upstream UI.
export function lyricLines(result, durationMs = 0) {
  if (!result?.synced) return [];
  const lines = (result.lines || []).filter(line => Number.isFinite(line.time) && line.time >= 0);
  return lines.map((line, index) => {
    const startTime = Math.round(line.time * 1000);
    const next = lines[index + 1];
    const endTime = Math.max(startTime + 1, next ? Math.round(next.time * 1000) : durationMs || startTime + 5000);
    return { startTime, endTime, words: [{ word: line.text, startTime, endTime }],
      translatedLyric: line.translation || '', romanLyric: '', isBG: false, isDuet: false };
  });
}

export function connectPlayer({ sdk, player, onState, onLyrics, onError }) {
  let disposed = false, currentId = null, request = 0;
  function update(state) {
    if (disposed) return;
    onState(state);
    const id = state.song ? String(state.song.id) : null;
    if (id === currentId) return;
    currentId = id;
    const ticket = ++request;
    onLyrics([], state.song ? '正在加载歌词…' : '搜索歌曲或选择每日推荐开始播放');
    if (!state.song) return;
    const song = state.song;
    Promise.resolve().then(() => sdk.songs.getLyrics(sdk.localMusic?.isLocal(song) ? song : song.id)).then(result => {
      if (disposed || request !== ticket) return;
      const duration = Number(song.dt || song.duration || state.playback.duration * 1000) || 0;
      const lines = lyricLines(result, duration);
      onLyrics(lines, lines.length ? '' : result?.lines?.map(line => line.text).join('\n') || '暂无歌词');
    }).catch(error => {
      if (disposed || request !== ticket) return;
      onLyrics([], '歌词加载失败');
      onError(error);
    });
  }
  const unsubscribe = player.subscribe(update);
  update(player.getState());
  return () => { disposed = true; ++request; unsubscribe(); };
}
