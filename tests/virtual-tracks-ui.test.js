const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium}=require(process.env.ENHANCENCM_PLAYWRIGHT||'playwright');
const {createServer}=require('../tools/preview-music');
test('large current queue renders a bounded window, scrolls to the end and searches the full queue',async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.ENHANCENCM_CHROMIUM});
 try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#albums button').first().waitFor();
  await page.evaluate(()=>EnhanceNCM.sdk.player.getActiveSession().append(Array.from({length:1000},(_,i)=>({id:9000+i,name:'Track '+i,dt:180000}))));
  await page.locator('[data-view="songs"]').click();
  assert.equal(await page.locator('#tracks').getAttribute('data-total'),'1000');
  assert.ok(await page.locator('#tracks [data-song]').count()<=80);
  await page.locator('#main').evaluate(el=>{el.scrollTop=el.scrollHeight;});
  await page.locator('[data-play="9999"]').waitFor();
  assert.equal(await page.locator('[data-song="9999"]').getAttribute('aria-rowindex'),'1001');
  await page.locator('[data-play="9999"]').click();
  assert.equal(await page.evaluate(()=>EnhanceNCM.sdk.player.getActiveSession().getState().queue.length),1000);
  await page.locator('#search').fill('Track 999');
  assert.equal(await page.locator('#tracks [data-song]').count(),1);
  assert.equal(await page.locator('#tracks [data-song]').getAttribute('data-song'),'9999');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
