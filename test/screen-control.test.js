import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createHmac} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createScreenControl,validScreenCommand} from '../src/screen-control.js';
import {settingsRoutes,createSettingsAuth,setPin} from '../src/settings-auth.js';
async function listen(t,handler){const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));return `http://127.0.0.1:${server.address().port}`;}
test('Screen commands exclude power/state, coercions and invalid ranges',()=>{
 for(const input of [{action:'sleep',value:true},{action:'brightness',value:9},{action:'brightness',value:'50'},{action:'idle_timeout',value:1.5},{action:'automatic_blanking',value:1},{action:'brightness',value:50,extra:1},null])assert.equal(validScreenCommand(input),false);
 for(const [action,value]of [['brightness',10],['brightness',100],['idle_timeout',120],['automatic_blanking',false]])assert.ok(validScreenCommand({action,value}));
});
test('authenticated bridge read-back follows external changes and persistence failure without optimistic echo',async t=>{
 const token='c'.repeat(64);let fail=false,state={protocol:1,brightness:75,idle_timeout:15,automatic_blanking:false,persistence_ok:true,display_on:true};
 const base=await listen(t,async(req,res)=>{
  let body='';for await(const b of req)body+=b;
  assert.equal(req.url,'/screen');assert.equal(req.headers['x-power-signature'],createHmac('sha256',token).update([req.method,req.url,req.headers['x-power-time'],req.headers['x-power-id'],body].join('\n')).digest('hex'));
  if(req.method==='POST'){const c=JSON.parse(body);state[c.action]=c.value;}
  res.writeHead(fail?503:200);res.end(JSON.stringify(state));
 });
 const client=createScreenControl({socketPath:'fixture',tokenFile:'fixture',read:async()=>token,transport:(o,cb)=>request({...o,socketPath:undefined,hostname:'127.0.0.1',port:new URL(base).port},cb)});
 assert.equal((await client.execute({action:'brightness',value:45})).brightness,45);
 state.brightness=60;state.persistence_ok=false;
 const current=await client.status();assert.equal(current.brightness,60);assert.equal(current.persistence_ok,false);assert.equal(current.display_on,undefined);
 fail=true;assert.equal((await client.status()).state,'unavailable');assert.equal((await client.execute({action:'idle_timeout',value:10})).status,503);
 assert.equal((await createScreenControl({socketPath:'',tokenFile:''}).status()).state,'unconfigured');
});
test('Screen routes enforce PIN, session lock, origin and bounded body',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'radar-screen-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const auth=createSettingsAuth(dir),screen={status:async()=>({state:'ready'}),execute:async()=>({status:200})};
 const route=settingsRoutes(auth,null,null,{screen});
 const base=await listen(t,(req,res)=>route(req,res,new URL(req.url,'http://local').pathname));
 const url=base+'/api/settings/screen',post=(body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
 assert.equal((await post('{}',{Origin:'https://foreign.example'})).status,403);
 assert.equal((await post('x'.repeat(257))).status,413);assert.equal((await post('{')).status,400);assert.equal((await post('{}')).status,200);
 await setPin(dir,'123456');assert.equal((await fetch(url)).status,401);assert.equal((await post('{}')).status,401);
 const session=await auth.unlock('123456');assert.equal((await post('{}',{Authorization:`Bearer ${session.token}`})).status,200);
 auth.lock(session.token);assert.equal((await post('{}',{Authorization:`Bearer ${session.token}`})).status,401);
});
