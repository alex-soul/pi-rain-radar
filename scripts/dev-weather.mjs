import {join} from 'node:path';
import {createHistoryStore} from '../src/history-store.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {advanceGrassWetness} from '../src/grass-wetness.js';
import {weatherFields,selectHaReadings,filterCurrent,haEntities,canonicalUnit,selectObservedRain} from '../public/weather-policy.js';
const sensors=[{id:'sensor.demo_temperature',name:'Demo temperature',unit:'°C'},{id:'sensor.demo_feels',name:'Demo feels like',unit:'°C'},{id:'sensor.demo_wind',name:'Demo wind',unit:'mph'},{id:'sensor.demo_gust',name:'Demo gust',unit:'mph'},...Object.entries({humidity:['%',65],dew:['°C',8],direction:['°',245],visibility:['km',8],pressure:['hPa',1012],uv:['',3],irradiance:['W/m²',120]}).map(([field,[unit,value]])=>({id:'sensor.demo_'+field,name:'Demo '+field,unit,value}))];
// Real policy module, synthetic connections/observations. Never forwards keys,
// discovery or weather acquisition to a real provider.
sensors.push({id:'sensor.demo_rain_total',name:'Demo accumulated rain',unit:'mm',deviceClass:'precipitation',stateClass:'total_increasing',value:2.75});
// Deliberately illustrative scores, unrelated to the model or other weather readings.
export function grassPreviewHistory(template,end){
 const start=end-86400,levels=[0,1,2,3,4,5,4,3,2,1],presentations=[];
 for(let at=start;at<=end;at+=300){
  const snapshot=structuredClone(template),ms=at*1000;
  for(const observation of Object.values(snapshot.observations)){observation.time=ms;observation.receivedAt=ms;if(observation.resetAt)observation.resetAt=ms-3600000;}
  snapshot.observedRain=selectObservedRain(snapshot.policy,snapshot.observations,ms);
  snapshot.grassWetness={...snapshot.grassWetness,eligible:true,intensity:levels[Math.floor((at-start)/1200)%levels.length],calculatedAt:ms,startedAt:start*1000,modelVersion:'dev-visual-only',reason:'Synthetic visual preview · illustrative score, not calculated from weather.'};
  presentations.push({...snapshot,time:at});
 }
 return presentations;
}
export async function createDevWeather(directory,previewEnd=Math.floor(Date.now()/600000)*600){
  const store=await createHistoryStore(join(directory,'weather-fixture'));
  const settings=await createWeatherSettings(store,{settingsFile:join(directory,'weather-fixture','policy.json'),owmEnabled:true});
  let owm=true,ha=true,lastCurrent=null,lastForecast=[],fetchedAt=null,forecastFetchedAt=null,activeScenario='healthy',grassState=null,grassHistory=[],visualHistory=null;
  return {close:()=>store.close(),history:()=>({presentations:structuredClone(visualHistory??grassHistory),policies:[],weather:[],forecasts:[]}),
    async configure(path,input){
      if(path.endsWith('/initialize')){const wasInitialized=settings.current().initialized;const result=await settings.initialize(input.units);if(!wasInitialized&&result.status===200&&(activeScenario.startsWith('ha-')||activeScenario.startsWith('grass-')||activeScenario==='rc2-review'))await this.scenario(activeScenario);return {status:result.status,...settings.current()};}
      if(path.endsWith('/weather'))return input?settings.configure(input):{status:200,...settings.current()};
      if(path.endsWith('/entities'))return {status:200,entities:settings.current().haCollect?sensors:[]};
      if(path.endsWith('/home-assistant')){if(input){ha=!input.remove;if(!ha)await settings.configure({haCollect:false});}return {status:200,configured:ha,url:ha?'http://synthetic-home-assistant.invalid':'',state:ha?'connected':'unconfigured'};}
      if(path.endsWith('/openweather')){if(input){const hadKey=owm;owm=!!input.apiKey;if(!hadKey||!owm)await settings.configure({owmCollect:false,forecastCollect:false,fallback:false});}return {status:200,apiKeyConfigured:owm};}
    },
    async scenario(id){
      // Selecting a scenario resets its synthetic connection; manual key edits do not.
      activeScenario=id;grassState=null;grassHistory=[];visualHistory=null;owm=id!=='no-key';if(id.startsWith('ha-')||id.startsWith('grass-')||id==='rc2-review')ha=true;
      if(id==='no-key'){owm=false;await settings.configure({owmCollect:false,forecastCollect:false,fallback:false});return;}
      const mappings=Object.fromEntries(weatherFields.map(field=>[field,field==='irradiance'?'disabled':'owm']));
      if((id.startsWith('ha-')||id.startsWith('grass-')||id==='rc2-review'))Object.assign(mappings,{temperature:sensors[0].id,feels:sensors[1].id});
      if(id==='ha-all-readings'||id.startsWith('grass-'))for(const field of weatherFields)mappings[field]='sensor.demo_'+field;
      if(id==='disabled-readings')for(const field of ['gust','humidity','dew','direction','visibility','pressure','uv'])mappings[field]='disabled';
      // Initialize only through the connecting browser, just like the product.
      if((id.startsWith('ha-')||id.startsWith('grass-')||id==='rc2-review')&&!settings.current().initialized)return;
      await settings.configure({owmCollect:owm,forecastCollect:owm,haCollect:(id.startsWith('ha-')||id.startsWith('grass-')||id==='rc2-review'),mappings,fallback:id==='ha-fallback',grassWetness:{enabled:id.startsWith('grass-')},rainAccumulation:id.startsWith('grass-')?'sensor.demo_rain_total':'disabled'});
    },
    status(weather,id){
      const policy=settings.current(),now=Date.now();
      if(policy.owmCollect){lastCurrent=weather.data?.current??null;fetchedAt=weather.fetchedAt;}
      if(policy.forecastCollect){lastForecast=weather.data?.minutely??[];forecastFetchedAt=weather.forecastFetchedAt;}
      const observations=Object.fromEntries(haEntities(policy).map(entity=>[entity,{value:sensors.find(s=>s.id===entity)?.value??(entity===sensors[1].id?20:21),unit:id==='ha-unit-mismatch'?'F':canonicalUnit(sensors.find(s=>s.id===entity)?.unit),time:now,receivedAt:now,basis:'ha-reported',reason:id==='ha-missing'||id==='ha-fallback'?'HA reading unavailable':null,attribution:'Synthetic Home Assistant'}]));
      if(observations['sensor.demo_rain_total'])Object.assign(observations['sensor.demo_rain_total'],{unit:'mm',stateClass:'total_increasing',resetAt:new Date(now).setHours(0,0,0,0),previousPeriod:1.25});
      const value={...weather,configured:owm&&id!=='no-key',enabled:policy.owmCollect,forecastEnabled:policy.forecastCollect,fetchedAt,forecastFetchedAt,data:{current:filterCurrent(lastCurrent,policy.mappings),minutely:lastForecast},presentation:{policy,observations,observedRain:selectObservedRain(policy,observations,now)}};
      if(policy.grassWetness?.enabled){
        const samples=grassState?[now]:Array.from({length:13},(_,i)=>now-(12-i)*300000);
        for(const at of samples){
          const obs=structuredClone(observations);for(const v of Object.values(obs)){v.time=at;v.receivedAt=at;}
          if(obs['sensor.demo_rain_total'])obs['sensor.demo_rain_total'].value=id==='grass-wet'?2.75+(at-(now-3600000))/300000*.4:2.75;
          if(obs['sensor.demo_irradiance'])obs['sensor.demo_irradiance'].value=id==='grass-dry'?850:0;
          if(id==='grass-missing'&&obs['sensor.demo_irradiance'])obs['sensor.demo_irradiance'].reason='HA reading unavailable';
          const snapshot={policy,observations:obs,owm:{configured:value.configured,data:value.data,fetchedAt:value.fetchedAt,failures:value.failures},rows:selectHaReadings(policy,obs,value,at),observedRain:selectObservedRain(policy,obs,at)};
          const result=advanceGrassWetness(grassState,snapshot,at);grassState=result.state;value.presentation={...snapshot,grassWetness:result.reading};
          grassHistory.push({time:at/1000,...snapshot,grassWetness:result.reading});
        }
        grassHistory=grassHistory.slice(-400);
      }
      if(id==='grass-history'&&policy.grassWetness?.enabled){
        visualHistory??=grassPreviewHistory(value.presentation,previewEnd);
        value.presentation.grassWetness={...visualHistory.at(-1).grassWetness,calculatedAt:now};
      }
      return {weather:value,weatherPolicy:policy,homeAssistant:{configured:ha,url:ha?'http://synthetic-home-assistant.invalid':'',revision:0,state:ha?'connected':'unconfigured',checkedAt:now}};
    },
  };
}
