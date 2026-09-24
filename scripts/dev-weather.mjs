import {join} from 'node:path';
import {createHistoryStore} from '../src/history-store.js';
import {createWeatherSettings} from '../src/weather-settings.js';
import {weatherFields,filterCurrent,haEntities,canonicalUnit} from '../public/weather-policy.js';
const sensors=[{id:'sensor.demo_temperature',name:'Demo temperature',unit:'°C'},{id:'sensor.demo_feels',name:'Demo feels like',unit:'°C'},{id:'sensor.demo_wind',name:'Demo wind',unit:'mph'},{id:'sensor.demo_gust',name:'Demo gust',unit:'mph'},...Object.entries({humidity:['%',65],dew:['°C',8],direction:['°',245],visibility:['km',8],pressure:['hPa',1012],uv:['',3]}).map(([field,[unit,value]])=>({id:'sensor.demo_'+field,name:'Demo '+field,unit,value}))];
// Real policy module, synthetic connections/observations. Never forwards keys,
// discovery or weather acquisition to a real provider.
export async function createDevWeather(directory){
  const store=await createHistoryStore(join(directory,'weather-fixture'));
  const settings=await createWeatherSettings(store,{settingsFile:join(directory,'weather-fixture','policy.json'),owmEnabled:true});
  let owm=true,ha=true,lastCurrent=null,lastForecast=[],fetchedAt=null,forecastFetchedAt=null,activeScenario='healthy';
  return {close:()=>store.close(),
    async configure(path,input){
      if(path.endsWith('/initialize')){const result=await settings.initialize(input.units);if(result.status===200&&(activeScenario.startsWith('ha-')||activeScenario==='rc2-review'))await this.scenario(activeScenario);return {status:result.status,...settings.current()};}
      if(path.endsWith('/weather'))return input?settings.configure(input):{status:200,...settings.current()};
      if(path.endsWith('/entities'))return {status:200,entities:settings.current().haCollect?sensors:[]};
      if(path.endsWith('/home-assistant')){if(input){ha=!input.remove;if(!ha)await settings.configure({haCollect:false});}return {status:200,configured:ha,url:ha?'http://synthetic-home-assistant.invalid':'',state:ha?'connected':'unconfigured'};}
      if(path.endsWith('/openweather')){if(input){const hadKey=owm;owm=!!input.apiKey;if(!hadKey||!owm)await settings.configure({owmCollect:false,forecastCollect:false,fallback:false});}return {status:200,apiKeyConfigured:owm};}
    },
    async scenario(id){
      // Selecting a scenario resets its synthetic connection; manual key edits do not.
      activeScenario=id;owm=id!=='no-key';if(id.startsWith('ha-')||id==='rc2-review')ha=true;
      if(id==='no-key'){owm=false;await settings.configure({owmCollect:false,forecastCollect:false,fallback:false});return;}
      const mappings=Object.fromEntries(weatherFields.map(field=>[field,'owm']));
      if((id.startsWith('ha-')||id==='rc2-review'))Object.assign(mappings,{temperature:sensors[0].id,feels:sensors[1].id});
      if(id==='ha-all-readings')for(const field of weatherFields)mappings[field]='sensor.demo_'+field;
      if(id==='disabled-readings')for(const field of ['gust','humidity','dew','direction','visibility','pressure','uv'])mappings[field]='disabled';
      // Initialize only through the connecting browser, just like the product.
      if((id.startsWith('ha-')||id==='rc2-review')&&!settings.current().initialized)return;
      await settings.configure({owmCollect:owm,forecastCollect:owm,haCollect:(id.startsWith('ha-')||id==='rc2-review'),mappings,fallback:id==='ha-fallback'});
    },
    status(weather,id){
      const policy=settings.current(),now=Date.now();
      if(policy.owmCollect){lastCurrent=weather.data?.current??null;fetchedAt=weather.fetchedAt;}
      if(policy.forecastCollect){lastForecast=weather.data?.minutely??[];forecastFetchedAt=weather.forecastFetchedAt;}
      const observations=Object.fromEntries(haEntities(policy).map(entity=>[entity,{value:sensors.find(s=>s.id===entity)?.value??(entity===sensors[1].id?20:21),unit:id==='ha-unit-mismatch'?'F':canonicalUnit(sensors.find(s=>s.id===entity)?.unit),time:now,receivedAt:now,basis:'ha-reported',reason:id==='ha-missing'||id==='ha-fallback'?'HA reading unavailable':null,attribution:'Synthetic Home Assistant'}]));
      const value={...weather,configured:owm&&id!=='no-key',enabled:policy.owmCollect,forecastEnabled:policy.forecastCollect,fetchedAt,forecastFetchedAt,data:{current:filterCurrent(lastCurrent,policy.mappings),minutely:lastForecast},presentation:{policy,observations}};
      return {weather:value,weatherPolicy:policy,homeAssistant:{configured:ha,url:ha?'http://synthetic-home-assistant.invalid':'',revision:0,state:ha?'connected':'unconfigured',checkedAt:now}};
    },
  };
}
