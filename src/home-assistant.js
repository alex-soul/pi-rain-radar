import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {atomicJson,exists,readJson} from './history-files.js';
import {cameraUrl,createCameraHttp} from './camera-http.js';

const INTERVAL=300000;
const fail=code=>Object.assign(new Error(code),{code});
export const haMessages={
  HA_CONFIG:'Enter a Home Assistant address and access token.',
  HA_AUTH:'Home Assistant authentication failed.',
  HA_CONNECTION:'Could not connect to Home Assistant.',
  HA_RESPONSE:'Home Assistant returned an invalid response.',
  HA_BUSY:'Home Assistant is busy. Try again shortly.',
};
function connection(input){
  let url;try{url=cameraUrl(input?.url);}catch{throw fail('HA_CONFIG');}
  if(url.username||url.password||url.search||typeof input.token!=='string'||!input.token||input.token.length>2048||/[\x00-\x20\x7f]/.test(input.token))throw fail('HA_CONFIG');
  return {url:url.href.replace(/\/$/,''),token:input.token};
}
const safeError=e=>fail(e?.code==='CAMERA_AUTH'?'HA_AUTH':e?.code==='HA_RESPONSE'?'HA_RESPONSE':'HA_CONNECTION');

// A single secret owner, independently probed even when no consumer is enabled.
// Consumers receive bytes through bounded, DNS-pinned transport, never a token.
export async function createHomeAssistant(directory,{now=Date.now,get=createCameraHttp(),autoStart=true,beforeChange=()=>{},onChange=()=>{}}={}){
  const folder=join(directory,'settings'),file=join(folder,'home-assistant.json');
  await mkdir(folder,{recursive:true,mode:0o700});
  let config=null,error=null,revision=0,checkedAt=null,nextCheckAt=0,busy=false,mutating=false,removing=false,closed=false;
  const controllers=new Set();
  if(await exists(file)){
    try{const saved=await readJson(file);config=saved.connection?connection(saved.connection):null;revision=Number.isSafeInteger(saved.revision)?saved.revision:0;}
    catch{error='HA_CONFIG';}
  }else{
    // RC2 camera credentials become shared without changing its source identity.
    const cameraFile=join(folder,'camera.json');
    if(await exists(cameraFile))try{
      const saved=await readJson(cameraFile);
      if(saved.config?.mode==='ha'){
        config=connection({url:saved.config.url,token:saved.config.auth?.token});
        await atomicJson(file,{version:1,connection:config});
      }
    }catch{error='HA_CONFIG';}
  }
  async function bytes(path,{signal,maxBytes=2*1024*1024}={},candidate=config){
    if(!candidate||closed)throw fail('HA_CONFIG');
    if(!/^\/api\/(?:$|states(?:\/sensor\.[a-z0-9_]+)?$|camera_proxy\/camera\.[a-z0-9_]+$)/.test(path))throw fail('HA_CONFIG');
    const controller=new AbortController();controllers.add(controller);
    try{return await get(candidate.url+path,{auth:{mode:'bearer',token:candidate.token},maxBytes,signal:signal?AbortSignal.any([signal,controller.signal]):controller.signal});}
    catch(e){throw safeError(e);}finally{controllers.delete(controller);}
  }
  async function json(path,options,candidate){
    const data=await bytes(path,options,candidate);
    try{return JSON.parse(data.toString('utf8'));}catch{throw fail('HA_RESPONSE');}
  }
  async function probe(){
    if(!config||closed||busy||mutating||now()<nextCheckAt)return;
    busy=true;const epoch=revision;nextCheckAt=now()+INTERVAL;
    try{const value=await json('/api/');if(typeof value?.message!=='string')throw fail('HA_RESPONSE');if(epoch===revision){error=null;checkedAt=now();}}
    catch(e){if(epoch===revision){error=e.code??'HA_CONNECTION';checkedAt=now();}}
    finally{busy=false;}
  }
  const status=()=>({configured:!!config&&!removing,url:config?.url??'',revision,checking:busy,error:error?haMessages[error]:null,checkedAt,nextCheckAt:config?nextCheckAt:null,state:!config?'unconfigured':error?'error':checkedAt?'connected':'connecting'});
  const timer=autoStart?setInterval(()=>void probe(),1000):null;timer?.unref();
  if(autoStart)void probe();
  return {
    status,probe,bytes,json,
    async configure(input){
      if(mutating)throw fail('HA_BUSY');
      const candidate=input?.remove===true?null:connection(input);
      mutating=true;
      removing=!candidate;
      try{
        // Save only after a real connection test. Failed replacements preserve
        // the existing credential and consumers; no response body is logged.
        if(candidate){const result=await json('/api/',{},candidate);if(typeof result?.message!=='string')throw fail('HA_RESPONSE');}
        // Disable dependent acquisition durably before removing its credential.
        // Replacement keeps policy; initial setup/re-add never enables it.
        if(!candidate||!config)await beforeChange();
        await atomicJson(file,{version:1,connection:candidate,revision:revision+1});
        for(const controller of controllers)controller.abort();
        config=candidate;revision++;error=null;checkedAt=candidate?now():null;nextCheckAt=now()+INTERVAL;
        await onChange();return status();
      }finally{mutating=false;removing=false;}
    },
    async discover(){
      const rows=await json('/api/states');
      if(!Array.isArray(rows)||rows.length>20000)throw fail('HA_RESPONSE');
      return rows.filter(r=>/^(?:camera|sensor)\.[a-z0-9_]+$/.test(r?.entity_id??'')).map(r=>({id:r.entity_id,name:String(r.attributes?.friendly_name??r.entity_id).slice(0,120),unit:String(r.attributes?.unit_of_measurement??'').slice(0,24),deviceClass:String(r.attributes?.device_class??'').slice(0,40)}));
    },
    close(){closed=true;if(timer)clearInterval(timer);for(const controller of controllers)controller.abort();},
  };
}
