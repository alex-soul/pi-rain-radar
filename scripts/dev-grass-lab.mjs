import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {grassDefaults} from '../public/grass-wetness-settings.js';
import {replayGrass,alignedGrass} from '../public/grass-replay.js';

export function grassLabFixture(end=Date.now()){
  const start=end-168*3600000,samples=[];
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
  if(!input||!Number.isInteger(input.intensity)||input.intensity<0||input.intensity>5||!Number.isFinite(input.observedAt)||input.observedAt<0||input.observedAt>now+300000||typeof input.note!=='string'||input.note.length>500)return null;
  return {id:randomUUID(),observedAt:input.observedAt,loggedAt:now,intensity:input.intensity,note:input.note.trim(),synthetic:true};
}
// Local DEV storage only: survives page refresh and is retained in the printed
// fixture directory. It cannot read or write the live appliance.
export async function createGrassLab(directory){
  const file=join(directory,'grass-lab.json');let data;
  try{data=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data=grassLabFixture();await writeFile(file,JSON.stringify(data));}
  if(data.id==='synthetic-72h'){
    // Regenerate illustrative weather, retaining every manually entered record.
    const extended=grassLabFixture(data.end);
    data={...extended,observations:[...extended.observations,...data.observations.filter(o=>!o.id.startsWith('example-'))].sort((a,b)=>a.observedAt-b.observedAt)};
    await writeFile(file+'.tmp',JSON.stringify(data));await rename(file+'.tmp',file);
  }
  let pending=Promise.resolve();
  return async(req,res,path)=>{
    if(!path.pathname.startsWith('/__grass-lab/'))return false;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    if(path.pathname==='/__grass-lab/data'&&req.method==='GET'){send(200,data);return true;}
    if(path.pathname==='/__grass-lab/observations'&&req.method==='POST'){
      if(req.headers['content-type']!=='application/json'||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){send(403,{error:'Use this preview page to save observations.'});return true;}
      let raw='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4096){send(413,{error:'Observation is too large.'});return true;}raw+=chunk;}
      let input;try{input=JSON.parse(raw);}catch{send(400,{error:'Invalid observation.'});return true;}
      const observation=validateLabObservation(input);if(!observation){send(400,{error:'Choose an intensity from 0 to 5 and a valid time.'});return true;}
      const save=pending.then(async()=>{if(data.observations.length>=2000)throw Error('Export observations before adding more.');const next={...data,observations:[...data.observations,observation].sort((a,b)=>a.observedAt-b.observedAt)};await writeFile(file+'.tmp',JSON.stringify(next));await rename(file+'.tmp',file);data=next;});pending=save.catch(()=>{});
      try{await save;send(201,observation);}catch{send(500,{error:'Could not save. Please try again.'});}return true;
    }
    send(404,{error:'Unknown lab route'});return true;
  };
}
