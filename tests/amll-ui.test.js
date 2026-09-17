const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || 'playwright');

test('AMLL starts on its library, opens lyrics only on request, and preserves SDK playback across views', async () => {
  const server = http.createServer((req, res) => res.end('<!doctype html><body style="margin:0"><div id="host"></div></body>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  const browser = await chromium.launch({ executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      const cover = document.createElement('canvas'); cover.width = cover.height = 300;
      const ctx = cover.getContext('2d'); const gradient = ctx.createLinearGradient(0, 0, 300, 300);
      gradient.addColorStop(0, '#315c91'); gradient.addColorStop(.5, '#b9806b'); gradient.addColorStop(1, '#423251');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 300, 300);
      ctx.fillStyle = '#fffc'; ctx.font = 'bold 40px sans-serif'; ctx.fillText('AMLL', 85, 165);
      const songs = [1, 2].map(id => ({ id, name: id === 1 ? '测试歌曲 · AMLL' : '另一首歌', ar: [{ id: 1, name: '测试歌手' }], al: { name: '测试专辑', picUrl: cover.toDataURL() }, dt: 180000 }));
      const playlists = [101, 102, 103].map((id, index) => ({ id, name: ['推荐歌单 A', '我的歌单 B', '收藏歌单 C'][index], coverImgUrl: cover.toDataURL(), trackCount: 501, creator: { nickname: '音乐爱好者' } }));
      let state = { song: null, queue: [], playback: { current: 0, duration: 0, volume: .5, status: 'idle' }, shuffle: false, repeatOne: false };
      const likedIds = new Set(['1']);
      const subscribers = new Set();
      let windowState = { maximized: false };
      const windowStateListeners = new Set();
      window.calls = [];
      const emit = () => { state = { ...state, playback: { ...state.playback } }; subscribers.forEach(fn => fn(state)); };
      const emitWindowState = () => windowStateListeners.forEach(fn => fn(windowState));
      const player = {
        getState: () => state,
        subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
        async play(song, options) { state = { ...state, song, queue: options.queue, source: options.source, playback: { ...state.playback, status: 'playing', duration: 180, current: 1 } }; window.calls.push('play'); emit(); },
        async toggle() { state.playback.status = state.playback.status === 'playing' ? 'paused' : 'playing'; window.calls.push('toggle'); emit(); },
        async pause() { state.playback.status = 'paused'; emit(); },
        async next() { state.song = songs[1]; window.calls.push('next'); emit(); },
        async previous() { state.song = songs[0]; window.calls.push('previous'); emit(); },
        insertNext(song) { window.calls.push(['insertNext', song.id]); state = { ...state, queue: [state.song, song, ...state.queue.filter(item => String(item.id) !== String(song.id) && (!state.song || String(item.id) !== String(state.song.id)))] }; emit(); },
        async stop() { window.calls.push('stop'); state.playback.status = 'idle'; emit(); },
        async clearSystemMedia() { window.calls.push('clearSystemMedia'); },
        async seek(value) { state.playback.current = value; window.calls.push(['seek', value]); emit(); },
        async setVolume(value) { state.playback.volume = value; window.calls.push(['volume', value]); emit(); },
        setShuffle(value) { state.shuffle = value; emit(); }, setRepeatOne(value) { state.repeatOne = value; emit(); },
        append(items, source) { if (state.source === source) { state.queue = [...state.queue, ...items]; emit(); } },
        connectSystemMedia() { window.calls.push('smtc'); },
        async dispose() { if (window.failDispose) { window.failDispose = false; throw Error('停止播放失败，请重试'); } window.calls.push('dispose'); },
      };
      window.EnhanceNCM = { themes: { register(theme) { window.theme = theme; } }, ui: {
        async setMode(mode) { window.calls.push(mode); },
        openSettings() { window.calls.push('settings'); },
      } };
      window.sdk = {
        player: { createSession: () => player },
        account: { async getCurrent() { return { userId: 123 }; } },
        persistence: { attach() { return {
          async restoreVolume() { window.calls.push('restoreVolume'); },
          async restore(owner) { window.calls.push(['restore', owner]); },
          setVolume: value => player.setVolume(value),
          async prepareExit() { window.calls.push('save'); },
          cancelExit() { window.calls.push('cancelExit'); },
          dispose() { window.calls.push('persistenceDisposed'); },
        }; } },
        songs: { async getLikedIds() { window.calls.push('getLikedIds'); return [...likedIds]; }, async setLiked(id, value) {
          window.calls.push(['setLiked', id, value]); if (value) likedIds.add(String(id)); else likedIds.delete(String(id));
        }, async search(query) { window.calls.push(['search', query]); return { items: songs }; }, async getLyrics(id) {
          if (typeof id !== 'number') throw Error('Expected numeric song ID');
          return { synced: true, lines: [{ time: 0, text: '这是第一行歌词', translation: 'This is the first line' }, { time: 5, text: '音乐在此刻流动' }, { time: 10, text: '下一行随进度高亮' }] };
        } },
        recommendations: {
          async getDailySongs() { return songs; },
          async getRecommendedPlaylists() { return [playlists[0]]; },
          async getPrivateRadar() { return { id: 103, name: '今天的私人雷达', coverImgUrl: cover.toDataURL(), trackCount: songs.length }; },
          async getPrivateRoaming() { return songs; },
          async getHeartMode() { return songs; },
        },
        playlists: {
          async listCreated() { return { items: [playlists[1]], more: false }; },
          async listSubscribed() { return { items: [playlists[2]], more: false }; },
          async get(id) { return playlists.find(item => item.id === id); },
          async getTracks(id, { offset }) { window.calls.push(['tracks', id, offset]); return offset ? [{ ...songs[1], id: 3, name: '分页歌曲' }] : songs; },
          async addTrack(id, songId) { window.calls.push(['addTrack', id, songId]); },
        },
        artwork: { getUrl: url => url }, presentation: { album: song => song.al, artists: song => song.ar.map(a => a.name).join('/'), time: seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` },
        window: {
          async drag() { window.calls.push('drag'); },
          async minimize() { window.calls.push('minimize'); },
          async toggleMaximize() { window.calls.push('toggleMaximize'); windowState = { maximized: !windowState.maximized }; emitWindowState(); },
          async getState() { return windowState; },
          subscribe(listener) { windowStateListeners.add(listener); return () => windowStateListeners.delete(listener); },
          async close() { window.calls.push('close'); },
        },
      };
      window.countSubscribers = () => subscribers.size;
    });
    await page.addScriptTag({ content: fs.readFileSync('build/EnhanceNCM/Themes/AMLL/theme.js', 'utf8') });
    await page.evaluate(() => { window.cleanup = window.theme.mount({ root: document.querySelector('#host').attachShadow({ mode: 'open' }), sdk: window.sdk }); });
    await page.getByRole('heading', { name: 'AMLL Player' }).waitFor();
    await page.getByRole('button', { name: '打开歌单：推荐歌单 A' }).waitFor();
    const recommendedCardText = (await page.getByRole('button', { name: '打开歌单：推荐歌单 A' }).textContent()) || '';
    assert.equal(recommendedCardText.includes('首歌曲'), false);
    assert.equal(recommendedCardText.includes('创建于'), false);
    assert.equal(await page.locator('.amll-window-bar').evaluate(element => getComputedStyle(element).height), '38px');
    assert.equal(await page.locator('.amll-window-brand').count(), 0);
    await page.getByRole('button', { name: 'EnhanceNCM 设置', exact: true }).click();
    assert.ok(await page.evaluate(() => window.calls.includes('settings')));
    await page.getByRole('button', { name: '最大化', exact: true }).click();
    await page.getByRole('button', { name: '还原窗口', exact: true }).waitFor();
    await page.getByRole('button', { name: '还原窗口', exact: true }).click();
    await page.getByRole('button', { name: '最大化', exact: true }).waitFor();
    const windowBar = await page.locator('.amll-window-bar').boundingBox();
    await page.mouse.move(windowBar.x + 300, windowBar.y + 19);
    await page.mouse.down();
    await page.mouse.move(windowBar.x + 314, windowBar.y + 19);
    await page.mouse.up();
    assert.ok(await page.evaluate(() => window.calls.includes('drag')));
    await page.getByRole('button', { name: '最小化', exact: true }).click();
    assert.ok(await page.evaluate(() => window.calls.includes('minimize')));
    // AMLL Player keeps the lyric surface mounted and slides it into view on
    // demand, matching the upstream app instead of mounting a second page.
    assert.equal(await page.locator('.amll-lyric-player').count(), 1);
    assert.equal(await page.getByRole('button', { name: '打开歌词', exact: true }).isDisabled(), true);
    fs.mkdirSync('out/amll-ui', { recursive: true });
    await page.screenshot({ path: 'out/amll-ui/home.png' });
    await page.getByRole('button', { name: '更多选项', exact: true }).click();
    const menuStyle = await page.getByRole('menu').evaluate(element => ({
      inShadowRoot: element.getRootNode() instanceof ShadowRoot,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.equal(menuStyle.inShadowRoot, true);
    assert.notEqual(menuStyle.background, 'rgba(0, 0, 0, 0)');
    await page.getByRole('menuitem', { name: '我的歌单', exact: true }).click();
    await page.getByRole('button', { name: '打开歌单：我的歌单 B' }).waitFor();
    await page.getByRole('button', { name: '更多选项', exact: true }).click();
    await page.getByRole('menuitem', { name: '收藏歌单', exact: true }).click();
    await page.getByRole('button', { name: '打开歌单：收藏歌单 C' }).click();
    await page.getByRole('button', { name: '播放 测试歌曲 · AMLL', exact: true }).click();
    await page.getByRole('button', { name: '取消喜欢当前歌曲', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '取消喜欢当前歌曲', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: '取消喜欢当前歌曲', exact: true }).click();
    await page.getByRole('button', { name: '喜欢当前歌曲', exact: true }).waitFor();
    await page.getByRole('button', { name: '喜欢当前歌曲', exact: true }).click();
    await page.getByRole('button', { name: '取消喜欢当前歌曲', exact: true }).waitFor();
    assert.ok(await page.evaluate(() => window.calls.some(call => Array.isArray(call) && call[0] === 'setLiked' && call[1] === 1 && call[2] === true)));
    assert.ok(await page.evaluate(() => window.calls.some(call => Array.isArray(call) && call[0] === 'setLiked' && call[1] === 1 && call[2] === false)));
    assert.equal(await page.locator('.amll-lyric-player').count(), 1);
    await page.getByRole('button', { name: '加载更多歌曲' }).click();
    await page.getByRole('button', { name: '播放 分页歌曲' }).waitFor();
    await page.screenshot({ path: 'out/amll-ui/playlist.png' });
    await page.getByRole('button', { name: '歌曲操作 测试歌曲 · AMLL', exact: true }).click();
    const trackMenuStyle = await page.getByRole('menu').evaluate(element => ({
      inShadowRoot: element.getRootNode() instanceof ShadowRoot,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.equal(trackMenuStyle.inShadowRoot, true);
    assert.notEqual(trackMenuStyle.background, 'rgba(0, 0, 0, 0)');
    await page.getByRole('menuitem', { name: '播放音乐', exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '歌曲操作 另一首歌', exact: true }).click();
    await page.getByRole('menuitem', { name: '下一首播放', exact: true }).click();
    await page.getByRole('menuitem', { name: '下一首播放', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '歌曲操作 另一首歌', exact: true }).click();
    await page.getByRole('menuitem', { name: '添加到歌单', exact: true }).click();
    const addDialog = page.getByRole('dialog', { name: '添加到歌单' });
    await addDialog.getByRole('button', { name: '我的歌单 B', exact: true }).click();
    await addDialog.getByRole('status').filter({ hasText: '已添加到「我的歌单 B」' }).waitFor();
    assert.ok(await page.evaluate(() => window.calls.some(call => Array.isArray(call) && call[0] === 'insertNext' && call[1] === 2)));
    assert.ok(await page.evaluate(() => window.calls.some(call => Array.isArray(call) && call[0] === 'addTrack' && call[1] === 102 && call[2] === 2)));
    await addDialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '打开歌词', exact: true }).click();
    await page.locator('.amll-lyric-page-opened').waitFor();
    await page.locator('.amll-window-bar-lyrics').waitFor();
    if (await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)) {
      await page.waitForFunction(() => {
        const bar = document.querySelector('#host').shadowRoot.querySelector('.amll-window-bar');
        const style = getComputedStyle(bar);
        return style.opacity === '0' && style.backgroundColor === 'rgba(0, 0, 0, 0)';
      });
      await page.mouse.move(640, 20);
      await page.waitForFunction(() => getComputedStyle(document.querySelector('#host').shadowRoot.querySelector('.amll-window-bar')).opacity === '1');
    }
    const openedLyricPage = page.locator('.amll-lyric-page-opened');
    await openedLyricPage.getByRole('button', { name: '更多选项', exact: true }).click();
    const toast = page.getByText('请右键歌词页任意位置来打开菜单哦！', { exact: true });
    await toast.waitFor();
    const toastStyle = await toast.evaluate(element => {
      const toastElement = element.closest('.Toastify__toast') || element;
      return {
        inShadowRoot: toastElement.getRootNode() instanceof ShadowRoot,
        background: getComputedStyle(toastElement).backgroundColor,
      };
    });
    assert.equal(toastStyle.inShadowRoot, true);
    assert.notEqual(toastStyle.background, 'rgba(0, 0, 0, 0)');
    await openedLyricPage.click({ button: 'right', position: { x: 50, y: 80 } });
    await page.getByRole('menuitem', { name: /上一首/ }).waitFor();
    const lyricMenuStyle = await page.getByRole('menu').evaluate(element => ({
      inShadowRoot: element.getRootNode() instanceof ShadowRoot,
      background: getComputedStyle(element).backgroundColor,
    }));
    assert.equal(lyricMenuStyle.inShadowRoot, true);
    assert.notEqual(lyricMenuStyle.background, 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: '收藏歌单 C' }).waitFor();
    assert.equal(await page.locator('.amll-lyric-player').count(), 1);
    assert.equal(await page.evaluate(() => window.calls.includes('dispose')), false);
    await page.getByRole('button', { name: '队列', exact: true }).click();
    await page.locator('.amll-queue-card').getByText('分页歌曲', { exact: true }).waitFor();
    await page.getByRole('button', { name: '队列', exact: true }).click();
    await page.getByRole('button', { name: '返回首页' }).click();
    for (const recommendation of ['私人雷达', '私人漫游', '心动模式']) {
      await page.getByRole('button', { name: '更多选项', exact: true }).click();
      await page.getByRole('menuitem', { name: recommendation, exact: true }).click();
      await page.getByRole('heading', { name: recommendation, exact: true }).waitFor();
      await page.getByRole('button', { name: '返回首页' }).click();
    }
    await page.getByRole('button', { name: '更多选项', exact: true }).click();
    await page.getByRole('menuitem', { name: '每日推荐', exact: true }).click();
    await page.getByRole('button', { name: '播放 测试歌曲 · AMLL', exact: true }).click();
    await page.getByRole('button', { name: '暂停', exact: true }).first().waitFor();
    assert.equal(await page.locator('.amll-lyric-player').count(), 1);
    await page.getByRole('button', { name: '打开歌词', exact: true }).click();
    await page.getByText('这是第一行歌词', { exact: true }).waitFor();
    const lyricPage = page.locator('.amll-lyric-page-opened');
    await lyricPage.getByRole('button', { name: '暂停', exact: true }).click();
    await lyricPage.getByRole('button', { name: '播放', exact: true }).waitFor();
    await page.getByRole('slider', { name: '播放进度', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await page.getByRole('slider', { name: '音量', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await lyricPage.getByRole('button', { name: '随机播放', exact: true }).click();
    await page.locator('button[aria-label="随机播放"][aria-pressed="true"]').waitFor();
    assert.equal(await lyricPage.getByRole('button', { name: '随机播放', exact: true }).getAttribute('aria-pressed'), 'true');
    await lyricPage.getByRole('button', { name: '单曲循环', exact: true }).click();
    await lyricPage.getByRole('button', { name: '下一首', exact: true }).click();
    await lyricPage.getByRole('button', { name: '上一首', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: '每日推荐', exact: true }).waitFor();
    await page.getByRole('button', { name: '返回首页' }).click();
    await page.getByRole('button', { name: '搜索歌曲', exact: true }).click();
    await page.getByRole('textbox', { name: '搜索歌曲' }).fill('测试');
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByRole('heading', { name: '搜索：测试' }).waitFor();
    await page.getByRole('button', { name: '打开歌词', exact: true }).click();
    await page.waitForTimeout(1200); // Let upstream cover/lyric transitions settle before visual QA.
    await page.screenshot({ path: 'out/amll-ui/desktop.png' });
    await page.setViewportSize({ width: 600, height: 900 });
    await page.locator('.amll-lyric-page-opened').getByRole('button', { name: '播放', exact: true }).waitFor();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: 'out/amll-ui/portrait.png' });
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: '搜索：测试' }).waitFor();
    await page.screenshot({ path: 'out/amll-ui/playlist-portrait.png' });
    await page.getByRole('button', { name: '返回首页' }).click();
    await page.screenshot({ path: 'out/amll-ui/home-portrait.png' });
    const calls = await page.evaluate(() => window.calls);
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'seek' && Math.abs(call[1] - 2.8) < .001));
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'volume' && call[1] === .51));
    assert.ok(calls.includes('smtc') && calls.includes('next') && calls.includes('previous'));
    assert.ok(calls.some(call => Array.isArray(call) && call[0] === 'tracks' && call[1] === 103 && call[2] === 500));
    assert.ok(calls.includes('restoreVolume') && calls.some(call => Array.isArray(call) && call[0] === 'restore' && call[1] === '123'));
    await page.getByRole('button', { name: '关闭网易云音乐', exact: true }).click();
    await page.waitForFunction(() => window.calls.includes('close'));
    await page.evaluate(() => { window.failDispose = true; });
    await page.getByRole('button', { name: '更多选项', exact: true }).click();
    await page.getByRole('menuitem', { name: '返回网易云原版', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '停止播放失败' }).waitFor();
    assert.equal(await page.evaluate(() => window.calls.includes('original')), false);
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: '更多选项', exact: true }).click();
    await page.getByRole('menuitem', { name: '返回网易云原版', exact: true }).click();
    await page.waitForFunction(() => window.calls.includes('original'));
    assert.equal(await page.evaluate(() => window.countSubscribers()), 0);
    assert.equal(await page.locator('.amll-theme').count(), 0);
    await page.evaluate(() => window.cleanup());
    const exitCalls = await page.evaluate(() => window.calls);
    assert.equal(exitCalls.filter(call => call === 'dispose').length, 1);
    assert.ok(exitCalls.indexOf('save') < exitCalls.indexOf('dispose'));
    assert.ok(exitCalls.includes('cancelExit') && exitCalls.includes('persistenceDisposed'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});

test('AMLL keeps account snapshots visible while home and playlist requests revalidate', async () => {
  const server = http.createServer((req, res) => res.end('<!doctype html><body style="margin:0"><div id="host"></div></body>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  server.unref();
  const browser = await chromium.launch({ executablePath: process.env.ENHANCENCM_CHROMIUM || undefined });
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => {
      const cover = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const cachedSong = { id: 901, name: '缓存歌曲', ar: [], al: { name: '缓存专辑', picUrl: cover }, dt: 1000 };
      const freshSong = { id: 902, name: '网络歌曲', ar: [], al: { name: '网络专辑', picUrl: cover }, dt: 1000 };
      const cachedPlaylist = { id: 201, name: '缓存歌单', coverImgUrl: cover, trackCount: 1, creator: { nickname: '快照用户' } };
      const freshPlaylist = { id: 201, name: '网络歌单', coverImgUrl: cover, trackCount: 1, creator: { nickname: '快照用户' } };
      let state = { song: null, queue: [], playback: { current: 0, duration: 0, volume: .5, status: 'idle' }, shuffle: false, repeatOne: false };
      const subscribers = new Set();
      window.calls = []; window.snapshotWrites = []; window.snapshotReads = []; window.cacheRefreshes = 0;
      const emit = () => subscribers.forEach(fn => fn({ ...state, playback: { ...state.playback } }));
      const player = {
        getState: () => state,
        subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
        async play(song, options) { state = { ...state, song, queue: options.queue, source: options.source, playback: { ...state.playback, status: 'playing', duration: 1 } }; emit(); },
        async toggle() {}, async pause() {}, async next() {}, async previous() {}, async seek() {}, async setVolume() {},
        setShuffle(value) { state.shuffle = value; emit(); }, setRepeatOne(value) { state.repeatOne = value; emit(); },
        append() {}, connectSystemMedia() {}, async dispose() {},
      };
      window.resolveHome = null; window.resolveMeta = null; window.resolveTracks = null;
      window.EnhanceNCM = { themes: { register(theme) { window.theme = theme; } }, ui: { async setMode() {} } };
      window.sdk = {
        player: { createSession: () => player },
        account: { async getCurrent() { return { userId: 42, profile: { nickname: '当前账号' } }; } },
        persistence: { attach() { return {
          async restoreVolume() {}, async restore() {}, setVolume: value => player.setVolume(value),
          async prepareExit() {}, cancelExit() {}, dispose() {},
        }; } },
        cache: { async refresh() { ++window.cacheRefreshes; } },
        librarySnapshots: {
          async lastAccount() { return { userId: 42, nickname: '快照用户' }; },
          async read(owner, key) {
            window.snapshotReads.push([String(owner), key]);
            if (key === 'recommended') return { items: [cachedPlaylist], offset: 1, more: false };
            if (key === 'playlist:201') return { meta: { id: 201, name: '缓存歌单', trackCount: 1 }, songs: [cachedSong], offset: 1 };
            return null;
          },
          async save(owner, key, value) { window.snapshotWrites.push({ owner: String(owner), key, value }); },
          async rememberAccount() {}, async forgetAccount() {},
        },
        recommendations: {
          async getRecommendedPlaylists() { return new Promise(resolve => { window.resolveHome = () => resolve([freshPlaylist]); }); },
          async getDailySongs() { return []; },
        },
        playlists: {
          async listCreated() { return { items: [], more: false }; }, async listSubscribed() { return { items: [], more: false }; },
          async get() { return new Promise(resolve => { window.resolveMeta = () => resolve(freshPlaylist); }); },
          async getTracks() { return new Promise(resolve => { window.resolveTracks = () => resolve([freshSong]); }); },
        },
        songs: { async search() { return { items: [], total: 0, more: false }; }, async getLyrics() { return { synced: false, lines: [] }; } },
        artwork: { getUrl: url => url }, presentation: { album: song => song.al, artists: () => '', time: () => '0:01' },
        window: { async drag() {}, async minimize() {}, async toggleMaximize() {}, async close() {} },
      };
    });
    await page.addScriptTag({ content: fs.readFileSync('build/EnhanceNCM/Themes/AMLL/theme.js', 'utf8') });
    await page.evaluate(() => { window.cleanup = window.theme.mount({ root: document.querySelector('#host').attachShadow({ mode: 'open' }), sdk: window.sdk }); });
    await page.getByRole('button', { name: '打开歌单：缓存歌单' }).waitFor();
    assert.equal(await page.evaluate(() => cacheRefreshes), 0);
    await page.evaluate(() => resolveHome());
    await page.getByRole('button', { name: '打开歌单：网络歌单' }).waitFor();
    assert.equal(await page.getByRole('button', { name: '打开歌单：缓存歌单' }).count(), 0);
    await page.getByRole('button', { name: '打开歌单：网络歌单' }).click();
    await page.getByRole('button', { name: '播放 缓存歌曲', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: '缓存歌单' }).count(), 1);
    await page.waitForFunction(() => !!window.resolveMeta);
    await page.evaluate(() => resolveMeta());
    await page.waitForFunction(() => !!window.resolveTracks);
    await page.getByRole('button', { name: '播放 缓存歌曲', exact: true }).waitFor();
    await page.evaluate(() => resolveTracks());
    await page.getByRole('button', { name: '播放 网络歌曲', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '播放 缓存歌曲', exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: '网络歌单' }).count(), 1);
    assert.equal(await page.evaluate(() => cacheRefreshes), 0);
    assert.ok(await page.evaluate(() => snapshotWrites.some(write => write.key === 'recommended')));
    assert.ok(await page.evaluate(() => snapshotWrites.some(write => write.key === 'playlist:201')));
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.cleanup());
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
});
