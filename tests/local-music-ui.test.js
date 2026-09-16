const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.ENHANCENCM_PLAYWRIGHT || 'playwright');
const { createServer } = require('../tools/preview-music');
test('local startup, IPC and dropped files share native playback and survive queue persistence', async () => {
  const server = createServer(); await new Promise(r => server.listen(0,'127.0.0.1',r));
  const browser = await chromium.launch({headless:true,executablePath:process.env.ENHANCENCM_CHROMIUM});
  const page = await browser.newPage(), errors=[];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.locator('#albums button').first().waitFor();
    await page.addScriptTag({url:`http://127.0.0.1:${server.address().port}/local-files.js`});
    await page.evaluate(async()=>{
      const originalFetch=window.fetch;
      window.fetch=(url,...args)=>String(url).startsWith('orpheus://localmusic/lyric?') ? Promise.resolve(new Response('[00:00.00]本地第一行\n[00:08.00]本地第二行')) : originalFetch(url,...args);
      previewNative.startupPath='D:\\音乐\\启动.mp3';
      window.localFiles=EnhanceNCM._localFiles.attach();
      await localFiles.activate();
    });
    await page.locator('#now-title').filter({hasText:'启动'}).waitFor();
    assert.equal(await page.locator('#list-heading').textContent(),'当前歌曲列表');
    let loads=await page.evaluate(()=>previewNative.calls.filter(c=>c.name==='audioplayer.load'));
    assert.equal(loads.at(-1).args[1].type,0); assert.equal(loads.at(-1).args[1].path,'D:\\音乐\\启动.mp3');
    await page.evaluate(()=>previewNative.emit('ipc.onipcmessagerecived',2,['D:\\音乐\\外部.flac','D:\\音乐\\另一首.wav']));
    await page.locator('#now-title').filter({hasText:'外部'}).waitFor();
    assert.equal(await page.locator('#tracks tr').count(),3);
    assert.equal(await page.locator('#now-favorite').isDisabled(),true);
    await page.locator('#tracks tr').first().click({button:'right'});
    assert.equal(await page.locator('[data-song-action="add"]').count(),0);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      const data=new DataTransfer(), file=new File(['test'],'拖入.mp3',{type:'audio/mpeg'});
      Object.defineProperty(file,'path',{value:'D:\\音乐\\拖入.mp3'}); data.items.add(file);
      document.dispatchEvent(new DragEvent('drop',{dataTransfer:data,bubbles:true,cancelable:true}));
    });
    await page.locator('#now-title').filter({hasText:'拖入'}).waitFor();
    await page.locator('#lyrics-toggle').click();
    await page.locator('.lyric-line').filter({hasText:'本地第二行'}).waitFor();
    await page.locator('[data-lyric-time="8"]').click();
    const lyricSeek=await page.evaluate(()=>EnhanceNCM.sdk.playback.getState().current);
    assert.ok(lyricSeek>=8 && lyricSeek<9, `lyric seek advanced outside its first playback tick: ${lyricSeek}`);
    await page.addScriptTag({content:fs.readFileSync('src/sdk/domain/player-persistence.js','utf8')});
    assert.equal(await page.evaluate(()=>{
      const player=EnhanceNCM.sdk.player.getActiveSession();
      const saved=EnhanceNCM._playerPersistence.normalize(player.exportState());
      return saved.queue.length===4 && saved.queue.every(s=>EnhanceNCM.sdk.localMusic.isLocal(s));
    }),true);
    const before=await page.locator('#now-title').textContent();
    await page.evaluate(()=>previewNative.emit('app.onplaylocalmusic','D:\\音乐\\missing.mp3'));
    await page.locator('[role="alert"]').filter({hasText:'无法读取'}).waitFor();
    assert.equal(await page.locator('#now-title').textContent(),before);
    // A slow import must not override a later explicit track selection.
    await page.evaluate(()=>{
      const read=EnhanceNCM.sdk.localMusic.read;
      EnhanceNCM.sdk.localMusic = {...EnhanceNCM.sdk.localMusic, read: p => p.includes('slow') ? new Promise(r=>window.finishLocal=()=>read(p).then(r)) : read};
      previewNative.emit('ipc.onipcmessagerecived',2,'D:\\音乐\\slow.mp3');
    });
    await page.waitForFunction(()=>!!window.finishLocal);
    await page.evaluate(async()=>{
      await EnhanceNCM.sdk.player.getActiveSession().play({id:1,name:'用户选择'}, {queue:[{id:1,name:'用户选择'}]});
      await finishLocal();
    });
    assert.equal(await page.locator('#now-title').textContent(),'用户选择');
    await page.evaluate(()=>localFiles.dispose());
    await page.evaluate(()=>previewNative.emit('ipc.onipcmessagerecived',2,'D:\\音乐\\disposed.mp3'));
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); await new Promise(r=>server.close(r)); }
});
