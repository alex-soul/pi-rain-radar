import {normalizeHaReading,selectHaReadings,haEntities,filterCurrent} from '../public/weather-policy.js';
import {weatherContext} from './weather-history.js';

// Four mapped sensor states at most, polled independently of browsers and UI.
export async function createHaWeather({ha,settings,weather,store,location,now=Date.now,autoStart=true,onEvent=()=>{}}){
  let saved=await store.weatherState('ha')??{observations:{},nextAttemptAt:0};
  let observations=saved.observations??{},nextAttemptAt=saved.nextAttemptAt??0,busy=false,closed=false,error=null;
  let lastRecord=0,recording=false,dirty=false,suspended=false,generation=0,controller=null;
  let policySignature='',connectionRevision=saved.connectionRevision??ha.status().revision;
  if(connectionRevision!==ha.status().revision){observations={};connectionRevision=ha.status().revision;}
  const policyKey=()=>JSON.stringify([generation,settings.current().revision,settings.current().haCollect,settings.current().mappings,ha.status().revision]);
  const retained=()=>Object.fromEntries(haEntities(settings.current()).filter(entity=>observations[entity]).map(entity=>[entity,observations[entity]]));
  observations=retained();
  await store.saveWeatherState('ha',{observations,nextAttemptAt,connectionRevision});
  policySignature=policyKey();
  const data=()=>{
    const policy=settings.current(),owm=weather.status();
    return {policy,observations:structuredClone(retained()),owm:{configured:owm.configured,data:{current:filterCurrent(owm.data?.current,policy.mappings)},gust:policy.mappings.gust==='owm'?owm.gust:null,fetchedAt:owm.fetchedAt,failures:owm.failures,error:owm.error},rows:selectHaReadings(policy,observations,owm,now())};
  };
  async function record(){
    dirty=true;if(recording||closed||suspended)return;recording=true;
    try{
      // Coalesce concurrent collector/settings completions; never overlap writes.
      while(dirty&&!closed&&!suspended){dirty=false;const time=Math.max(now(),lastRecord+1),snapshot=data();
        await store.put([{kind:'weather',source:'presentation',context:weatherContext(location()),time,receivedAt:time,basis:'acquisition',data:snapshot}]);lastRecord=time;
      }
    }catch{dirty=true;onEvent('storage-error');}finally{recording=false;}
  }
  async function collect(){
    if(closed||busy||suspended)return;
    const policy=settings.current(),key=policyKey();
    if(key!==policySignature){
      policySignature=key;
      if(ha.status().revision!==connectionRevision){observations={};connectionRevision=ha.status().revision;}
    }
    if(!policy.haCollect||!ha.status().configured||!policy.initialized||now()<nextAttemptAt)return;
    const entities=haEntities(policy);
    if(!entities.length)return;
    busy=true;controller=new AbortController();nextAttemptAt=now()+300000;
    try{
      await store.saveWeatherState('ha',{observations,nextAttemptAt,connectionRevision});
      if(closed||key!==policyKey())return;
      const results=await Promise.all(entities.map(async entity=>{
        try{
          const row=await ha.json('/api/states/'+entity,{maxBytes:128*1024,signal:controller.signal});
          if(row?.entity_id!==entity)throw Error('Invalid entity');
          return [entity,normalizeHaReading(row,now())];
        }catch{return [entity,{value:null,unit:null,time:null,receivedAt:now(),basis:'unknown',reason:'HA reading unavailable',attribution:observations[entity]?.attribution??''}];}
      }));
      // Disable/reconfigure while requests run must not publish the old mapping.
      if(closed||key!==policyKey())return;
      observations=Object.fromEntries(results);error=results.every(([,v])=>v.reason)?'HA weather readings unavailable':null;
      await store.saveWeatherState('ha',{observations,nextAttemptAt,connectionRevision});await record();
    }catch{error='Could not save HA weather readings';onEvent('storage-error');}
    finally{busy=false;controller=null;}
  }
  const timer=autoStart?setInterval(()=>{void collect();if(dirty)void record();},1000):null;timer?.unref();
  if(autoStart)void collect();
  return {collect,record,
    suspend(){suspended=true;generation++;controller?.abort();},
    status:()=>({...data(),collecting:settings.current().haCollect,fetching:busy,nextAttemptAt,error}),
    async changed(){
      // Runtime unit changes take effect synchronously via policy validation;
      // collection budgets remain intact when users toggle or edit mappings.
      if(ha.status().revision!==connectionRevision){observations={};connectionRevision=ha.status().revision;}
      observations=retained();
      if(!settings.current().haCollect||!haEntities(settings.current()).length)error=null;
      await store.saveWeatherState('ha',{observations,nextAttemptAt,connectionRevision});
      suspended=false;
      await record();void collect();
    },
    close(){closed=true;controller?.abort();if(timer)clearInterval(timer);},
  };
}
