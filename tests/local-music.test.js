const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function fixture(options={}) {
  const callbacks=new Map(),calls=[];
  const context={URL,setTimeout,clearTimeout,fetch:async()=>{if(options.failFetch)throw Error('missing');return {ok:true,text:async()=> '[00:01.00]first\n[00:03.50]second'};},EnhanceNCM:{_native:{
    subscribe(name,fn){callbacks.set(name,fn);return()=>callbacks.delete(name);},
    async callArgs(name,args){calls.push({name,args});
      if(name==='os.isFileExist')return options.exists!==false;
      if(name==='storage.readfromfile')callbacks.get('storage.onreadfromfiledone')(args[0],0,'\uFEFF[00:02.00]sidecar');
      if(name==='musiclibrary.readMusicInfo')callbacks.get('musiclibrary.onreadmusicinfo')(args[0],args[1],0,{title:'tag',artist:'artist',duration:20000,bitrate:320});
    }
  }}};
  for(const file of ['lyrics','local-music'])vm.runInNewContext(fs.readFileSync(`src/sdk/domain/${file}.js`,'utf8'),context);
  return {api:context.EnhanceNCM._localMusic,calls,callbacks};
}
test('local paths preserve Unicode and separate IDs from online songs',async()=>{
 const {api}=fixture();const song=await api.read('D:\\音乐\\歌曲 #1.flac');
 assert.equal(song.name,'tag');assert.equal(song.dt,20000);assert.equal(api.isLocal(song),true);
 assert.equal(api.getArtwork(song),'orpheus://localmusic/pic?D:%5C%E9%9F%B3%E4%B9%90%5C%E6%AD%8C%E6%9B%B2%20%231.flac');
 assert.equal(api.normalizePath('file:///D:/music/a%20b.mp3'),'D:\\music\\a b.mp3');
 for(const value of ['https://example.com/a.mp3','relative.mp3','D:\\app.exe'])assert.throws(()=>api.normalizePath(value));
 assert.equal(api.paths(['D:\\a.mp3','d:\\a.mp3']).length,1);
});
test('original local lyric protocol shares timed lyric parser',async()=>{
 const {api}=fixture();const lyrics=await api.getLyrics(api.create('D:\\a.flac'));
 assert.equal(lyrics.synced,true);assert.deepEqual(Array.from(lyrics.lines,x=>[x.time,x.text]),[[1,'first'],[3.5,'second']]);
});
test('same-name sidecar fallback handles BOM and missing lyrics without an online request',async()=>{
 const {api,calls,callbacks}=fixture({failFetch:true});
 const result=await api.getLyrics(api.create('D:\\song.flac'));
 assert.equal(result.lines[0].text,'sidecar');assert.equal(result.lines[0].time,2);
 assert.deepEqual(Array.from(calls.find(x=>x.name==='storage.readfromfile').args).slice(1),['D:\\song.lrc',true,'abs']);
 assert.equal(callbacks.size,0);
 const missing=fixture({failFetch:true,exists:false});
 assert.equal((await missing.api.getLyrics(missing.api.create('D:\\none.flac'))).lines.length,0);
});
