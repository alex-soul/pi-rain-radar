import {grassDefaults} from '../public/grass-wetness-settings.js';
import {replayGrass,decimalGrass} from '../public/grass-replay.js';

const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined).map(key=>[key,value[key]]));
const fields=['temperature','dew','wind','irradiance'];
// The supplied tracker records local wall time to the minute. Refuse ambiguous
// or nonexistent London clock times rather than silently choosing a DST offset.
export function trackerTime(date,time,year,timeZone='Europe/London'){
 const match=/^(\d{1,2})\s+([A-Za-z]{3})$/.exec(date.trim()),clock=/^(\d{1,2}):(\d{2})$/.exec(time.trim());
 const month=match?'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').indexOf(match[2]):-1;
 if(!match||!clock||month<0||!Number.isInteger(year))throw Error('Invalid tracker date or time');
 const expected=[year,month+1,Number(match[1]),Number(clock[1]),Number(clock[2])];
 const utc=Date.UTC(year,month,expected[2],expected[3],expected[4]);
 const format=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',hourCycle:'h23'});
 const candidates=[];
 for(const offset of [-120,-60,0,60,120]){
   const instant=utc+offset*60000,parts=Object.fromEntries(format.formatToParts(instant).map(p=>[p.type,p.value]));
   if(['year','month','day','hour','minute'].every((key,i)=>Number(parts[key])===expected[i]))candidates.push(instant);
 }
 if(candidates.length!==1)throw Error('Ambiguous or invalid tracker time: '+date+' '+time);
 return candidates[0];
}
export function importTracker(tracker){
 const observations=[],markers=[];
 for(const [index,row]of tracker.values.entries()){
   if(index===0||row.every(cell=>!String(cell).trim()))continue;
   const [date,time,intensity,pi,note='']=row.map(String);
   const observedAt=trackerTime(date,time,tracker.year,tracker.timeZone);
   const source={type:'spreadsheet',spreadsheetId:tracker.spreadsheetId,range:`${tracker.sheet}!A${index+1}:E${index+1}`,timeZone:tracker.timeZone,precision:'minute',values:row};
   if(intensity.trim()==='--'&&pi.trim()==='--'){
     markers.push({id:`sheet-marker-${index+1}`,time:observedAt,label:note.trim(),source});continue;
   }
   if(!/^[0-5]$/.test(intensity.trim()))throw Error('Invalid observed intensity in row '+(index+1));
   observations.push({id:`sheet-observation-${index+1}`,observedAt,intensity:Number(intensity),reportedPi:/^[0-5]$/.test(pi.trim())?Number(pi):null,note:note.trim(),synthetic:false,source});
 }
 return {observations,markers};
}
export function buildRecordedLab(history,tracker,{verify=true}={}){
 if(!history.presentations?.length)throw Error('No recorded weather snapshots');
 const identities=new Map(),alias=value=>{if(value==null)return value;if(!identities.has(value))identities.set(value,'source-'+(identities.size+1));return identities.get(value);};
 const cleanRow=row=>{const clean=pick(row,['source','value','unit','time','receivedAt','eligible','resetAt','previousPeriod']);if(row?.entity!==undefined)clean.entity=alias(row.entity);return clean;};
 const samples=history.presentations.map(p=>({time:Math.round(p.time*1000),modelVersion:p.grassWetness?.modelVersion??1,snapshot:{location:alias(p.location),connectionRevision:p.connectionRevision??null,policy:{grassWetness:{...grassDefaults,...p.policy?.grassWetness}},rows:Object.fromEntries(fields.map(key=>[key,cleanRow(p.rows?.[key])])),observedRain:cleanRow(p.observedRain)}}));
 // If the export begins mid-run, seed once from the saved reservoir and its
 // provenance. Never seed again at an arbitrary chart-window boundary.
 const first=history.presentations[0].grassWetness,saved=history.presentations[0].grassState;
 let initialState=null;
 if(saved?.sources&&Number.isFinite(saved.moisture)){
   const [inputs,entity,unit,location,revision]=JSON.parse(saved.sources);
   initialState={...pick(saved,['modelVersion','moisture','startedAt','baseline','interrupted']),
     sources:JSON.stringify([inputs.map(([source,id,unit])=>[source,alias(id),unit]),alias(entity),unit,alias(location),revision??null])};
 }else if(Number.isFinite(first?.moisture)&&first.provenance){
   const p=first.provenance,rain=cleanRow(p.rain),inputs=fields.map(key=>cleanRow(p.inputs[key]));
   initialState={modelVersion:first.modelVersion,moisture:first.moisture,startedAt:first.startedAt,
     sources:JSON.stringify([inputs.map(r=>[r.source,r.entity,r.unit]),rain.entity,rain.unit,alias(p.location),p.connectionRevision??null]),
     baseline:{time:rain.receivedAt,total:rain.value*({mm:1,cm:10,in:25.4}[rain.unit]),resetAt:rain.resetAt}};
 }
 const baseline=verify?replayGrass(samples,null,initialState):[];
 let compared=0,maxMoistureError=0,mismatches=0;
 const recorded=history.presentations.map((p,i)=>{
   const original=p.grassWetness,replayed=baseline[i]?.reading;
   if(original&&verify){
     compared++;
     const error=Number.isFinite(original.moisture)&&Number.isFinite(replayed.moisture)?Math.abs(original.moisture-replayed.moisture):0;
     maxMoistureError=Math.max(maxMoistureError,error);
     const originalScore=decimalGrass(original),replayedScore=decimalGrass(replayed);
     const scoreMatches=originalScore===replayedScore||Number.isFinite(originalScore)&&Number.isFinite(replayedScore)&&Math.abs(originalScore-replayedScore)<=1e-10;
     if(!scoreMatches||original.modelVersion!==replayed.modelVersion||error>1e-10||Number.isFinite(original.moisture)!==Number.isFinite(replayed.moisture)||original.eligible!==replayed.eligible||original.intensity!==replayed.intensity||original.startedAt!==replayed.startedAt)mismatches++;
   }
   return {hasEstimate:!!original,time:samples[i].time,value:decimalGrass(original),moisture:original?.moisture??null,reason:original?.reason??'No recorded Grass estimate'};
 });
 if(mismatches)throw Error(`Baseline verification failed: ${mismatches} of ${compared} recorded estimates differ`);
 if(verify&&!compared)throw Error('No recorded Grass estimates to verify');
 const {observations,markers}=importTracker(tracker);
 const transitions=samples.filter((s,i)=>i&&JSON.stringify(s.snapshot.policy.grassWetness)!==JSON.stringify(samples[i-1].snapshot.policy.grassWetness)).map(s=>({time:s.time,parameters:s.snapshot.policy.grassWetness}));
 return {id:'recorded-'+history.capturedAt,label:'Recorded Pi weather',synthetic:false,timeZone:tracker.timeZone,capturedAt:history.capturedAt,appVersion:history.appVersion,
   start:samples[0].time,end:samples.at(-1).time,initialState,initialMoisture:initialState?.moisture??0,modelVersion:samples.at(-1).modelVersion,
   parameters:{...samples.at(-1).snapshot.policy.grassWetness,enabled:true},samples,recorded,observations,markers,transitions,
   validation:{verified:verify,compared,mismatches,maxMoistureError,seededFromBoundary:!!initialState},source:{type:'pi-history-export',requestedStart:history.requestedStart,tracker:tracker.spreadsheetId}};
}
