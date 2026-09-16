const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");

test("account library: liked songs, created playlists, pagination, failures and stale requests", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light", reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const output = path.join(__dirname, "../out/music-ui");
  fs.mkdirSync(output, { recursive: true });
  async function load(query = "") {
    await page.goto(base + query);
    await page.locator("#refresh-library:enabled").waitFor();
    await page.locator('#account-name').filter({ hasText: /音乐漫游者|尚未登录/ }).waitFor();
  }
  async function liked() {
    await page.locator('[data-view="liked"]').click();
    await page.locator("#reload-liked:enabled").waitFor();
  }
  try {
    await load();
    assert.equal(await page.locator("#account-name").textContent(), "音乐漫游者");
    await page.locator('[data-view="created"]').click();
    assert.equal(await page.locator("#created-grid button").count(), 2);
    assert.equal(await page.locator('#created-grid [data-playlist="900"]').count(), 0);
    await page.screenshot({ path: path.join(output, "created-playlists.png") });
    await page.locator('#created-grid [data-playlist="501"]').click();
    await page.locator("#list-heading").filter({ hasText: "清晨出发" }).waitFor();
    assert.equal(await page.locator("#tracks tr").count(), 3);
    await page.locator("#play-all").click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().songId), "7");
    await liked();
    assert.equal(await page.locator("#tracks tr").count(), 3);
    await page.locator("#search").fill("海岸线");
    assert.equal(await page.locator("#tracks tr").count(), 1);
    await page.locator("#play-all").click();
    await page.waitForFunction(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().songId), "3");
    await page.locator('[data-like="3"]:enabled').click();
    await page.locator("#tracks tr").waitFor({ state: "detached" });
    await page.locator("#reload-liked:enabled").waitFor();
    assert.equal(await page.locator("#tracks tr").count(), 0);
    assert.equal(await page.evaluate(() => previewLibrary.calls.some(c => c.name === "setLiked" && c.id === "3" && c.liked === false)), true);
    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    await page.locator("#search").fill("");
    await page.locator('[data-like="3"][aria-pressed="false"]:enabled').click();
    await page.locator('[data-like="3"][aria-pressed="true"]').waitFor();
    await liked();
    assert.equal(await page.locator("#tracks tr").count(), 3);
    await page.evaluate(() => { previewLibrary.failLike = true; });
    await page.locator('[data-like="3"]:enabled').click();
    await page.locator("#notice-text").filter({ hasText: "喜欢操作失败" }).waitFor();
    assert.equal(await page.locator('[data-like="3"]').getAttribute("aria-pressed"), "true");
    await page.evaluate(() => { previewLibrary.failLike = false; });
    // The now-playing heart shares account state with the row, including pending writes.
    await page.evaluate(() => {
      window.originalSetLiked = EnhanceNCM.sdk.songs.setLiked;
      window.pendingLikeCalls = 0;
      EnhanceNCM.sdk.songs.setLiked = (id, liked) => {
        ++pendingLikeCalls;
        return new Promise(resolve => { window.finishLike = () => resolve(originalSetLiked(id, liked)); });
      };
      const button = document.querySelector("#enhancencm-ui-root").shadowRoot.querySelector("#now-favorite");
      button.click(); button.click();
    });
    assert.equal(await page.locator("#now-favorite").isDisabled(), true);
    assert.equal(await page.locator('[data-like="3"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => pendingLikeCalls), 1);
    await page.evaluate(() => { finishLike(); EnhanceNCM.sdk.songs.setLiked = originalSetLiked; });
    await page.locator('#now-favorite[aria-pressed="false"]:enabled').waitFor();
    await page.locator('[data-like="3"]').waitFor({ state: "detached" });
    await page.locator("#now-favorite").click();
    await page.locator('#now-favorite[aria-pressed="true"]:enabled').waitFor();
    await page.locator('[data-like="3"][aria-pressed="true"]').waitFor();
    await page.screenshot({ path: path.join(output, "liked-songs.png") });
    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.locator('[data-view="created"]').click();
      await page.screenshot({ path: path.join(output, `created-${width}.png`) });
      assert.ok(await page.evaluate(() => {
        const main = document.querySelector("#enhancencm-ui-root").shadowRoot.querySelector("main");
        return main.scrollWidth <= main.clientWidth + 1;
      }));
    }
    await page.setViewportSize({ width: 1440, height: 1000 });

    await load("?manycreated&manyliked&sparse");
    await page.locator('[data-view="created"]').click();
    assert.equal(await page.locator("#created-grid button").count(), 29);
    await page.locator("#more-created").click();
    await page.locator("#more-created").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#created-grid button").count(), 32);
    assert.deepEqual(await page.evaluate(() => previewLibrary.calls.filter(c => c.name === "listCreated").map(c => c.options.offset)), [0, 30]);
    await page.locator("#search").fill("自建歌单 32");
    assert.equal(await page.locator("#created-grid button").count(), 1);
    await liked();
    assert.equal(Number(await page.locator("#tracks").getAttribute("data-total")), 499);
    assert.ok(await page.locator("#tracks [data-song]").count() <= 80);
    await page.locator("#search").fill("喜欢的旋律 503");
    assert.equal(await page.locator("#tracks tr").count(), 0);
    await page.locator("#more-liked").click();
    await page.locator("#more-liked").waitFor({ state: "hidden" });
    assert.equal(await page.locator("#tracks tr").count(), 1);
    await page.locator("#search").fill("");
    assert.equal(Number(await page.locator("#tracks").getAttribute("data-total")), 502);
    assert.ok(await page.locator("#tracks [data-song]").count() <= 80);
    await page.locator('#main').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.locator('[data-like="1503"]').waitFor();
    assert.equal(await page.locator('[data-like="1503"]').getAttribute("aria-pressed"), "true");
    assert.deepEqual(await page.evaluate(() => previewLibrary.calls.filter(c => c.name === "listLiked").map(c => c.options.offset)), [0, 500]);

    await load("?likedidserror");
    await page.locator("#notice-text").filter({ hasText: "喜欢状态读取失败" }).waitFor();
    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    assert.equal(await page.locator('[data-like="1"]').isDisabled(), true);
    await page.evaluate(() => { previewLibrary.failLikedIds = false; });
    await page.locator("#refresh-library").click();
    await page.locator('[data-like="1"]:enabled').waitFor();
    assert.equal(await page.locator('[data-like="3"]').getAttribute("aria-pressed"), "true");

    await load("?signedout");
    await page.locator('[data-view="created"]').click();
    assert.match(await page.locator("#created-status").textContent(), /先在网易云原版登录/);
    await liked();
    assert.match(await page.locator("#liked-status").textContent(), /先在网易云原版登录/);
    assert.equal(await page.locator("#tracks tr").count(), 0);
    await page.evaluate(() => { previewLibrary.signedOut = false; });
    await page.locator("#refresh-library").click();
    await page.locator("#account-name").filter({ hasText: "音乐漫游者" }).waitFor();
    await page.locator("#reload-liked:enabled").waitFor();
    assert.equal(await page.locator("#tracks tr").count(), 3);

    await load("?noliked&emptycreated");
    await page.locator('[data-view="created"]').click();
    assert.equal(await page.locator("#created-grid button").count(), 0);
    assert.match(await page.locator("#created-status").textContent(), /还没有自己创建/);
    await liked();
    assert.equal(await page.locator("#empty-title").textContent(), "还没有喜欢的歌曲");
    assert.equal(await page.evaluate(() => previewLibrary.calls.some(c => c.name === "listLiked")), false);
    await load("?libraryerror");
    await page.locator('[data-view="created"]').click();
    assert.match(await page.locator("#created-status").textContent(), /读取失败/);
    await liked();
    assert.equal(await page.locator("#tracks tr").count(), 3);
    await load("?likederror");
    await liked();
    assert.match(await page.locator("#liked-status").textContent(), /读取失败/);
    assert.equal(await page.locator("#play-all").isDisabled(), true);
    await page.locator('[data-view="created"]').click();
    assert.equal(await page.locator("#created-grid button").count(), 2);

    // A late liked-song response must not replace the selected created playlist.
    await load();
    await page.evaluate(() => {
      window.realLiked = EnhanceNCM.sdk.songs.listLiked;
      EnhanceNCM.sdk.songs.listLiked = () => new Promise(resolve => { window.finishLiked = resolve; });
    });
    await page.locator('[data-view="liked"]').click();
    await page.waitForFunction(() => !!window.finishLiked);
    await page.locator('#sidebar-created [data-playlist="501"]').click();
    await page.locator("#list-heading").filter({ hasText: "清晨出发" }).waitFor();
    await page.evaluate(() => window.finishLiked([{ id: 777, name: "延迟返回的喜欢歌曲", ar: [] }]));
    assert.equal(await page.locator("#list-heading").textContent(), "清晨出发");
    assert.equal(await page.locator('#tracks [data-play="777"]').count(), 0);
    await page.locator("#refresh-library").click();
    await page.locator("#refresh-library:enabled").waitFor();
    await page.evaluate(() => { window.finishLiked = null; });
    await page.locator('[data-view="liked"]').click();
    await page.waitForFunction(() => !!window.finishLiked);
    await page.locator('[data-view="created"]').click();
    await page.locator("#refresh-library").click();
    await page.locator("#refresh-library:enabled").waitFor();
    await page.evaluate(() => {
      window.finishLiked([{ id: 778, name: "旧账号的响应", ar: [] }]);
      EnhanceNCM.sdk.songs.listLiked = window.realLiked;
    });
    await liked();
    assert.equal(await page.locator("#tracks tr").count(), 3);
    assert.equal(await page.locator('#tracks [data-play="778"]').count(), 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
