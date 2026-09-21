import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once,EventEmitter} from 'node:events';
import {createHash} from 'node:crypto';
import {cameraAddress,createCameraHttp,digestAuthorization} from '../src/camera-http.js';

async function fixture(t,handle){
  const server=http.createServer(handle);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>{server.closeAllConnections();server.close();});
  let pinned=[];
  const get=createCameraHttp({resolve:async()=>[{address:'192.168.1.50',family:4}],request:(url,options,cb)=>{
    options.lookup('camera.test',{all:true},(error,addresses)=>{assert.ifError(error);pinned.push(addresses[0].address);});
    const local=new URL(url);local.hostname='127.0.0.1';local.port=server.address().port;return http.request(local,options,cb);
  }});
  return {get,pinned};
}
test('camera destination validation blocks loopback, link-local, mapped and public HTTP',async()=>{
  for(const a of ['127.0.0.1','169.254.169.254','::1','fe80::1','ff02::1','0.0.0.0','::ffff:127.0.0.1','::ffff:7f00:1'])assert.equal(cameraAddress(a),'blocked',a);
  for(const a of ['192.168.1.2','10.1.1.1','172.31.1.1','fd01::1','::ffff:c0a8:102'])assert.equal(cameraAddress(a),'lan',a);
  assert.equal(cameraAddress('2001:4860:4860::8888'),'public');
  let requested=false;
  for(const addresses of [[{address:'8.8.8.8',family:4}],[{address:'192.168.1.2',family:4},{address:'127.0.0.1',family:4}]]){
    const get=createCameraHttp({resolve:async()=>addresses,request:()=>{requested=true;}});
    await assert.rejects(get('http://camera.test/image'),{code:'CAMERA_DESTINATION'});
  }
  assert.equal(requested,false);
});
test('None, Basic, URL credentials and Bearer stay backend-only with pinned DNS',async t=>{
  const auth=[];const f=await fixture(t,(req,res)=>{auth.push(req.headers.authorization);res.end('jpeg');});
  for(const [url,a] of [['http://camera.test/image',{mode:'none'}],['http://camera.test/image',{mode:'basic',username:'user',password:'secret'}],['http://user:secret@camera.test/image',{mode:'none'}],['http://camera.test/image',{mode:'bearer',token:'secret'}]])assert.equal((await f.get(url,{auth:a})).toString(),'jpeg');
  assert.deepEqual(auth,[undefined,'Basic dXNlcjpzZWNyZXQ=','Basic dXNlcjpzZWNyZXQ=','Bearer secret']);assert.equal(f.pinned.length,4);
});
test('Digest challenge is bounded and computes RFC auth response with the request URI',async t=>{
  let requests=0;
  const f=await fixture(t,(req,res)=>{
    requests++;if(!req.headers.authorization){res.writeHead(401,{'WWW-Authenticate':'Digest realm="camera", nonce="abc", algorithm=SHA-256, qop="auth"'});res.end();return;}
    const fields=Object.fromEntries([...req.headers.authorization.matchAll(/(\w+)=(?:"([^"]+)"|([^, ]+))/g)].map(m=>[m[1],m[2]??m[3]]));
    const h=s=>createHash('sha256').update(s).digest('hex');
    assert.equal(fields.response,h(`${h('user:camera:secret')}:abc:00000001:${fields.cnonce}:auth:${h('GET:/image?q=1')}`));res.end('jpeg');
  });
  await f.get('http://camera.test/image?q=1',{auth:{mode:'digest',username:'user',password:'secret'}});assert.equal(requests,2);
  assert.throws(()=>digestAuthorization('Digest realm="x", nonce="n", qop="auth-int"',{username:'u',password:'p'},'GET','/'),{code:'CAMERA_AUTH'});
});
test('redirects stay on origin, do not forward credentials, and recheck DNS each hop',async t=>{
  const f=await fixture(t,(req,res)=>{res.writeHead(302,{Location:'http://other.test/snapshot'});res.end();});
  await assert.rejects(f.get('http://camera.test/image',{auth:{mode:'bearer',token:'secret'}}),{code:'CAMERA_REDIRECT'});assert.equal(f.pinned.length,1);
  let resolutions=0,requests=0;
  const g=createCameraHttp({resolve:async()=>[{address:++resolutions===1?'192.168.1.1':'127.0.0.1',family:4}],request:(_u,_o,cb)=>{
    requests++;const r=new EventEmitter();r.end=()=>{const response=new EventEmitter();response.statusCode=302;response.headers={location:'/next'};response.destroy=()=>{};cb(response);};return r;
  }});
  await assert.rejects(g('http://camera.test/image'),{code:'CAMERA_DESTINATION'});assert.equal(requests,1);
});
test('response bytes, slow streams, DNS waits, cancellation and TLS failures are bounded and redacted',async t=>{
  const f=await fixture(t,(req,res)=>{if(req.url==='/big')res.end(Buffer.alloc(2048));else {res.write('x');}});
  await assert.rejects(f.get('http://camera.test/big',{maxBytes:1024}),{code:'CAMERA_SIZE'});
  await assert.rejects(f.get('http://camera.test/slow',{timeoutMs:60}),{code:'CAMERA_TIMEOUT'});
  const c=new AbortController();const pending=f.get('http://camera.test/slow',{signal:c.signal});c.abort();await assert.rejects(pending,{code:'CAMERA_TIMEOUT'});
  const dns=createCameraHttp({resolve:()=>new Promise(()=>{})});
  const keepAlive=setTimeout(()=>{},200);try{await assert.rejects(dns('http://camera.test/',{timeoutMs:30}),{code:'CAMERA_TIMEOUT'});}finally{clearTimeout(keepAlive);}
  const tls=createCameraHttp({resolve:async()=>[{address:'8.8.8.8',family:4}],request:(_u,options)=>{
    assert.equal(options.rejectUnauthorized,true);const req=new EventEmitter();req.end=()=>queueMicrotask(()=>req.emit('error',Object.assign(Error('secret-address-password'),{code:'DEPTH_ZERO_SELF_SIGNED_CERT'})));return req;
  }});
  await assert.rejects(tls('https://camera.test/'),{code:'CAMERA_TLS',message:'CAMERA_TLS'});
});
