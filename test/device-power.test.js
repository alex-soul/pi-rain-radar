import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDevicePower } from '../src/device-power.js';
import { settingsRoutes, createSettingsAuth, setPin } from '../src/settings-auth.js';

async function listen(t,handler){const server=createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return `http://127.0.0.1:${server.address().port}`;}

test('power client authenticates fixed requests, suppresses duplicates and keeps secrets out of status',async t=>{
 const token='a'.repeat(64),calls=[];
 const base=await listen(t,async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const signed=[req.method,req.url,req.headers['x-power-time'],req.headers['x-power-id'],body].join('\n');
  assert.equal(req.headers['x-power-signature'],createHmac('sha256',token).update(signed).digest('hex'));
  if(req.method==='POST')calls.push(JSON.parse(body).action);
  res.writeHead(req.method==='POST'?202:200,{'Content-Type':'application/json'});res.end(JSON.stringify(req.method==='POST'?{accepted:true}:{protocol:1,version:'1.0.0',pending:false}));
 });
 const client=createDevicePower({socketPath:'fixture',tokenFile:'fixture',read:async()=>token,transport:(options,cb)=>request({...options,socketPath:undefined,hostname:'127.0.0.1',port:new URL(base).port},cb)});
 assert.deepEqual(await client.status(),{state:'ready',version:'1.0.0'});
 const input={action:'restart',requestId:randomUUID()};
 assert.equal((await client.execute(input)).status,202);assert.equal((await client.execute(input)).status,409);
 assert.equal((await client.execute({action:'shell',requestId:randomUUID()})).status,400);
 assert.deepEqual(calls,['restart']);
});

test('missing and broken helper configuration are distinct and cannot execute',async()=>{
 const absent=createDevicePower({socketPath:'',tokenFile:''});assert.equal((await absent.status()).state,'unconfigured');
 const broken=createDevicePower({socketPath:'fixture',tokenFile:'fixture',read:async()=>{throw Error('secret');}});
 assert.equal((await broken.status()).state,'unavailable');assert.equal((await broken.execute({action:'shutdown',requestId:randomUUID()})).status,503);
 assert.equal(JSON.stringify(await broken.status()).includes('secret'),false);
});

test('power routes allow no-PIN operation but enforce configured PIN, CSRF and bounded input',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'radar-power-auth-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const auth=createSettingsAuth(dir),calls=[];
 const power={status:async()=>({state:'ready'}),execute:async input=>{calls.push(input);return {status:202};}};
 const route=settingsRoutes(auth,null,null,{power});
 const base=await listen(t,(req,res)=>route(req,res,new URL(req.url,'http://local').pathname));
 const post=(body,headers={})=>fetch(base+'/api/settings/power',{method:'POST',headers:{'Content-Type':'application/json',...headers},body});
 assert.equal((await post('{}',{Origin:'http://untrusted.example'})).status,403);
 assert.equal((await post('x'.repeat(257))).status,413);assert.equal((await post('{')).status,400);
 assert.equal((await post('{}')).status,202);assert.equal(calls.length,1);
 await setPin(dir,'123456');assert.equal((await post('{}')).status,401);
 assert.equal((await fetch(base+'/api/settings/power')).status,401);
 const unlocked=await auth.unlock('123456');assert.equal((await post('{}',{Authorization:`Bearer ${unlocked.token}`})).status,202);
 auth.lock(unlocked.token);assert.equal((await post('{}',{Authorization:`Bearer ${unlocked.token}`})).status,401);
});
