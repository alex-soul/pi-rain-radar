import {join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {atomicJson,exists,readJson} from './history-files.js';
import {CameraError,cameraUrl,createCameraHttp} from './camera-http.js';
import {decodeCameraImage} from './camera-image.js';
import {historyRows} from './radar-history.js';

const INTERVAL=300000,AGE=600000;
export const cameraMessages={
  CAMERA_URL:'Enter a valid HTTP or HTTPS address.',CAMERA_CONFIG:'Check the camera settings.',
  CAMERA_AUTH_CONFIG:'Use URL credentials or the authentication fields, not both.',
  CAMERA_DESTINATION:'Use a LAN address or public HTTPS. Loopback and link-local addresses are not supported.',
  CAMERA_AUTH:'Camera authentication failed.',CAMERA_TLS:'The HTTPS certificate could not be verified.',
  CAMERA_CONNECTION:'Could not connect to the camera.',CAMERA_TIMEOUT:'The camera request timed out.',
  CAMERA_RESPONSE:'The camera did not return a snapshot.',CAMERA_REDIRECT:'The camera redirected to an unsupported address.',
  CAMERA_SIZE:'The camera response exceeded the supported size.',CAMERA_IMAGE:'The response was not a supported still image.',
  CAMERA_DECODE_TIMEOUT:'The camera image took too long to process.',CAMERA_CANCELLED:'Camera request cancelled.',
  CAMERA_HA:'Could not read the Home Assistant camera list.',CAMERA_BUSY:'A camera request is already running. Try again shortly.',
  CAMERA_DRAFT:'Test the camera again before saving.',CAMERA_STORAGE:'Could not save the camera snapshot.',
};
const errorCode=e=>e?.code==='HA_AUTH'?'CAMERA_AUTH':e?.code?.startsWith('HA_')?'CAMERA_HA':Object.hasOwn(cameraMessages,e?.code)?e.code:'CAMERA_STORAGE';
const text=(value,max=1024)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value);
export function cameraConfig(input){
  if(!input||!['direct','ha'].includes(input.mode)||!text(input.name,80)||!input.name.trim())throw new CameraError('CAMERA_CONFIG');
  const url=cameraUrl(input.url);
  let auth;
  if(input.mode==='ha'){
    if(url.username||url.password||url.search||!text(input.entity,256)||!/^camera\.[a-z0-9_]+$/.test(input.entity??'')||!text(input.token,2048)||!input.token)throw new CameraError('CAMERA_CONFIG');
    auth={mode:'bearer',token:input.token};
  }else{
    const a=input.auth;
    if(!a||!['none','basic','digest','bearer'].includes(a.mode))throw new CameraError('CAMERA_CONFIG');
    auth={mode:a.mode};
    if(['basic','digest'].includes(a.mode)){
      if(!text(a.username)||!a.username||a.username.includes(':')||!text(a.password))throw new CameraError('CAMERA_CONFIG');
      auth.username=a.username;auth.password=a.password;
    }
    if(a.mode==='bearer'){if(!text(a.token,2048)||!a.token)throw new CameraError('CAMERA_CONFIG');auth.token=a.token;}
    if((url.username||url.password)&&a.mode!=='none')throw new CameraError('CAMERA_AUTH_CONFIG');
  }
  return {mode:input.mode,name:input.name.trim(),url:url.href,auth,...(input.mode==='ha'?{entity:input.entity}: {})};
}
const endpoint=(config,path)=>config.url.replace(/\/$/,'')+path;
const imageUrl=config=>config.mode==='ha'?endpoint(config,`/api/camera_proxy/${config.entity}`):config.url;
const identity=config=>{const u=new URL(config.url);u.username='';u.password='';return `${config.mode}:${u.href}:${config.entity??''}`;};
export function cameraCounts(records,start,end){
  const counts={metadata:0,acquisition:0};
  for(const row of records)if(row.time>=start&&row.time<=end&&Object.hasOwn(counts,row.basis))counts[row.basis]++;
  return counts;
}
export function matchCamera(records,time){
  for(let i=records.length-1;i>=0;i--)if(records[i].time<=time)return records[i].time>=time-AGE?records[i]:null;
  return null;
}
export async function cameraHistory(store,end,hours,source){
  if(!Number.isSafeInteger(end)||end<0||!Number.isInteger(hours)||hours<1||hours>24)throw new CameraError('CAMERA_CONFIG');
  const start=Math.max(0,end-hours*3600000),records=await historyRows(store,{kind:'camera',start:Math.max(0,start-AGE),end,...(source?{source,context:source}:{})});
  return {records:records.map(r=>({...r,asset:r.asset?'/archive/'+r.asset:null})),counts:cameraCounts(records,start,end)};
}

export async function createCamera(directory,{store,ha=null,now=Date.now,get=createCameraHttp(),decode=decodeCameraImage,onEvent=()=>{},autoStart=true}={}){
  const folder=join(directory,'settings'),file=join(folder,'camera.json');
  await mkdir(folder,{recursive:true,mode:0o700});
  let saved;
  try{
    saved=await exists(file)?await readJson(file):{version:1,config:null,enabled:false,state:{}};
    if(saved.version!==1||typeof saved.enabled!=='boolean'||saved.config&&!/^[a-f0-9-]{36}$/.test(saved.config.id))throw Error();
    if(saved.config){
      if(ha&&saved.config.mode==='ha'&&saved.config.shared){
        if(!text(saved.config.name,80)||!/^camera\.[a-z0-9_]+$/.test(saved.config.entity??''))throw Error();
      }else saved.config={...cameraConfig({...saved.config,token:saved.config.auth?.token}),id:saved.config.id};
    }
    if(saved.state?.last&&(!Number.isSafeInteger(saved.state.last.time)||!Number.isSafeInteger(saved.state.last.receivedAt)||!['metadata','acquisition'].includes(saved.state.last.basis)||! /^[a-f0-9]{64}$/.test(saved.state.last.hash)))throw Error();
  }catch{
    // A damaged optional-camera configuration must never prevent radar startup.
    // Preserve the file until a successfully tested replacement is explicitly saved.
    saved={version:1,config:null,enabled:false,state:{error:'CAMERA_CONFIG'}};
    onEvent('camera-error');
  }
  let config=saved.config,enabled=saved.enabled,state=saved.state??{},busy=false,controller,operation,closed=false,nextAt=enabled?now():null,draft=null,mutation=false;
  const persist=()=>atomicJson(file,{version:1,config,enabled,state});
  if(ha&&config?.mode==='ha'&&!config.shared&&ha.status().configured){
    // Shared connection was durably imported first. Remove the duplicate token
    // while retaining the camera UUID, state and original archive references.
    config={mode:'ha',name:config.name,entity:config.entity,id:config.id,shared:true};await persist();
  }
  const safe=()=>({configured:!!config,enabled,source:config?.id??null,name:config?.name??null,mode:config?.mode??null,entity:config?.entity??null,authMode:config?.auth?.mode??null});
  function status(){
    const fresh=!!state.last&&state.last.time<=now()&&now()-state.last.time<=AGE;
    return {...safe(),collecting:busy,nextCollection:enabled?nextAt:null,lastAttempt:state.lastAttempt??null,lastSuccess:state.lastSuccess??null,
      snapshotTime:state.last?.time??null,receivedAt:state.last?.receivedAt??null,basis:state.last?.basis??null,width:state.last?.width??null,height:state.last?.height??null,
      fresh,state:!config?'unconfigured':!enabled?'disabled':state.error==='CAMERA_AUTH'?'authentication':state.error?'unavailable':fresh?'fresh':state.last?'stale':'waiting',
      error:state.error?cameraMessages[state.error]??cameraMessages.CAMERA_STORAGE:null,unchanged:!!state.unchanged};
  }
  async function exclusive(task){
    if(busy||mutation||closed)throw new CameraError('CAMERA_BUSY');
    busy=true;controller=new AbortController();
    operation=(async()=>{try{return await task(controller.signal);}finally{busy=false;controller=null;}})();
    return operation;
  }
  async function snapshot(candidate,signal,preview=false){
    const bytes=candidate.shared&&ha?await ha.bytes('/api/camera_proxy/'+candidate.entity,{signal,maxBytes:8*1024*1024}):await get(imageUrl(candidate),{auth:candidate.auth,signal});
    const receivedAt=now();
    return {...await decode(bytes,receivedAt,{signal,preview}),receivedAt};
  }
  async function collect(){
    if(!enabled||!config||busy||mutation||closed||now()<nextAt)return;
    nextAt=now()+INTERVAL;
    const candidate=config;
    await exclusive(async signal=>{
      state.lastAttempt=now();
      try{
        const image=await snapshot(candidate,signal);signal.throwIfAborted();
        const unchanged=state.last?.hash===image.hash&&(image.basis==='acquisition'||state.last.time===image.time);
        if(!unchanged){
          const record={kind:'camera',source:candidate.id,context:candidate.id,time:image.time,receivedAt:image.receivedAt,basis:image.basis,data:{name:candidate.name,width:image.width,height:image.height,hash:image.hash}};
          await store.publish(record,image.bytes);
          state.last={hash:image.hash,time:image.time,receivedAt:image.receivedAt,basis:image.basis,width:image.width,height:image.height};
        }
        state.lastSuccess=image.receivedAt;state.error=null;state.unchanged=unchanged;
        onEvent(unchanged?'camera-unchanged':image.receivedAt-image.time>AGE?'camera-stale':'camera-collected');
      }catch(error){
        if(signal.aborted)return;
        state.error=errorCode(error);onEvent('camera-error',{code:state.error});
      }
      try{await persist();}catch{state.error='CAMERA_STORAGE';onEvent('camera-error',{code:'CAMERA_STORAGE'});}
    });
  }
  async function cancel(){controller?.abort();try{await operation;}catch{/* bounded cancellation */}}
  const timer=autoStart?setInterval(()=>{if(draft&&draft.expires<=now())draft=null;void collect();},1000):null;
  timer?.unref();
  if(autoStart)void collect();
  return {
    status,collect,
    async live(hours=2,end=now()){
      if(![2,4,6].includes(hours)||!Number.isSafeInteger(end)||end<0||end>now())throw new CameraError('CAMERA_CONFIG');
      if(!config)return {records:[],counts:{metadata:0,acquisition:0},latest:null,status:status()};
      const history=await cameraHistory(store,end,hours,config.id),current=now();
      const latest=await store.latest({kind:'camera',source:config.id,context:config.id,start:Math.max(0,current-AGE),end:current});
      return {...history,latest:latest?{...latest,asset:latest.asset?'/archive/'+latest.asset:null}:null,status:status()};
    },
    async discover(input){
      if(ha)return (await ha.discover()).filter(r=>r.id.startsWith('camera.')).map(({id,name})=>({id,name}));
      const c=cameraConfig({...input,mode:'ha',name:'Home Assistant',entity:'camera.discovery'});
      return exclusive(async signal=>{
        const bytes=await get(endpoint(c,'/api/states'),{auth:c.auth,signal,maxBytes:2*1024*1024});
        let states;try{states=JSON.parse(bytes.toString('utf8'));}catch{throw new CameraError('CAMERA_HA');}
        if(!Array.isArray(states)||states.length>20000)throw new CameraError('CAMERA_HA');
        return states.filter(s=>/^camera\.[a-z0-9_]+$/.test(s.entity_id??'')).slice(0,256).map(s=>({id:s.entity_id,name:text(s.attributes?.friendly_name,80)?s.attributes.friendly_name:s.entity_id}));
      });
    },
    async test(input){
      let candidate;
      if(ha&&input?.mode==='ha'){
        if(!ha.status().configured||!text(input.name,80)||!input.name.trim()||!/^camera\.[a-z0-9_]+$/.test(input.entity??''))throw new CameraError('CAMERA_CONFIG');
        candidate={mode:'ha',name:input.name.trim(),entity:input.entity,shared:true};
      }else candidate=cameraConfig(input);
      draft=null;
      return exclusive(async signal=>{
        const image=await snapshot(candidate,signal,true),ticket=randomUUID();signal.throwIfAborted();
        const same=config&&(candidate.shared&&config.shared?candidate.entity===config.entity:!candidate.shared&&!config.shared&&identity(config)===identity(candidate));
        draft={ticket,expires:now()+300000,config:{...candidate,id:same?config.id:randomUUID()},image};
        return {ticket,name:candidate.name,width:image.width,height:image.height,time:image.time,basis:image.basis,receivedAt:image.receivedAt,fresh:now()-image.time<=AGE};
      });
    },
    preview(ticket){return draft&&draft.ticket===ticket&&draft.expires>now()?draft.image.bytes:null;},
    thumbnail(){return typeof state.preview==='string'&&state.preview.length<=65536?Buffer.from(state.preview,'base64'):null;},
    async configure(input){
      if(mutation)throw new CameraError('CAMERA_BUSY');mutation=true;
      try{
        if(input?.remove===true){
          await cancel();const prior={config,enabled,state,nextAt};config=null;enabled=false;state={};nextAt=null;
          try{await persist();}catch(e){({config,enabled,state,nextAt}=prior);throw e;}
          draft=null;return safe();
        }
        if(typeof input?.enabled!=='boolean')throw new CameraError('CAMERA_CONFIG');
        let replacement=null;
        if(input.ticket){if(!draft||draft.ticket!==input.ticket||draft.expires<=now())throw new CameraError('CAMERA_DRAFT');replacement=draft.config;}
        if(!config&&!replacement)throw new CameraError('CAMERA_DRAFT');
        await cancel();
        const prior={config,enabled,state,nextAt};
        config=replacement??config;enabled=input.enabled;
        if(replacement?.id!==prior.config?.id&&replacement)state={};
        if(replacement&&draft.image.thumbnail)state={...state,preview:Buffer.from(draft.image.thumbnail).toString('base64')};
        nextAt=enabled?now():null;
        try{await persist();}catch(e){({config,enabled,state,nextAt}=prior);throw e;}
        draft=null;return safe();
      }finally{mutation=false;void collect();}
    },
    async close(){closed=true;clearInterval(timer);draft=null;await cancel();},
  };
}
