(function (root) {
  "use strict";
  function parseTimedLyrics(source, wordTimed) {
    var lines = [];
    String(source || "").split(/\r?\n/).forEach(function (row) {
      if (wordTimed) {
        var wordMatch = /^\[(\d+),(\d+)\](.*)$/.exec(row);
        if (!wordMatch) return;
        var words = wordMatch[3].replace(/\(\d+,\d+,\d+\)/g, "").trim();
        if (words) lines.push({ time: Number(wordMatch[1]) / 1000, text: words });
        return;
      }
      var stamps = Array.from(row.matchAll(/\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/g));
      if (!stamps.length) return;
      var text = row.replace(/\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/g, "")
        .replace(/<\d{1,3}:\d{1,2}(?:\.\d{1,3})?>/g, "").trim();
      if (!text) return;
      stamps.forEach(function (stamp) {
        var fraction = stamp[3] ? Number(stamp[3]) / Math.pow(10, stamp[3].length) : 0;
        lines.push({ time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text: text });
      });
    });
    return lines.sort(function (a, b) { return a.time - b.time; });
  }

  function parseLyrics(response) {
    if (response.nolyric || response.uncollected) return { lines: [], synced: false };
    var primary = parseTimedLyrics(response.lrc && response.lrc.lyric);
    if (!primary.length) primary = parseTimedLyrics(response.yrc && response.yrc.lyric, true);
    var translations = parseTimedLyrics(response.tlyric && response.tlyric.lyric);
    if (primary.length) {
      primary.forEach(function (line) {
        var match = translations.find(function (item) { return Math.abs(item.time - line.time) < 0.6; });
        if (match && match.text !== line.text) line.translation = match.text;
      });
      return { lines: primary, synced: true };
    }
    var plain = String(response.lrc && response.lrc.lyric || "").split(/\r?\n/)
      .map(function (line) { return line.trim(); }).filter(Boolean)
      .map(function (text) { return { time: null, text: text }; });
    return { lines: plain, synced: false };
  }

  root.EnhanceNCM._lyrics = Object.freeze({ parse: parseLyrics });
})(globalThis);
