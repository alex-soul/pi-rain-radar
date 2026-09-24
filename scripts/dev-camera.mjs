// Synthetic camera transport only. Reuses the real collector, decoder, SQLite
// publication and Settings routes without contacting a camera or HA instance.
import sharp from 'sharp';
import {join} from 'node:path';
import {createCamera,cameraHistory} from '../src/camera.js';
import {CameraError} from '../src/camera-http.js';
import {createHistoryStore} from '../src/history-store.js';
import {settingsRoutes} from '../src/settings-auth.js';
import {cameraWindowCounts} from '../public/camera-model.js';

export async function createDevCamera(directory,scenario,origin,seedEnd){
  const root=join(directory,'camera-fixture'),store=await createHistoryStore(root);
  // Retained source changes and a missing interval are reviewable before any
  // user configures a Live fixture. No historic credentials are required.
  for(let i=0;i<=288;i++){
    if(i>=30&&i<=35)continue;
    const time=seedEnd-i*300000,source=i>144?'synthetic-old-camera':'synthetic-new-camera';
    const label=i>144?'Previous camera':'Current camera';
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${i>144?'#293f62':'#31564d'}"/><text x="24" y="55" font-size="25" fill="white">SYNTHETIC · ${label}</text><text x="24" y="315" font-size="22" fill="white">${new Date(time).toISOString()}</text><circle cx="${80+i%480}" cy="180" r="35" fill="#b9ba9c"/></svg>`;
    const bytes=await sharp(Buffer.from(svg)).jpeg({quality:85}).toBuffer();
    await store.publish({kind:'camera',source,context:source,time,receivedAt:time,basis:i%2?'metadata':'acquisition',data:{name:label,width:640,height:360}},bytes);
  }
  const get=async(value,{signal})=>{
    const url=new URL(value);
    if(!['camera.example','ha.example'].includes(url.hostname))throw new CameraError('CAMERA_CONNECTION');
    if(scenario()==='camera-auth')throw new CameraError('CAMERA_AUTH');
    if(scenario()==='camera-slow')await new Promise((_,reject)=>{
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);reject(new CameraError('CAMERA_TIMEOUT'));},1500);
      const stop=()=>{clearTimeout(timer);reject(new CameraError('CAMERA_CANCELLED'));};signal?.addEventListener('abort',stop,{once:true});
    });
    if(url.pathname==='/api/states')return Buffer.from(JSON.stringify([{entity_id:'camera.synthetic_drive',attributes:{friendly_name:'Synthetic drive'}}]));
    if(scenario()==='camera-invalid')return Buffer.from('synthetic invalid image');
    const at=new Date(),date=at.toISOString();
    const svg=`<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="540" fill="#253f45"/><rect y="300" width="960" height="240" fill="#31564d"/><path d="M350 540L445 220H510L700 540" fill="#86918c"/><path d="M470 540L475 270" stroke="#d3d5b9" stroke-width="8" stroke-dasharray="30 20"/><rect x="65" y="170" width="190" height="180" fill="#567568"/><path d="M35 170L160 75L280 170Z" fill="#b9ba9c"/><text x="32" y="44" font-family="sans-serif" font-size="26" fill="#fff">SYNTHETIC CAMERA · TEST IMAGE</text><text x="32" y="505" font-family="sans-serif" font-size="21" fill="#fff">${date}</text></svg>`;
    let image=sharp(Buffer.from(svg)).jpeg();
    if(scenario()==='camera-stale'){
      const stale=new Date(at.getTime()-1200000).toISOString().slice(0,19).replace('T',' ').replace(/-/g,':');
      image=image.withExif({IFD2:{DateTimeOriginal:stale,OffsetTimeOriginal:'+00:00'}});
    }
    return image.toBuffer();
  };
  const camera=await createCamera(root,{store,get});
  const auth={authorized:async token=>(await fetch(origin+'/api/settings',{headers:token?{Authorization:'Bearer '+token}:{}})).ok};
  const handle=settingsRoutes(auth,null,null,{camera});
  return {camera,handle,async ready(){
    if(camera.status().configured)return;
    const {ticket}=await camera.test({mode:'direct',name:'Synthetic drive',url:'https://camera.example/snapshot',auth:{mode:'none'}});
    await camera.configure({ticket,enabled:true});
  },async history(end,hours){
    const result=await cameraHistory(store,end,hours);
    if(scenario()==='archive-rollover'){result.records=result.records.filter(r=>r.time>=seedEnd-21600000);result.counts=cameraWindowCounts(result.records,end-hours*3600000,end);}
    return result;
  },async close(){await camera.close();await store.close();}};
}
