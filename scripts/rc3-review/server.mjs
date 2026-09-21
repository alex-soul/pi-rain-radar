import {reviewHelp} from './help-transform.mjs';
// DEV-only facade: fixed loopback upstream; entered URLs are never fetched.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import sharp from 'sharp';
import {initial,cases,fields} from './model.mjs';
const upstream='http://127.0.0.1:3091',port=3092;
const directory=join(tmpdir(),'pi-rain-radar-rc3-ui-review');await mkdir(directory,{recursive:true});
const file=join(directory,'synthetic-settings.json');
let liveFixture;
async function fixtureWindow(hours=2){
 if(liveFixture?.hours===hours)return structuredClone(liveFixture.window);
 const available=await fetch(upstream+'/api/archive').then(r=>r.json());
 const end=available.times.at(-1);
 const window=await fetch(upstream+`/api/archive?hours=${hours}&end=${end}`).then(r=>r.json());
 liveFixture={hours,window};return structuredClone(window);
}
let state=initial();try{state=JSON.parse(await readFile(file,'utf8'));}catch{}
const cloneConfig=()=>JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(state).filter(([k])=>!['timeline','baseline','historyBoundary'].includes(k)))));
state.rainviewerCollect??=true;state.rainbowCollect??=true;
state.baseline??=cloneConfig();
async function save(){state.revision++;await writeFile(file,JSON.stringify(state));}
const cameraStatus=()=>{const failed=state.camera?.mode==='ha'&&(!state.ha||['offline','auth'].includes(state.scenario));return {configured:!!state.camera,enabled:state.cameraEnabled,source:'review-camera',name:state.camera?.name??'Camera',mode:state.camera?.mode??'direct',authMode:'none',fresh:!!state.camera&&state.cameraEnabled&&!failed,state:!state.camera?'unconfigured':!state.cameraEnabled?'disabled':failed?'unavailable':'fresh',snapshotTime:Date.now(),lastSuccess:Date.now(),nextCollection:Date.now()+300000,basis:'acquisition'};};
const server=createServer(async(req,res)=>{
 const send=(data,status=200,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data);};
 try{
  if(!['127.0.0.1:3092','localhost:3092'].includes(req.headers.host))return send({error:'Loopback only'},403);
  if(req.headers.origin&&!['http://127.0.0.1:3092','http://localhost:3092'].includes(req.headers.origin))return send({error:'Origin rejected'},403);
  const path=new URL(req.url,'http://127.0.0.1:3092').pathname;
  let input={};if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>16384)return send({error:'Too large'},413);}try{input=JSON.parse(body);}catch{input=Object.fromEntries(new URLSearchParams(body));}}
  if(path==='/__review/state'){
   if(req.method==='POST'){
    if(input.action==='ha'){
      if(input.token!=='demo-token')return send({error:'Synthetic review: enter demo-token only. No real credential is accepted.'},400);
      if(input.url&&input.url!=='http://ha.example:8123')return send({error:'Use http://ha.example:8123 in this synthetic review. Real addresses are not contacted.'},400);
      state.ha=true;state.haUrl='http://ha.example:8123';
    }
else if(input.action==='remove-ha'){state.ha=false;state.haCollect=false;}
    else if(input.action==='camera'){
      if(input.mode==='ha'&&!state.ha)return send({error:'Configure Home Assistant in System > API first.'},400);
      state.camera={name:String(input.name||'Camera').slice(0,80),mode:input.mode==='ha'?'ha':'direct',entity:input.entity==='camera.garden'?'camera.garden':'camera.drive',portrait:!!input.portrait};
    }else if(input.action==='delete-camera'){state.camera=null;state.cameraEnabled=false;}
    else if(input.action==='scenario'){
      if(!Object.hasOwn(cases,input.scenario))return send({error:'Unknown case'},400);
      state.scenario=input.scenario;
      if(input.scenario==='history'){const a=await fetch(upstream+'/api/archive').then(r=>r.json());state.historyBoundary=a.times.at(-1)*1000-3600000;}
    }else if(input.action==='settings'){
      if(input.owmCollect===false&&state.owmCollect)state.owmStoppedAt=Date.now();
      if(input.haCollect===false&&state.haCollect)state.haStoppedAt=Date.now();
      for(const k of ['haCollect','owmCollect','cameraEnabled','fallback','rainviewerCollect','rainbowCollect'])if(typeof input[k]==='boolean')state[k]=input[k];
      if(typeof input.timeZone==='string'){try{new Intl.DateTimeFormat('en',{timeZone:input.timeZone});state.timeZone=input.timeZone;}catch{return send({error:'Invalid time zone'},400);}}
      if(['openweather','ha'].includes(input.source))state.source=input.source;
      if(input.mappings)for(const f of fields)if(['ha','owm'].includes(input.mappings[f]))state.mappings[f]=input.mappings[f];
      const valid={temperatureUnit:['C','F'],windUnit:['mph','km/h','m/s','kn'],visibilityUnit:['km','mi'],pressureUnit:['hPa','inHg','mmHg']};
      for(const [k,values] of Object.entries(valid))if(values.includes(input.units?.[k]))state.units[k]=input.units[k];
    }else return send({error:'Unsupported synthetic action'},400);
    state.timeline.push({at:Date.now(),config:cloneConfig()});await save();
   }
   return send(state);
  }
  if(path==='/__review/camera.jpg'){
   const portrait=new URL(req.url,'http://localhost').searchParams.get('portrait')==='1';const w=portrait?360:640,h=portrait?640:360;
   const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#35596b"/><circle cx="100" cy="85" r="35" fill="#eddbaa"/><path d="M0 ${h}V${h*.65}L${w*.4} ${h*.4}L${w} ${h*.75}V${h}" fill="#537d65"/><text x="18" y="32" fill="white" font-family="sans-serif" font-size="18">SYNTHETIC CAMERA</text></svg>`;
   return send(await sharp(Buffer.from(svg)).jpeg().toBuffer(),200,'image/jpeg');
  }
  if(path.startsWith('/__review/')){
   const name=path.slice(10);if(!['prepare.js','shared.js','camera.js','weather.js','review.css','model.mjs','refinements.js','onboarding.js'].includes(name))return send({},404);
   return send(await readFile(new URL(name,import.meta.url)),200,name.endsWith('.css')?'text/css':'text/javascript');
  }
  if(path==='/api/settings/openweather'){if(req.method==='POST'){if(input.apiKey&&input.apiKey!=='0'.repeat(32))return send({error:'Use 32 zeroes as the synthetic key.'},400);if(!state.owm||!input.apiKey)state.owmCollect=false;state.owm=!!input.apiKey;await save();}return send({apiKeyConfigured:state.owm});}
  if(path==='/api/camera'){
   const status=cameraStatus(),portrait=state.scenario==='portrait';const latest=status.fresh?{time:Date.now(),basis:'acquisition',asset:'/__review/camera.jpg?portrait='+Number(portrait),data:{name:status.name,width:portrait?360:640,height:portrait?640:360}}:null;
   return send({status,latest,records:latest?[latest]:[],counts:{metadata:0,acquisition:latest?1:0}});
  }
  // Only synthetic upstream receives requests; credentials entered for new UI never leave this process.
  const method=req.method;const response=await fetch(upstream+req.url,{method,headers:{...(method==='POST'?{'Content-Type':'application/json'}:{}),...(req.headers.authorization?{Authorization:req.headers.authorization}:{})},...(method==='POST'?{body:JSON.stringify(input)}:{})});
  const type=response.headers.get('content-type')??'application/octet-stream';
  if(path==='/api/status'&&response.ok){const data=await response.json();data.camera=cameraStatus();
   // Keep the review's Live animation usable as the original fixed fixture ages.
   // Reuse existing synthetic assets, without reseeding or touching its database.
   if(!data.frames?.length){const f=await fixtureWindow(Number(new URL(req.url,'http://localhost').searchParams.get('hours')??2));const delta=Math.floor(Date.now()/600000)*600-f.end;
    for(const row of f.frames??[])for(const key of ['time','mainTime','overviewTime'])if(Number.isFinite(row[key]))row[key]+=delta;
    for(const row of f.coverage??[])if(Number.isFinite(row.time))row.time+=delta;
    Object.assign(data,{frames:f.frames,coverage:f.coverage,counts:f.counts,playable:f.playable,complete:f.complete,start:f.start+delta,end:f.end+delta,frame:f.frames.at(-1)});
   }
   if(data.weather?.data?.current)Object.assign(data.weather.data.current,{dewPoint:8,visibility:10000,pressure:1014,uvi:3,gustMph:15});if(!state.owm)data.weather={configured:false};else if(!state.owmCollect){if(state.owmStoppedAt&&Date.now()-state.owmStoppedAt<1800000&&data.weather?.data){data.weather.data.current.time=Math.floor(state.owmStoppedAt/1000);data.weather.fetchedAt=state.owmStoppedAt;data.weather.forecastFetchedAt=state.owmStoppedAt;}else data.weather={configured:true,failures:2,error:'Collection disabled',forecastError:'Collection disabled'};}return send(data);}
  if(path==='/api/settings'&&response.ok){const data=await response.json();data.apiKeyConfigured=state.owm;if(state.timeZone&&data.map)data.map.timeZone=state.timeZone;return send(data);}
  if(path==='/'&&response.ok){let text=await response.text();text=text.replace('</head>','<link rel="stylesheet" href="/__review/review.css"></head>');if(state.timeZone)text=text.replace(/name="time-zone" content="[^"]*"/,`name="time-zone" content="${state.timeZone}"`);return send(text,200,type);}
  if(path==='/settings.js'){
   let text=await response.text();text="import {connectionSaved} from '/__review/onboarding.js';\nimport '/__review/prepare.js';\nimport {setupReviewRadar} from '/__review/refinements.js';\n"+text.replace("'./camera-settings-ui.js'","'/__review/camera.js'");
   text=text.replace('setupSettingsHelp(dialog);','');
   text=text.replace('weatherKeyButtons(); }','weatherKeyButtons(); if(!remove)void connectionSaved("owm"); }');
   text=text.replaceAll("$('api-tab-map').click()","$('api-tab-weather').click()");
   text=text.replace('const radarUI=setupRadarSettings(canEdit,request);','const radarUI=setupRadarSettings(canEdit,request); setupReviewRadar(); setupSettingsHelp(dialog);');
   text=text.replace('#external-dialog\'','#external-dialog, #review-camera-dialog, #review-preview-dialog, #review-saved-dialog\'');
   return send(text,200,type);
  }
  if(path==='/weather.js'){
   let text=await response.text();text="import {reviewPreferences,paintReviewReadings} from '/__review/weather.js';\n"+text;
   text=text.replace('const prefs = weatherPreferences();','const prefs = reviewPreferences(now,historical,weatherPreferences());');
   text=text.replace('paintWeatherHealth(operational,historical?Date.now():now);','paintWeatherHealth(operational,historical?Date.now():now);\n  paintReviewReadings(state,now,historical,prefs);');
   return send(text,200,type);
  }
  if(path==='/display.js'){
   let text=await response.text();text="import {shared,change} from '/__review/shared.js';\n"+text;
   text=text.replace(/export function weatherPreferences\(\) \{[^\n]+/,"export function weatherPreferences() { return { ...preferences, ...shared.units, readings:[...preferences.readings] }; }");
   text=text.replace("if (canEdit() && valid.includes(input.value)) { preferences[key] = input.value; persist(); }","if (canEdit() && valid.includes(input.value)) { preferences[key] = input.value; persist(); if(Object.hasOwn(shared.units,key))void change({action:'settings',units:{[key]:input.value}}); }");
   text=text.replace('tempUnit.value = preferences.temperatureUnit;','Object.assign(preferences,shared.units);\n    tempUnit.value = preferences.temperatureUnit;');
   text=text.replace('const gear = document.getElementById(\'settings-toggle\');',`window.addEventListener('review-change',applyWeatherChoices);\n  const gear = document.getElementById('settings-toggle');`);
   return send(text,200,type);
  }
  if(path==='/settings-help.js')return send(reviewHelp(await response.text()),200,type);
  if(path==='/camera-widget.js'){
   let text=await response.text();text=text.replace('`${label} ${formatTime(row.time/1000,', '`${formatTime(row.time/1000,');
   text=text.replace("picture.src=key;picture.hidden=false;","picture.src=key;picture.hidden=false;\n    picture.onload=()=>panel.dispatchEvent(new Event('snapshot-size'));\n");
   return send(text,200,type);
  }
  if(path==='/floating-widget.js'){
   let text=await response.text();text=text.replace('function layout() {',`function aspect(){const image=id==='camera'?panel.querySelector('img'):null;return image&&!image.hidden&&image.naturalWidth?image.naturalWidth/image.naturalHeight:null;}
function layout() {`);
   text=text.replace('place(position?.x ?? startX, position?.y ?? startY);',`const ratio=aspect();if(ratio){const extra=panel.querySelector('.camera-caption').offsetHeight+2;const w=Math.min(preferredWidth,innerWidth-16,Math.max(20,footerTop-16-extra)*ratio+2,640,(maxHeight-extra)*ratio+2);panel.style.width=w+'px';panel.style.height=((w-2)/ratio+extra)+'px';}
  place(position?.x ?? startX, position?.y ?? startY);`);
   text=text.replace('preferredWidth = Math.max(minWidth, Math.min(640, width));',`const ratio=aspect();if(ratio&&Math.abs(height-panel.offsetHeight)>Math.abs(width-panel.offsetWidth))width=(height-panel.querySelector('.camera-caption').offsetHeight-2)*ratio;
  preferredWidth = Math.max(minWidth, Math.min(640, width));`);
   text=text.replace('window.addEventListener("resize", layout);','window.addEventListener("resize", layout);\npanel.addEventListener("snapshot-size",layout);');return send(text,200,type);
  }
  if(path==='/app.js'){let text=await response.text();text="import {reviewWeatherCredit} from '/__review/weather.js';\n"+text;text=text.replace("!weatherCreditVisible({dockExpanded:","!reviewWeatherCredit({dockExpanded:");return send(text,200,type);}
  const body=Buffer.from(await response.arrayBuffer());res.writeHead(response.status,{'Content-Type':type,'Cache-Control':'no-store'});return res.end(body);
 }catch{if(!res.headersSent)send({error:'Review fixture unavailable. Keep the original DEV server on port 3091 running.'},502);else res.end();}
});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({review:`http://127.0.0.1:${port}`,studio:`http://127.0.0.1:${port}/__dev`,directory,pid:process.pid})));
