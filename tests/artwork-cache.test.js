const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const executable=path.resolve('out/artwork-cache-test.exe');
test('native artwork cache serves bounded PNG resources only on an opaque loopback URL', {skip:!fs.existsSync(executable)},async()=>{
 const child=spawn(executable,[],{stdio:['pipe','pipe','inherit']});
 try {
  const url=await new Promise((resolve,reject)=>{let output='';child.stdout.on('data',b=>{output+=b;if(output.includes('\n'))resolve(output.trim());});child.on('error',reject);child.on('exit',c=>{if(!output)reject(Error('exit '+c));});});
  assert.match(url,/^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32}\/[a-f0-9]{64}\.png$/);
  const image=await fetch(url);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
  assert.equal(Buffer.from(await image.arrayBuffer()).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal((await fetch(url,{method:'HEAD'})).status,200);
  assert.equal((await fetch(url,{method:'POST',body:'ignored'})).status,405);
  assert.equal((await fetch(new URL('/wrong.png',url))).status,404);
  const concurrent=await Promise.all(Array.from({length:8},()=>fetch(url)));assert.ok(concurrent.every(r=>r.status===200));
 }finally{child.stdin.end('\n');await new Promise(r=>child.on('exit',r));}
});
