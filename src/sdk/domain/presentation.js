(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  function artists(song) { return (song.ar || song.artists || []).map(function (artist) { return artist.name; }).join(" / ") || "未知艺人"; }
  function album(song) { return song.al || song.album || {}; }
  function time(seconds) {
    seconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  function filterSongs(songs, query) {
    var text = String(query || "").toLocaleLowerCase().trim();
    return songs.filter(function (song) { return !text || (song.name + " " + artists(song) + " " + (album(song).name || "")).toLocaleLowerCase().includes(text); });
  }
  Object.defineProperty(namespace, "_presentation", { value: Object.freeze({ artists: artists, album: album, time: time, filterSongs: filterSongs }) });
})(globalThis);
