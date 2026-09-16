const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || "playwright");
const { createServer } = require("../tools/preview-music.js");

test("playlist snapshots render before refresh and are replaced after account verification", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  try {
    const page = await browser.newPage();
    const source = fs.readFileSync(path.join(__dirname, "../src/themes/spotify/standalone.js"), "utf8");
    await page.route("**/standalone.js", route => route.fulfill({ contentType: "text/javascript", body: `
      window.snapshotWrites = [];
      EnhanceNCM._libraryCache = { snapshot: {
        lastAccount: async () => ({userId: "42", nickname: "旧昵称"}),
        read: async (owner, key) => key === "created" ? {items:[{id:888,name:"本地歌单",trackCount:1}],offset:1,more:false}
          : key === "subscribed" ? {items:[{id:889,name:"本地收藏",trackCount:1}],offset:1,more:false}
          : key === "playlist:3778678" ? {meta:{id:"3778678",name:"缓存热歌榜",trackCount:1},
            songs:[{id:999,name:"本地歌曲",ar:[],al:{},dt:1000}],offset:1} : null,
        save: async (owner,key,value) => { snapshotWrites.push({owner,key,value}); },
        rememberAccount: async () => {}, forgetAccount: async () => {}
      } };
      EnhanceNCM.sdk.cache.refresh = () => new Promise(resolve => { window.finishRefresh = resolve; });
    ` + source }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#sidebar-created [data-playlist="888"]').waitFor();
    await page.locator('#home-subscribed-grid [data-playlist="889"]').waitFor();
    await page.locator('[data-view="songs"]').click();
    assert.equal(await page.locator('#tracks tr').count(), 0, 'songs shows the current queue, not a cached chart');
    assert.equal(await page.evaluate(() => previewLibrary.calls.some(call => call.name === "listCreated")), false);
    await page.evaluate(() => finishRefresh());
    await page.locator('#sidebar-created [data-playlist="501"]').waitFor();
    await page.locator('#home-subscribed-grid [data-playlist="801"]').waitFor({ state: "attached" });
    await page.locator('#tracks [data-play="999"]').waitFor({ state: "detached" });
    assert.equal(await page.locator('#sidebar-created [data-playlist="888"]').count(), 0);
    assert.equal(await page.locator('#home-subscribed-grid [data-playlist="889"]').count(), 0);
    assert.equal(await page.evaluate(() => snapshotWrites.some(write => write.owner === "42" && write.key === "created")), true);
    assert.equal(await page.evaluate(() => snapshotWrites.some(write => write.owner === "42" && write.key === "subscribed")), true);
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});

test("a different confirmed account removes the previous account's visible snapshot", async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  try {
    const page = await browser.newPage();
    const source = fs.readFileSync(path.join(__dirname, "../src/themes/spotify/standalone.js"), "utf8");
    await page.route("**/standalone.js", route => route.fulfill({ contentType: "text/javascript", body: `
      EnhanceNCM._libraryCache = { snapshot: {
        lastAccount: async () => ({userId:"42",nickname:"旧账号"}),
        read: async (_,key) => key === "created" ? {items:[{id:888,name:"旧账号歌单"}],offset:1}
          : key === "subscribed" ? {items:[{id:889,name:"旧账号收藏"}],offset:1} : null,
        save: async () => {}, rememberAccount: async () => {}, forgetAccount: async () => {}
      } };
      EnhanceNCM.sdk.cache.refresh = () => new Promise(resolve => { window.finishRefresh = resolve; });
      EnhanceNCM.sdk.account.getCurrent = async () => ({userId:"43",profile:{nickname:"新账号"}});
    ` + source }));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#sidebar-created [data-playlist="888"]').waitFor();
    await page.locator('#home-subscribed-grid [data-playlist="889"]').waitFor();
    await page.evaluate(() => finishRefresh());
    await page.locator('#account-name').filter({ hasText: "新账号" }).waitFor();
    assert.equal(await page.locator('#sidebar-created [data-playlist="888"]').count(), 0);
    assert.equal(await page.locator('#home-subscribed-grid [data-playlist="889"]').count(), 0);
    await page.locator('#sidebar-created [data-playlist="501"]').waitFor();
    await page.close();
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
