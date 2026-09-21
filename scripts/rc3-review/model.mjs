// Synthetic review contract. No integration transport or credentials live here.
export const fields=['temperature','feels','wind','gust'];
export const units={temperatureUnit:'C',windUnit:'mph',visibilityUnit:'km',pressureUnit:'hPa'};
export const cases={healthy:'Healthy mixed sources',partial:'HA temperature unavailable',offline:'HA unreachable',stale:'HA report older than ten minutes',mismatch:'HA wind unit changed',empty:'HA has no cameras',auth:'HA authentication failed',portrait:'Portrait camera',history:'Historical fallback and unit change'};
export function initial(){return {revision:0,rainviewerCollect:true,rainbowCollect:false,ha:false,haUrl:'http://ha.example:8123',haCollect:false,owm:true,owmCollect:true,source:'openweather',fallback:false,mappings:Object.fromEntries(fields.map(f=>[f,'owm'])),units:{...units},camera:null,cameraEnabled:false,scenario:'healthy',timeline:[]};}
export function frameFor(state,time,historical,comparison='recorded'){
 let config=state,scenario=state.scenario;
 if(historical){
   const rows=state.timeline.filter(r=>r.at<=time);config=rows.at(-1)?.config??state.baseline??state;
   scenario='healthy';
   if(state.scenario==='history'){
     const before=time<state.historyBoundary;
     config={...config,ha:true,haCollect:true,owm:true,owmCollect:true,source:'ha',fallback:true,mappings:Object.fromEntries(fields.map(f=>[f,'ha'])),units:{...units,temperatureUnit:before?'C':'F',windUnit:before?'mph':'km/h'}};
     scenario=before?'partial':'healthy';
   }
 }
 if(comparison==='owm'&&historical)config={...config,source:'openweather'};
 const rows={};
 for(const field of fields){
   const wantsHA=config.source==='ha'&&config.mappings[field]==='ha';
   const unit=field==='temperature'||field==='feels'?config.units.temperatureUnit:config.units.windUnit;
   // The fixture deliberately emits raw C/mph. Never converts HA values.
   const reported=field==='temperature'||field==='feels'?'C':scenario==='mismatch'?'km/h':'mph';
   const mismatch=wantsHA&&reported!==unit;
   const haUsable=config.haCollect||Number.isFinite(config.haStoppedAt)&&time-config.haStoppedAt<600000;
   const failed=wantsHA&&(!config.ha||!haUsable||['offline','auth','stale'].includes(scenario)||scenario==='partial'&&field==='temperature'||mismatch);
   const owmUsable=config.owm&&(config.owmCollect||Number.isFinite(config.owmStoppedAt)&&time-config.owmStoppedAt<1800000);
   const reason=mismatch?'Unit mismatch. Change the unit in Home Assistant or in Settings to match.':!config.haCollect?'HA weather collection disabled':scenario==='stale'?'HA report is older than ten minutes':'HA reading unavailable';
   const fallback=failed&&config.fallback&&owmUsable;
   rows[field]={source:wantsHA&&!failed?'ha':(!wantsHA||fallback)&&owmUsable?'owm':null,fallback,reason:failed?reason:'',unit};
 }
 return {config,rows};
}
