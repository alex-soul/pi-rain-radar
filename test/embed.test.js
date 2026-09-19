import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createEmbedSettings,embedDefaults,validEmbedSettings} from '../src/embed-settings.js';
import {createSettingsAuth,settingsRoutes,setPin} from '../src/settings-auth.js';

const config={enabled:true,origins:['http://haos:8123'],hours:4,speed:1.5,theme:'light'};
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'radar-embed-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
test('embed policy rejects unsafe origins and malformed presentation options',()=>{
  assert.ok(validEmbedSettings(config));assert.ok(validEmbedSettings(embedDefaults));
  for(const origin of ['*','http://*.local','http://haos:8123/path','http://haos:8123/','http://user:password@haos:8123','https://haos?x=1','https://haos#x','null','data:text/html,test',"https://a; frame-ancestors *",'http://haos\nhttps://other'])
    assert.equal(validEmbedSettings({...config,origins:[origin]}),false,origin);
  for(const patch of [{enabled:'true'},{origins:[]},{origins:Array(11).fill('http://haos:8123')},{hours:24},{speed:100},{theme:'auto'},{admin:true}])assert.equal(validEmbedSettings({...config,...patch}),false);
});
test('optional settings default disabled, persist atomically and fail closed on corrupt policy',async t=>{
  const dir=await fixture(t),settings=await createEmbedSettings(dir);
  assert.deepEqual(settings.current(),embedDefaults);
  assert.equal((await settings.configure(config)).status,200);
  assert.deepEqual((await createEmbedSettings(dir)).current(),config);
  const file=join(dir,'settings/embed.json'),bytes=await readFile(file,'utf8');await mkdir(file+'.tmp');
  await assert.rejects(settings.configure({...config,hours:6}));
  assert.deepEqual(settings.current(),config);assert.equal(await readFile(file,'utf8'),bytes);
  await writeFile(file,'{"enabled":true,"origins":["*"]}');
  assert.deepEqual((await createEmbedSettings(dir)).current(),embedDefaults);
});
test('embed writes use existing optional PIN and same-origin JSON boundary',async t=>{
  const dir=await fixture(t),auth=createSettingsAuth(dir),embed=await createEmbedSettings(dir),routes=settingsRoutes(auth,null,null,{embed});
  const server=createServer((req,res)=>routes(req,res,new URL(req.url,'http://local').pathname));
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/api/settings/embed`;
  const post=(body,headers={})=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post(config)).status,200);
  assert.equal((await post(config,{Origin:'http://untrusted.example'})).status,403);
  assert.equal((await post(config,{'Content-Type':'text/plain'})).status,403);
  await setPin(dir,'123456');assert.equal((await post(config)).status,401);assert.equal((await fetch(url)).status,401);
  const {token}=await auth.unlock('123456'),headers={Authorization:`Bearer ${token}`};
  assert.equal((await post({...config,origins:[]},headers)).status,400);
  assert.equal((await post({...config,theme:'dark'},headers)).status,200);
  assert.equal((await post({padding:'x'.repeat(4000)},headers)).status,413);
  auth.lock(token);assert.equal((await post(config,headers)).status,401);
});
