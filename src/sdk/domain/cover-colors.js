(function (root) {
  "use strict";
  var namespace = root.EnhanceNCM;
  if (namespace._coverColors) return;
  var fallback = Object.freeze({
    background: "rgb(36, 36, 36)", inactive: "rgb(190, 190, 190)",
    active: "rgb(255, 255, 255)", passed: "rgb(255, 255, 255)"
  });

  function hsl(red, green, blue) {
    var r = red / 255, g = green / 255, b = blue / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    var light = (max + min) / 2, saturation = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
    var hue = 0;
    if (delta) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue = (hue * 60 + 360) % 360;
    }
    return { hue: hue, saturation: saturation, light: light };
  }
  function rgb(hue, saturation, light) {
    var chroma = (1 - Math.abs(2 * light - 1)) * saturation;
    var sector = hue / 60, second = chroma * (1 - Math.abs(sector % 2 - 1));
    var values = sector < 1 ? [chroma, second, 0] : sector < 2 ? [second, chroma, 0] :
      sector < 3 ? [0, chroma, second] : sector < 4 ? [0, second, chroma] :
      sector < 5 ? [second, 0, chroma] : [chroma, 0, second];
    var base = light - chroma / 2;
    return "rgb(" + values.map(function (value) { return Math.round((value + base) * 255); }).join(", ") + ")";
  }
  function fromPixels(pixels) {
    if (!pixels || !pixels.length) return fallback;
    var groups = new Map(), neutralCount = 0;
    for (var i = 0; i + 3 < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      var color = hsl(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (color.saturation < .15 || color.light < .08 || color.light > .92) { neutralCount++; continue; }
      var bin = Math.floor(color.hue / 20), weight = 1 + color.saturation * 1.8;
      var group = groups.get(bin) || { score: 0, hue: 0, saturation: 0 };
      group.score += weight;
      group.hue += color.hue * weight;
      group.saturation += color.saturation * weight;
      groups.set(bin, group);
    }
    var best = null;
    groups.forEach(function (group) { if (!best || group.score > best.score) best = group; });
    if (!best || best.score < Math.max(8, neutralCount * .12)) return fallback;
    var hue = best.hue / best.score;
    var saturation = Math.min(.76, Math.max(.38, best.saturation / best.score * 1.05));
    return {
      background: rgb(hue, saturation, .22),
      inactive: rgb(hue, Math.min(.42, saturation * .55), .79),
      active: fallback.active, passed: fallback.passed
    };
  }
  function read(image) {
    if (!image || !image.naturalWidth || !root.document) return null;
    var canvas = root.document.createElement("canvas");
    canvas.width = canvas.height = 32;
    var context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0, 32, 32);
    return fromPixels(context.getImageData(0, 0, 32, 32).data);
  }
  function decodeWithTimeout(image) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("cover decode timed out")); }, 4000);
      image.decode().then(function () { clearTimeout(timer); resolve(); }, function (error) {
        clearTimeout(timer); reject(error);
      });
    });
  }
  async function sample(displayed, rawUrl) {
    if (displayed) {
      try {
        if (!displayed.complete && displayed.decode) await decodeWithTimeout(displayed);
        var local = read(displayed);
        if (local) return local;
      } catch (_) { /* Native image URLs may taint canvas; try the HTTPS artwork. */ }
    }
    if (!rawUrl || !/^https:\/\//i.test(rawUrl) || !root.Image) return fallback;
    try {
      var image = new root.Image();
      image.crossOrigin = "anonymous";
      await new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { reject(new Error("cover load timed out")); }, 6000);
        image.onload = function () { clearTimeout(timer); resolve(); };
        image.onerror = function () { clearTimeout(timer); reject(new Error("cover load failed")); };
        image.src = rawUrl;
      });
      return read(image) || fallback;
    } catch (_) { return fallback; }
  }
  namespace._coverColors = Object.freeze({ fallback: fallback, fromPixels: fromPixels, sample: sample });
})(globalThis);
