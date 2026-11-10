import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {grassDefaults,grassControls,validateGrassSettings} from '../public/grass-wetness-settings.js';
import {replayGrass,alignedGrass} from '../public/grass-replay.js';

export function grassLabFixture(end=Date.now(),days=7){
  const start=end-days*86400000,samples=[];
  let total=0;
  for(let time=start;time<=end;time+=300000){
    const hour=new Date(time).getUTCHours()+new Date(time).getUTCMinutes()/60;
    const daylight=Math.max(0,Math.sin((hour-6)/12*Math.PI));
    const night=1-daylight,day=Math.floor((time-start)/86400000);
    const temperature=9+daylight*8,dew=temperature-(.2+daylight*4.4+(day===1?.5:0));
    if(day===1&&hour>=14&&hour<16)total+=.12;
    const row=(value,unit)=>({value,unit,source:'ha',entity:'synthetic_'+unit,time,receivedAt:time});
    const snapshot={location:'synthetic-lawn',connectionRevision:1,policy:{grassWetness:{...grassDefaults,enabled:true}},rows:{temperature:row(temperature,'C'),dew:row(dew,'C'),wind:row(2+daylight*5,'mph'),irradiance:row(daylight*470,'W/m²')},observedRain:{eligible:true,value:total,unit:'mm',time,receivedAt:time,entity:'synthetic_rain',resetAt:start-1,previousPeriod:0}};
    samples.push({time,snapshot});
  }
  const recorded=replayGrass(samples),illustration=replayGrass(samples,{...grassDefaults,enabled:true,dew:2.5,air:.75,drainage:.8});
  const observations=samples.filter((s,i)=>i>12&&i%97===30).map((s,i)=>({id:'example-'+i,observedAt:s.time,loggedAt:s.time,intensity:Math.round(alignedGrass(illustration,s.time)?.value??0),note:i===2?'Light fog · illustrative observation':'Illustrative observation',synthetic:true}));
  return {id:'synthetic-168h',label:'Seven days on an illustrative lawn',synthetic:true,start,end,initialMoisture:2.5,modelVersion:1,parameters:{...grassDefaults,enabled:true},samples,recorded,observations};
}
export function validateLabObservation(input,now=Date.now()){
  if(!input||!Number.isInteger(input.intensity)||input.intensity<0||input.intensity>5||!Number.isFinite(input.observedAt)||input.observedAt<0||input.observedAt>now||typeof input.note!=='string'||input.note.length>500||input.id!==undefined&&!/^[\w-]{8,100}$/.test(input.id))return null;
  return {id:input.id??randomUUID(),observedAt:input.observedAt,loggedAt:now,intensity:input.intensity,note:input.note.trim(),synthetic:true};
}
// Local DEV storage only: survives page refresh and is retained in the printed
// fixture directory. It cannot read or write the live appliance.
export async function createGrassLab(directory,{requirePin=false}={}){
  const file=join(directory,'grass-lab.json');let data;
  try{data=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data=grassLabFixture();await writeFile(file,JSON.stringify(data));}
  if(data.id==='synthetic-72h'){
    // Regenerate illustrative weather, retaining every manually entered record.
    const extended=grassLabFixture(data.end);
    data={...extended,observations:[...extended.observations,...data.observations.filter(o=>!o.id.startsWith('example-'))].sort((a,b)=>a.observedAt-b.observedAt)};
    await writeFile(file+'.tmp',JSON.stringify(data));await rename(file+'.tmp',file);
  }
  let pending=Promise.resolve();const tokens=new Set();
  const persist=change=>{const save=pending.then(async()=>{const next=change(data);await writeFile(file+'.tmp',JSON.stringify(next));await rename(file+'.tmp',file);data=next;});pending=save.catch(()=>{});return save;};
  return async(req,res,path)=>{
    if(!path.pathname.startsWith('/__grass-lab/'))return false;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(path.pathname==='/__grass-lab/data'&&req.method==='GET'){send(200,data);return true;}
    if(path.pathname==='/__grass-lab/parameters'&&req.method==='GET'){send(200,{parameters:data.parameters});return true;}
    const match=path.pathname.match(/^\/__grass-lab\/observations\/([\w-]{1,100})$/);
    if(['POST','PATCH','DELETE'].includes(req.method)){
      let foreign=false;try{foreign=!!req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host;}catch{foreign=true;}
      if(req.headers['content-type']!=='application/json'||req.headers['sec-fetch-site']==='cross-site'||foreign){send(403,{error:'Use this preview page to save observations.'});return true;}
      let raw='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4096){send(413,{error:'Observation is too large.'});return true;}raw+=chunk;}
      let input;try{input=JSON.parse(raw);}catch{send(400,{error:'Invalid observation.'});return true;}
      if(path.pathname==='/__grass-lab/unlock'&&req.method==='POST'){
        if(input?.pin!=='123456'){send(401,{error:'PIN not accepted.'});return true;}
        const token=randomUUID();tokens.add(token);send(200,{token});return true;
      }
      if(requirePin&&!tokens.has(req.headers.authorization?.replace(/^Bearer /,''))){send(401,{error:'PIN required.'});return true;}
      if(path.pathname==='/__grass-lab/parameters'&&req.method==='POST'){
        const keys=grassControls.map(([key])=>key),parameters=validateGrassSettings({...input,enabled:data.parameters.enabled});
        if(!input||Array.isArray(input)||!parameters||Object.keys(input).length!==keys.length||!keys.every(key=>Object.hasOwn(input,key))){send(400,{error:'Invalid slider values.'});return true;}
        try{await persist(current=>({...current,parameters}));send(200,{parameters});}catch{send(500,{error:'Could not save.'});}return true;
      }
      if(match&&['PATCH','DELETE'].includes(req.method)){
        const id=match[1],observation=req.method==='PATCH'?validateLabObservation({...input,id}):null;
        if(req.method==='PATCH'&&!observation){send(400,{error:'Choose an intensity from 0 to 5 and a time in the past.'});return true;}
        let saved;
        try{await persist(current=>{
          const existing=current.observations.find(o=>o.id===id);if(!existing)throw Object.assign(Error('Observation no longer exists.'),{status:404});
          saved=observation?{...existing,intensity:observation.intensity,observedAt:observation.observedAt,note:observation.note,editedAt:Date.now()}:null;
          return {...current,observations:current.observations.flatMap(o=>o.id===id?(saved?[saved]:[]):[o]).sort((a,b)=>a.observedAt-b.observedAt)};
        });send(200,saved??{deleted:id});}catch(e){send(e.status??500,{error:e.message});}return true;
      }
      if(path.pathname!=='/__grass-lab/observations'||req.method!=='POST'){send(404,{error:'Unknown lab route'});return true;}
      const observation=validateLabObservation(input);if(!observation){send(400,{error:'Choose an intensity from 0 to 5 and a valid time.'});return true;}
      const save=persist(current=>{const existing=current.observations.find(o=>o.id===observation.id);if(existing){if(['intensity','observedAt','note'].some(key=>existing[key]!==observation[key]))throw Error('Observation ID already used.');return current;}if(current.observations.length>=2000)throw Error('Export observations before adding more.');return {...current,observations:[...current.observations,observation].sort((a,b)=>a.observedAt-b.observedAt)};});
      try{await save;send(201,observation);}catch{send(500,{error:'Could not save. Please try again.'});}return true;
    }
    send(404,{error:'Unknown lab route'});return true;
  };
}
