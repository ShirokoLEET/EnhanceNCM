const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../src/sdk/domain/cover-colors.js"), "utf8");
const context = { EnhanceNCM: {}, Map, setTimeout, clearTimeout };
vm.runInNewContext(source, context);
const colors = context.EnhanceNCM._coverColors;

function pixels(red, green, blue) {
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = red; data[i + 1] = green; data[i + 2] = blue; data[i + 3] = 255;
  }
  return data;
}
function channels(css) { return css.match(/\d+/g).map(Number); }

test("lyric palette follows the dominant cover hue with readable text", () => {
  const warm = colors.fromPixels(pixels(220, 70, 40));
  const cool = colors.fromPixels(pixels(35, 85, 225));
  const [wr, wg, wb] = channels(warm.background);
  const [cr, cg, cb] = channels(cool.background);
  assert.ok(wr > wg && wg > wb, `warm palette: ${warm.background}`);
  assert.ok(cb > cg && cg > cr, `cool palette: ${cool.background}`);
  assert.notEqual(warm.background, cool.background);
  assert.deepEqual(channels(warm.active), [255, 255, 255]);
  assert.ok(channels(warm.inactive).every(value => value > 150));
});

test("transparent and monochrome artwork use a neutral fallback", () => {
  assert.equal(colors.fromPixels(pixels(70, 70, 70)).background, colors.fallback.background);
  const transparent = pixels(220, 40, 30);
  for (let i = 3; i < transparent.length; i += 4) transparent[i] = 0;
  assert.equal(colors.fromPixels(transparent).background, colors.fallback.background);
});

test("a canvas-tainted Native cover retries a CORS artwork URL", async () => {
  const requested = [];
  class RemoteImage {
    constructor() { this.naturalWidth = 32; }
    set src(value) { requested.push({ value, crossOrigin: this.crossOrigin }); queueMicrotask(() => this.onload()); }
  }
  const document = { createElement: () => ({
    getContext: () => ({
      drawImage(image) { this.image = image; },
      getImageData() {
        if (this.image.tainted) throw new Error("canvas is tainted");
        return { data: pixels(40, 85, 210) };
      }
    })
  }) };
  const sandbox = { EnhanceNCM: {}, Map, Image: RemoteImage, document, setTimeout, clearTimeout };
  vm.runInNewContext(source, sandbox);
  const palette = await sandbox.EnhanceNCM._coverColors.sample(
    { naturalWidth: 32, complete: true, tainted: true }, "https://p1.music.126.net/cover.jpg"
  );
  const [red, green, blue] = channels(palette.background);
  assert.ok(blue > green && green > red);
  assert.deepEqual(requested, [{ value: "https://p1.music.126.net/cover.jpg", crossOrigin: "anonymous" }]);
});
