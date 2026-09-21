import http from 'node:http';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {createHash,randomBytes} from 'node:crypto';

export class CameraError extends Error {
  constructor(code){super(code);this.code=code;}
}
const fail=code=>{throw new CameraError(code);};
export function cameraAddress(address){
  let a=address.toLowerCase();
  if(a.startsWith('::ffff:')){
    const tail=a.slice(7);
    if(tail.includes('.'))return cameraAddress(tail);
    const parts=tail.split(':');
    if(parts.length===2){const n=parseInt(parts[0],16)*65536+parseInt(parts[1],16);return cameraAddress([n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.'));}
  }
  if(isIP(a)===4){
    const [x,y]=a.split('.').map(Number);
    if(x===0||x===127||x===169&&y===254||x>=224)return 'blocked';
    if(x===10||x===172&&y>=16&&y<=31||x===192&&y===168)return 'lan';
    return 'public';
  }
  if(isIP(a)===6){
    // Permit ULA and ordinary global unicast only; reject link-local, loopback,
    // multicast, mapped transition/tunnel and special-purpose prefixes.
    if(/^f[cd]/.test(a))return 'lan';
    if(/^[23]/.test(a)&&!/^2002:/.test(a)&&!/^2001:(?:0*:|db8:|2:|10:|20:)/.test(a))return 'public';
  }
  return 'blocked';
}
export function cameraUrl(value){
  let url;try{url=new URL(value);}catch{fail('CAMERA_URL');}
  if(!['http:','https:'].includes(url.protocol)||url.hash||url.href.length>4096)fail('CAMERA_URL');
  return url;
}
export function digestAuthorization(challenge,{username,password},method,uri){
  if(!/^Digest\s/i.test(challenge??''))fail('CAMERA_AUTH');
  const fields={};
  for(const m of challenge.slice(7).matchAll(/([\w-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g))fields[m[1].toLowerCase()]=(m[2]??m[3]).replace(/\\(.)/g,'$1');
  const algorithm=(fields.algorithm??'MD5').toUpperCase(),base=algorithm.replace(/-SESS$/,'');
  if(!['MD5','SHA-256'].includes(base)||!fields.nonce||fields.realm===undefined||fields.qop&&!fields.qop.split(',').map(x=>x.trim()).includes('auth'))fail('CAMERA_AUTH');
  const hash=s=>createHash(base==='MD5'?'md5':'sha256').update(s).digest('hex');
  const cnonce=randomBytes(16).toString('hex'),nc='00000001';
  let ha1=hash(`${username}:${fields.realm}:${password}`);
  if(algorithm.endsWith('-SESS'))ha1=hash(`${ha1}:${fields.nonce}:${cnonce}`);
  const response=hash(`${ha1}:${fields.nonce}:${fields.qop?`${nc}:${cnonce}:auth:`:''}${hash(`${method}:${uri}`)}`);
  const quote=s=>'"'+String(s).replace(/["\\]/g,'\\$&')+'"';
  return 'Digest '+Object.entries({username,realm:fields.realm,nonce:fields.nonce,uri,response,algorithm,...(fields.opaque?{opaque:fields.opaque}:{}),...(fields.qop?{qop:'auth',nc,cnonce}:algorithm.endsWith('-SESS')?{cnonce}:{})}).map(([k,v])=>`${k}=${['algorithm','qop','nc'].includes(k)?v:quote(v)}`).join(', ');
}

// The injectable resolver/request are for isolated tests, never app settings.
export function createCameraHttp({resolve=lookup,request=(url,options,cb)=>(url.protocol==='https:'?https:http).request(url,options,cb)}={}){
  return async function get(value,{auth={mode:'none'},signal,maxBytes=8*1024*1024,timeoutMs=15000}={}){
    const deadline=AbortSignal.timeout(timeoutMs),abort=signal?AbortSignal.any([signal,deadline]):deadline;
    let url=cameraUrl(value),redirects=0,challenged=false,authorization;
    if(url.username||url.password){
      if(auth.mode!=='none')fail('CAMERA_AUTH_CONFIG');
      try{auth={mode:'basic',username:decodeURIComponent(url.username),password:decodeURIComponent(url.password)};}catch{fail('CAMERA_AUTH_CONFIG');}
      url.username='';url.password='';
    }
    if(auth.mode==='basic')authorization='Basic '+Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
    if(auth.mode==='bearer')authorization='Bearer '+auth.token;
    const cancellable=promise=>new Promise((ok,no)=>{
      const stop=()=>no(new CameraError('CAMERA_TIMEOUT'));
      if(abort.aborted)return stop();abort.addEventListener('abort',stop,{once:true});
      promise.then(ok,no).finally(()=>abort.removeEventListener('abort',stop));
    });
    try{
      for(;;){
        abort.throwIfAborted();
        const hostname=url.hostname.replace(/^\[|\]$/g,'');
        const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await cancellable(resolve(hostname,{all:true,verbatim:true}));
        if(!addresses.length||addresses.length>32||addresses.some(({address})=>cameraAddress(address)==='blocked'||url.protocol==='http:'&&cameraAddress(address)!=='lan'))fail('CAMERA_DESTINATION');
        const selected=addresses[0];
        const result=await new Promise((ok,no)=>{
          const req=request(url,{method:'GET',agent:false,signal:abort,rejectUnauthorized:true,
            lookup:(_host,options,done)=>done(null,...(options.all?[[selected]]:[selected.address,selected.family])),
            headers:{Accept:'image/jpeg, image/png, image/webp, application/json','Accept-Encoding':'identity','Cache-Control':'no-cache',...(authorization?{Authorization:authorization}:{})},maxHeaderSize:16384},res=>{
            if(res.statusCode!==200){res.destroy();return ok({status:res.statusCode,headers:res.headers});}
            if(Number(res.headers['content-length'])>maxBytes||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'){res.destroy();return no(new CameraError('CAMERA_SIZE'));}
            let size=0;const chunks=[];
            res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){res.destroy(new CameraError('CAMERA_SIZE'));return;}chunks.push(chunk);});
            res.on('error',no);res.on('end',()=>ok({status:200,headers:res.headers,bytes:Buffer.concat(chunks,size)}));
          });
          req.on('error',no);req.end();
        });
        if([301,302,303,307,308].includes(result.status)){
          let next;try{next=new URL(result.headers.location,url);}catch{fail('CAMERA_REDIRECT');}
          if(++redirects>2||!result.headers.location||next.origin!==url.origin||next.username||next.password||next.hash)fail('CAMERA_REDIRECT');
          url=next;authorization=auth.mode==='digest'?undefined:authorization;challenged=false;continue;
        }
        if(result.status===401&&auth.mode==='digest'&&!challenged){
          authorization=digestAuthorization(result.headers['www-authenticate'],auth,'GET',url.pathname+url.search);challenged=true;continue;
        }
        if([401,403].includes(result.status))fail('CAMERA_AUTH');
        if(result.status!==200)fail('CAMERA_RESPONSE');
        return result.bytes;
      }
    }catch(e){
      if(e instanceof CameraError)throw e;
      if(abort.aborted)fail('CAMERA_TIMEOUT');
      if(/CERT|TLS|SSL|SELF_SIGNED/.test(e.code??''))fail('CAMERA_TLS');
      fail('CAMERA_CONNECTION');
    }
  };
}
