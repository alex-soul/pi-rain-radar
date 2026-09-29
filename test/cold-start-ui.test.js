import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import vm from 'node:vm';

test('real empty-data startup retains acquiring UI; seeded restart supplies cached frames without a map job',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'radar-cold-start-'));
  const socket=createServer().listen(0,'127.0.0.1');await once(socket,'listening');
  const port=socket.address().port;await new Promise(r=>socket.close(r));
  let child;
  const stop=async()=>{if(child?.exitCode===null){const done=once(child,'exit');child.kill();await done;}};
  t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
  const start=async()=>{
    child=spawn(process.execPath,['src/server.js'],{windowsHide:true,env:{...process.env,DATA_DIR:dir,PORT:String(port),BIND_ADDRESS:'127.0.0.1',RADAR_MANUAL_REFRESH:'1'},stdio:['ignore','pipe','pipe']});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timed out')),20000);child.stdout.on('data',b=>{if(String(b).includes('listening on port')){clearTimeout(timer);resolve();}});child.stderr.resume();child.once('error',reject);child.once('exit',()=>{clearTimeout(timer);reject(Error('Early exit'));});});
    return (await fetch(`http://127.0.0.1:${port}/api/status`)).json();
  };
  const status=await start();assert.equal(status.frames.length,0);assert.ok(!status.mapUpdate.applying);
  const app=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
  const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{addEventListener(){},querySelector:s=>$(id+s)});return nodes.get(id);};
  const ctx=vm.createContext({$,status,displayed:null,sequence:[],historyLoading:false,window:{addEventListener(){}},poll(){}});
  vm.runInContext(app.slice(app.indexOf('let mapUpdateVisible = false;'),app.indexOf('let pollRunning = false;')),ctx);
  ctx.paintMapUpdate(status.mapUpdate);assert.equal($('empty').hidden,false);
  await stop();
  const {createHistoryStore}=await import('../src/history-store.js');const {defaultViews,hash}=await import('../src/map.js');const {default:sharp}=await import('sharp');
  const store=await createHistoryStore(dir),time=Math.floor(Date.now()/600000)*600000-600000; // Safely inside Live publication grace at any clock minute.
  const bytes=await sharp({create:{width:defaultViews.view.width,height:defaultViews.view.height,channels:4,background:'#00000000'}}).png().toBuffer();
  await store.publish({kind:'radar',source:'rainviewer',role:'main',context:hash(defaultViews),time,receivedAt:Date.now(),data:{}},bytes);await store.close();
  const cached=await start();assert.ok(cached.frames.length>0);assert.ok(!cached.mapUpdate.applying);
  ctx.status=cached;ctx.displayed=cached.frames[0];ctx.sequence=cached.frames;ctx.paintMapUpdate(cached.mapUpdate);assert.equal($('empty').hidden,true);
});
