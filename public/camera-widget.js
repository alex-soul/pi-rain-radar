import {setupFloatingWidget} from './floating-widget.js';
import {createFrameLoader} from './frame-loader.js';
import {cameraAt} from './camera-model.js';
import {formatTime} from './time.js';

const panel=document.getElementById('camera'),picture=document.getElementById('camera-image'),stamp=document.getElementById('camera-time'),name=document.getElementById('camera-source');
const zone=document.querySelector('meta[name="time-zone"]').content;
const loader=createFrameLoader({maxImages:2});
let visible=false,input=null,live=null,liveKey='',desiredKey='',attemptKey='',fetching=false,fetchedAt=0,lastTry=0,paintKey='',revision=0,failedAt=0;
function paint(){
  if(!input)return;
  const now=Date.now(),archive=input.selected?.cameraHistory;
  const row=archive?cameraAt(archive.records??[],input.time*1000):live?.latest&&live.latest.time<=now&&now-live.latest.time<=600000&&live.status?.source===input.status?.camera?.source?live.latest:null;
  const key=visible&&row?.asset?row.asset:'';
  if(!key){if(paintKey){revision++;loader.cancel();}paintKey='';picture.hidden=true;picture.removeAttribute('src');stamp.textContent='';name.textContent='';return;}
  if(paintKey===key&&(!failedAt||now-failedAt<15000))return;
  paintKey=key;failedAt=0;const epoch=++revision;
  picture.hidden=true;picture.removeAttribute('src');stamp.textContent='';name.textContent='';
  void loader.prepare(key).then(image=>{
    if(epoch!==revision||!visible)return;
    if(!image){failedAt=Date.now();return;}
    picture.src=key;picture.hidden=false;
    picture.onload=()=>panel.dispatchEvent(new Event('snapshot-size'));
picture.alt=`Camera snapshot · ${row.data?.name??'Camera'}`;
    name.textContent=row.data?.name??'Camera';
    const label=row.basis==='metadata'?'Captured':'Retrieved';
    stamp.textContent=`${formatTime(row.time/1000,{hour:'2-digit',minute:'2-digit'},zone)}`;
    stamp.dateTime=new Date(row.time).toISOString();stamp.title=`${formatTime(row.time/1000,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'},zone)}`;
  });
  if(archive){const next=(archive.records??[]).find(r=>r.time>row.time);if(next?.asset)void loader.prepare(next.asset,false);}
}
setupFloatingWidget({id:'camera',storageKey:'radar-camera',width:420,height:275,minWidth:200,minHeight:130,maxHeight:640,startX:80,startY:100,onVisibility(value){visible=value;paint();}});
async function refresh(){
  if(fetching||!input?.status||!Number.isFinite(input.status.end))return;
  const key=desiredKey;if(key===attemptKey&&Date.now()-lastTry<15000)return;
  if(Date.now()-lastTry<1000)return;
  fetching=true;attemptKey=key;lastTry=Date.now();
  try{
    const response=await fetch(`/api/camera?hours=${input.hours}&end=${input.status.end}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error();const result=await response.json();
    if(key!==desiredKey)return;live=result;liveKey=key;fetchedAt=Date.now();
  }catch{/* Keep a last-good image only until its own ten-minute expiry. */}
  finally{fetching=false;window.dispatchEvent(new Event('radar-camera-update'));}
}
export function updateCamera(value){
  input=value;desiredKey=`${value.hours}:${value.status?.end}:${value.status?.camera?.source}:${value.status?.camera?.lastSuccess}`;
  void refresh();paint();
  return value.selected?.cameraHistory?.counts??(liveKey===desiredKey&&Date.now()-fetchedAt<45000?live?.counts:null);
}
