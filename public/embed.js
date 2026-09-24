import {createFrameLoader} from './frame-loader.js';
import {mapObservation,playbackState,frameProvider} from './playback.js';
import {radarSourceHealth} from './health.js';
import {liveDueThrough} from './live-window.js';
import {formatTime} from './time.js';

const meta=name=>document.querySelector(`meta[name="${name}"]`).content;
const hours=Number(meta('embed-hours')),speed=Number(meta('embed-speed'));
const loader=createFrameLoader(),radar=document.getElementById('radar'),led=document.getElementById('embed-status');
let frames=[],pending=null,index=0,revision=0,status=null,reachable=true,clock=null,polling=false,key='';
const now=()=>clock?clock.time+performance.now()-clock.received:Date.now();
function health() {
  const [level,label]=radarSourceHealth(status?.sources?.main,reachable,now());
  led.dataset.health=level;led.title=label;led.setAttribute('aria-label',label);
}
function credit() {
  const source=mapObservation(frames,index,'main')?.source??frameProvider(frames[index],'main')??status?.sources?.main?.source;
  const providers=new Set(source?[source]:[]);
  const nodes=[];
  for(const [id,name,url] of [['rainviewer','RainViewer','https://www.rainviewer.com/'],['rainbow','Rainbow','https://rainbow.ai/']])if(providers.has(id)) {
    if(nodes.length)nodes.push(document.createTextNode(' & '));
    const a=document.createElement('a');a.textContent=name;a.href=url;a.target='_blank';a.rel='noopener noreferrer';nodes.push(a);
  }
  document.getElementById('radar-credit').replaceChildren(...nodes);
}
function show() {
  const epoch=++revision,observation=mapObservation(frames,index,'main');
  credit();const time=document.getElementById('embed-time');time.textContent='—';time.removeAttribute('datetime');
  if(!observation){radar.removeAttribute('href');return;}
  if(radar.getAttribute('href')!==observation.url)radar.style.visibility='hidden';
  void loader.prepare(observation.url).then(image=>{
    if(epoch!==revision)return;
    radar.style.visibility=image?'visible':'hidden';
    if(image){radar.setAttribute('href',observation.url);time.textContent=formatTime(observation.time,{hour:'2-digit',minute:'2-digit'},meta('time-zone'));time.dateTime=new Date(observation.time*1000).toISOString();}else radar.removeAttribute('href');
  });
  for(let offset=1;offset<=2;offset++) {
    const next=mapObservation(frames,(index+offset)%frames.length,'main');
    if(next)void loader.prepare(next.url,false);
  }
}
function adopt(next,preserve=false) {
  const time=frames[index]?.time;frames=next;
  index=preserve&&time?Math.max(0,frames.findIndex(f=>f.time>=time)):0;
  credit();show();
}
function tick() {
  if(playbackState(true,frames.length)==='playing') {
    if(index===frames.length-1&&pending){adopt(pending);pending=null;}
    else {index=(index+1)%frames.length;show();}
  }
  setTimeout(tick,(index===frames.length-1?1600:650)/speed);
}
async function poll() {
  if(polling)return;polling=true;
  try {
    const response=await fetch(`/api/status?hours=${hours}`,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error();
    const result=await response.json();
    if(result.mapId!==meta('map-id')||result.appVersion!==meta('app-version')){location.reload();return;}
    status=result;reachable=true;clock={time:result.serverTime??Date.now(),received:performance.now()};
    // Keep gap timestamps for shared Live borrowing, but never decode Overview images.
    const offered=(result.frames??[]).map(f=>({...f,overviewUrl:null}));
    const nextKey=JSON.stringify([result.end,offered.map(f=>[f.time,f.url,f.source])]);
    if(key!==nextKey) {
      const next=await loader.load(offered);
      next.borrowFrames=(result.borrowFrames??[]).map(f=>({...f,overviewUrl:null}));next.end=result.end;
      key=nextKey;
      const previous=new Set(frames.map(f=>f.time));
      if(frames.length>=2&&next.filter(f=>previous.has(f.time)).length>=2&&next.some(f=>!previous.has(f.time))) {
        pending=next;
        const retained=next.filter(f=>previous.has(f.time));retained.borrowFrames=next.borrowFrames;retained.end=next.end;adopt(retained,true);
      }else{pending=null;adopt(next,true);}
    }
  }catch{reachable=false;}finally{polling=false;health();}
}
setInterval(()=>{
  health();
  if(!clock)return;
  const end=liveDueThrough(now()/1000),start=end-hours*3600;
  if(end===frames.end)return;
  const next=frames.filter(f=>f.time>=start&&f.time<=end);
  next.borrowFrames=[...(frames.borrowFrames??[]),...frames].filter(f=>f.time>=start-1800&&f.time<start);next.end=end;
  pending=null;adopt(next,true);
},1000);
setInterval(poll,15000);void poll();tick();
