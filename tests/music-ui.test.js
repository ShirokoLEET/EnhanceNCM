// Requires Playwright; see ARCHITECTURE.md for the optional browser QA command.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");

test("music UI: Native playback integration, events, navigation, races and responsive layout", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: "light" });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.Audio = function () { throw new Error("Production UI must not create HTMLAudio"); };
  });
  const output = path.join(__dirname, "../out/music-ui");
  fs.mkdirSync(output, { recursive: true });
  async function waitFor(predicate) { await page.waitForFunction(predicate); }
  async function load(query = "") {
    await page.goto(base + query);
    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    if (query !== '?empty') await page.locator('#tracks tr').first().waitFor();
    await page.locator('#albums [data-playlist]').first().waitFor({ state: 'attached' });
    await page.evaluate(async () => {
      const images = document.querySelector("#enhancencm-ui-root").shadowRoot.querySelectorAll("#albums img");
      await Promise.all(Array.from(images, img => img.decode().catch(() => {})));
    });
  }
  async function noOverflow() {
    const overflow = await page.evaluate(() => {
      const shadow = document.querySelector("#enhancencm-ui-root").shadowRoot;
      return [shadow.querySelector(".app"), shadow.querySelector("main"), shadow.querySelector(".player")].map(el => el.scrollWidth - el.clientWidth);
    });
    assert.ok(overflow.every(value => value <= 1), `horizontal overflow: ${overflow}`);
  }
  try {
    await load();
    assert.equal(await page.locator("#tracks tr").count(), 8);
    assert.equal(await page.locator(".quick-grid .quick-card").count(), 5);
    assert.equal(await page.locator(".record-art").count(), 0);
    assert.equal(await page.locator(".app").evaluate(element => getComputedStyle(element).backgroundColor), "rgb(0, 0, 0)");
    assert.equal(await page.locator(".window-caption").count(), 0);
    assert.equal(await page.locator(".brand").textContent(), "EnhanceNCM");
    assert.equal(await page.locator(".brand small").count(), 0);
    assert.equal(await page.locator(".window-bar #refresh").count(), 1);
    assert.equal(await page.locator(".window-bar #original").count(), 1);
    assert.equal(await page.locator('.window-bar').evaluate(element => getComputedStyle(element).height), '32px');
    assert.equal(await page.locator('.app').evaluate(element => getComputedStyle(element).rowGap), '4px');
    assert.equal(await page.locator('#window-minimize').evaluate(element => getComputedStyle(element).width), '36px');
    assert.equal(await page.locator('#connection').count(), 0);
    assert.equal(await page.locator("#original").textContent(), "");
    assert.equal(await page.locator("#original svg").count(), 1);
    assert.equal(await page.locator("#original").getAttribute("aria-label"), "返回网易云原版");
    assert.equal(await page.locator(".toolbar #refresh, .toolbar #original").count(), 0);
    const actionY = await page.locator("#original").evaluate(element => element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2);
    const controlsY = await page.locator("#window-minimize").evaluate(element => element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2);
    assert.ok(Math.abs(actionY - controlsY) <= 1, "toolbar actions should align with window controls");
    assert.equal(await page.evaluate(() => previewNative.coverRequests.filter(Boolean).every(url => url.startsWith("orpheus://cache?"))), true);
    assert.equal(await page.locator("main").evaluate(element => getComputedStyle(element, "::-webkit-scrollbar").display), "block");
    assert.equal(await page.locator("main").evaluate(element => getComputedStyle(element, "::-webkit-scrollbar").width), "6px");
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.locator("main").evaluate(element => { element.scrollTop = 120; });
    assert.ok(await page.locator("main").evaluate(element => element.scrollTop) > 0);
    await page.locator("main").evaluate(element => { element.scrollTop = 0; });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator("#window-maximize").click();
    await page.locator('#window-maximize[aria-label="还原窗口"]').waitFor();
    assert.equal(await page.locator(".resize-handles").isVisible(), false);
    await page.locator(".window-bar").dblclick({ position: { x: 300, y: 18 } });
    await page.locator('#window-maximize[aria-label="最大化"]').waitFor();
    const bar = await page.locator(".window-bar").boundingBox();
    await page.mouse.move(bar.x + 400, bar.y + 18);
    await page.mouse.down(); await page.mouse.move(bar.x + 414, bar.y + 18); await page.mouse.up();
    assert.equal(await page.evaluate(() => previewNative.calls.some(call => call.name === "winhelper.dragWindow")), true);
    await page.locator('[data-resize="bottomright"]').dispatchEvent("mousedown", { button: 0 });
    assert.equal(await page.evaluate(() => previewNative.calls.some(call => call.name === "winhelper.sizeWindow" && call.args[0] === "bottomright")), true);
    const dragCount = await page.evaluate(() => previewNative.calls.filter(call => call.name === "winhelper.dragWindow").length);
    await page.locator("#window-minimize").click();
    assert.equal(await page.evaluate(() => previewNative.calls.filter(call => call.name === "winhelper.dragWindow").length), dragCount);
    await page.evaluate(() => EnhanceNCM.sdk.window.restore());
    await noOverflow();
    await page.screenshot({ path: path.join(output, "desktop.png") });
    await page.locator("#search").fill("南方来客");
    assert.equal(await page.locator("#tracks tr").count(), 2);
    await page.locator("#search").fill("No matching song");
    assert.equal(await page.locator("#empty-title").textContent(), "没有找到匹配的歌曲");
    await page.locator('#add-playlist').click();
    await page.locator('#playlist-id').fill('3778678');
    await page.locator('#playlist-form button[type="submit"]').click();
    assert.equal(await page.locator("#tracks tr").count(), 8);
    const oldFavorites = JSON.stringify([{ id: 1, name: "旧设备收藏", ar: [] }]);
    await page.evaluate(value => localStorage.setItem("enhancencm.favorites.v1", value), oldFavorites);
    await load();
    assert.equal(await page.locator('[data-like="1"]').getAttribute("aria-pressed"), "false");
    await page.locator('[data-like="1"]:enabled').click();
    await page.locator('[data-like="1"][aria-pressed="true"]').waitFor();
    assert.equal(await page.evaluate(() => previewLibrary.calls.some(call => call.name === "setLiked" && call.id === "1" && call.liked)), true);
    assert.equal(await page.locator('[data-view="favorites"]').count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("enhancencm.favorites.v1")), oldFavorites);
    await page.locator('[data-view="liked"]').click();
    await page.locator("#reload-liked:enabled").waitFor();
    assert.equal(await page.locator("#tracks tr").count(), 4);
    await load();
    await page.evaluate(() => EnhanceNCM.sdk.playback.play(5));
    assert.equal(await page.locator("#now-title").textContent(), "在路上");
    await page.evaluate(() => previewNative.emit("audioplayer.onPlayState", EnhanceNCM.sdk.playback.getState().playId, "external", 2));
    assert.equal(await page.locator("#play").getAttribute("aria-label"), "播放");
    await page.locator("#play-all").click();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    assert.equal(await page.locator('#notice').isVisible(), false, 'normal playback should not open the bottom notice');
    assert.equal(await page.locator("#now-title").textContent(), "落日来信");
    await page.waitForFunction(() => previewNative.calls.some(call => call.name === "player.setInfo" && call.args[0].songName === "落日来信"));
    await page.waitForFunction(() => previewNative.calls.some(call => call.name === "winhelper.setWindowTitle" && call.args[0].startsWith("落日来信")));
    assert.equal(await page.evaluate(() => previewNative.calls.some(call => call.name === "trayicon.setToolTip" && call.args[0].startsWith("落日来信"))), true);
    // A native state event must unlock the UI even when its command callback never arrives.
    await page.evaluate(() => {
      window.originalChannelCall = channel.call;
      channel.call = (name, callback, args) => originalChannelCall(name,
        /audioplayer\.(play|pause)$/.test(name) ? () => {} : callback, args);
    });
    await page.locator("#play-all").click();
    await page.locator('#play[aria-label="暂停"][aria-busy="false"]').waitFor();
    const loadedId = await page.evaluate(() => EnhanceNCM.sdk.playback.getState().playId);
    await page.locator("#play").click();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "paused");
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().playId), loadedId);
    await page.locator("#play").click();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    // Rapid clicks should alternate intent while acknowledgements are outstanding.
    await page.evaluate(() => {
      window.controlRequests = [];
      channel.call = (name, callback, args) => {
        if (/audioplayer\.(play|pause)$/.test(name)) controlRequests.push({ name, callback, args });
        else originalChannelCall(name, callback, args);
      };
      const button = document.querySelector("#enhancencm-ui-root").shadowRoot.querySelector("#play");
      button.click(); button.click(); button.click();
    });
    assert.deepEqual(await page.evaluate(() => controlRequests.map(item => item.name)), ["audioplayer.pause", "audioplayer.play", "audioplayer.pause"]);
    assert.equal(await page.locator("#play").getAttribute("aria-busy"), "true");
    await page.evaluate(() => {
      // A repeated SMTC pause is idempotent while a pause is already pending.
      previewNative.emit("player.onaction", "pause", "smtc");
    });
    assert.equal(await page.evaluate(() => controlRequests.length), 3);
    await page.evaluate(() => {
      for (const i of [2, 1, 0]) {
        const request = controlRequests[i];
        previewNative.emit("audioplayer.onPlayState", request.args[0], request.args[1], request.name.endsWith("pause") ? 2 : 1);
        request.callback();
      }
      channel.call = originalChannelCall;
    });
    await page.locator('#play[aria-label="播放"][aria-busy="false"]').waitFor();
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().status), "paused");
    await page.locator("#play").click();
    await page.evaluate(() => previewNative.emit("player.onaction", "pause", "smtc"));
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "paused");
    await page.evaluate(() => previewNative.emit("player.onaction", "play", "smtc"));
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#play").click();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "paused");
    await page.locator("#play").click();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#seek").fill("12");
    assert.ok(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().current >= 12));
    await page.locator("#volume").fill("0.25");
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().volume), 0.25);
    await page.locator("#mute").click();
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().volume), 0);
    await page.locator("#mute").click();
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().volume), 0.25);
    await page.evaluate(() => previewNative.emit("player.onaction", "next", "smtc"));
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    assert.equal(await page.locator("#now-title").textContent(), "慢慢喜欢这个世界");
    await page.locator("#repeat").click();
    const beforeLoop = await page.evaluate(() => EnhanceNCM.sdk.playback.getState().playId);
    await page.evaluate(() => previewNative.emit("audioplayer.onEnd", EnhanceNCM.sdk.playback.getState().playId, {}));
    await page.waitForFunction(id => {
      const state = EnhanceNCM.sdk.playback.getState();
      return state.status === "playing" && state.playId !== id;
    }, beforeLoop);
    assert.equal(await page.locator("#now-title").textContent(), "慢慢喜欢这个世界");
    await page.locator("#repeat").click();
    await page.evaluate(() => previewNative.emit("audioplayer.onEnd", EnhanceNCM.sdk.playback.getState().playId, {}));
    await page.locator("#now-title").filter({ hasText: "海岸线" }).waitFor();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.evaluate(() => {
      const id = EnhanceNCM.sdk.playback.getState().playId;
      previewNative.emit("audioplayer.onPlayProgress", id, 42);
      previewNative.emit("audioplayer.onBuffering", id, true);
    });
    assert.equal(await page.locator("#elapsed").textContent(), "0:42");
    assert.equal(await page.locator("#play").getAttribute("aria-busy"), "true");
    await page.evaluate(() => previewNative.emit("audioplayer.onBuffering", EnhanceNCM.sdk.playback.getState().playId, false));
    assert.equal(await page.locator("#play").getAttribute("aria-busy"), "false");
    await page.locator("#shuffle").click();
    await page.locator("#queue-toggle").click();
    assert.equal(await page.locator("#queue-tracks button").count(), 8);
    assert.match(await page.locator("#queue-detail").textContent(), /随机播放/);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#queue-panel").isVisible(), false);
    await page.locator("#play").click();

    // Invalid and retryable playlist states remain usable.
    await page.locator("#add-playlist").click();
    await page.locator("#playlist-id").fill("999");
    await page.locator('#playlist-form [type="submit"]').click();
    await page.locator("#retry").waitFor();
    assert.equal(await page.locator("#tracks tr").count(), 0);
    assert.equal(await page.locator("#list-heading").textContent(), "歌单 999");
    await page.locator("#add-playlist").click();
    await page.locator("#playlist-id").fill("123");
    await page.locator('#playlist-form [type="submit"]').click();
    await page.locator("#list-heading").filter({ hasText: "我的歌单" }).waitFor();

    // A stale playback URL must not take over a newer selection.
    await page.evaluate(() => {
      window.pendingUrls = {};
      EnhanceNCM.sdk.songs.getUrl = id => new Promise(resolve => { window.pendingUrls[id] = resolve; });
    });
    await page.locator('#tracks [data-play="1"]').click();
    await page.locator('#tracks [data-play="2"]').click();
    await page.evaluate(() => window.pendingUrls[2]({ url: "https://preview.invalid/new" }));
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.evaluate(() => window.pendingUrls[1]({ url: "https://preview.invalid/old" }));
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().songId), "2");
    assert.equal(await page.evaluate(() => previewNative.calls.some(call => call.name === "audioplayer.load" && call.args[1].musicurl.endsWith("/old"))), false);
    await page.locator('#tracks [data-play="3"]').click();
    await page.locator("#play").click();
    await page.evaluate(() => window.pendingUrls[3]({ url: "https://preview.invalid/cancelled" }));
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().status), "idle");
    await page.locator('#tracks [data-play="4"]').click();
    await page.evaluate(() => window.disposeMusic());
    await page.evaluate(() => window.pendingUrls[4]({ url: "https://preview.invalid/disposed" }));
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().status), "idle");

    await load("?unavailable");
    await page.locator("#play-all").click();
    await page.locator("#notice-text").filter({ hasText: "暂时无法播放" }).waitFor();
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().status), "error");
    await load();
    await page.locator("#play-all").click();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.evaluate(() => { previewNative.failControls = true; });
    await page.locator("#play").click();
    await page.locator("#notice-text").filter({ hasText: "播放操作失败" }).waitFor();
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().status), "playing");
    await page.evaluate(() => { previewNative.failControls = false; previewNative.failStop = true; });
    await page.locator("#original").click();
    assert.doesNotMatch(await page.title(), /客户端内可返回/);
    assert.notEqual(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().playId), null);
    await page.evaluate(() => { previewNative.failStop = false; });
    await page.locator("#original").click();
    await page.waitForFunction(() => document.title.includes("客户端内可返回"));
    assert.equal(await page.evaluate(() => EnhanceNCM.sdk.playback.getState().status), "idle");
    await load("?empty");
    assert.equal(await page.locator("#empty").isVisible(), true);
    assert.equal(await page.locator("#play-all").isDisabled(), true);
    await page.goto(base + "?offline");
    await page.locator("#home-recommendation-status").filter({ hasText: "加载失败" }).waitFor();
    assert.equal(await page.locator("#refresh-home-playlists").isEnabled(), true);
    assert.equal(await page.locator("#original").isEnabled(), true);
    await page.screenshot({ path: path.join(output, "offline.png") });

    await load();
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await page.screenshot({ path: path.join(output, "dark.png") });
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.emulateMedia({ colorScheme: "light" });
      await noOverflow();
      assert.equal(await page.locator("#refresh").isVisible(), true);
      assert.equal(await page.locator("#original").isVisible(), true);
      if (width === 768) assert.equal(await page.locator(".brand>span:last-child").evaluate(el => el.scrollWidth <= el.clientWidth), true);
      if (width === 390) assert.equal(await page.locator("#original").textContent(), "");
      await page.screenshot({ path: path.join(output, `width-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    await page.locator("#play-all").click();
    await waitFor(() => EnhanceNCM.sdk.playback.getState().status === "playing");
    await page.locator("#window-close").click();
    await page.waitForFunction(() => previewNative.calls.some(call => call.name === "app.exit"));
    const exitCalls = await page.evaluate(() => previewNative.calls.map(call => call.name));
    assert.ok(exitCalls.lastIndexOf("audioplayer.stop") < exitCalls.lastIndexOf("app.exit"));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
