import {defaultUnits,weatherFields,unitChoices} from './weather-policy.js';
// Capture once before any server hydration can replace this browser's defaults.
export const initialBrowserUnits={...defaultUnits};
try{const saved=JSON.parse(localStorage.getItem('radar-display'));for(const [key,choices] of Object.entries(unitChoices))if(choices.includes(saved?.[key]))initialBrowserUnits[key]=saved[key];}catch{}
export const shared={revision:0,initialized:false,ha:false,haUrl:'',haCollect:false,owm:false,owmCollect:false,forecastCollect:false,rainviewerCollect:true,rainbowCollect:false,source:'openweather',fallback:false,mappings:Object.fromEntries(weatherFields.map(f=>[f,'disabled'])),units:{...defaultUnits},camera:null,cameraEnabled:false};
let initializing=false;
let request=null,canEdit=()=>false;
export function bindIntegrationSettings(edit,transport){canEdit=edit;request=transport;}
export function acceptIntegrationStatus(status){
  if(!status?.weatherPolicy)return;
  const before=JSON.stringify(shared);
  Object.assign(shared,status.weatherPolicy,{ha:!!status.homeAssistant?.configured,haUrl:status.homeAssistant?.url??'',haHealth:status.homeAssistant,owm:!!status.weather?.configured,weather:status.weather,camera:status.camera?.configured?status.camera:null,cameraEnabled:!!status.camera?.enabled,presentation:status.weather?.presentation,radarHealth:status.sources});
  if(before!==JSON.stringify(shared)){window.dispatchEvent(new Event('integration-change'));window.dispatchEvent(new Event('radar-weather-preferences'));}
  if(!shared.initialized&&!initializing){
    initializing=true;
    void fetch('/api/settings/weather/initialize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({units:initialBrowserUnits}),signal:AbortSignal.timeout(10000)})
      .then(async response=>{if(!response.ok)throw Error('Unit initialization pending');const {status,...policy}=await response.json();if(policy.revision>=shared.revision)Object.assign(shared,policy);window.dispatchEvent(new Event('integration-change'));window.dispatchEvent(new Event('radar-weather-preferences'));})
      .catch(()=>{}).finally(()=>{initializing=false;});
  }
}
export async function refresh(){
  const response=await fetch('/api/status',{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Settings unavailable.');acceptIntegrationStatus(await response.json());return shared;
}
export async function settingsRequest(path,data){
  if(!request||!canEdit())throw Error('Unlock Settings first.');
  const response=await request(path,data),value=await response.json();if(!response.ok)throw Error(value.error??'Could not save settings.');return value;
}
export async function change(input){
  if(input.action==='ha')await settingsRequest('/home-assistant',{url:input.url,token:input.token});
  else if(input.action==='remove-ha')await settingsRequest('/home-assistant',{remove:true});
  else if(input.action==='delete-camera')await settingsRequest('/camera',{remove:true});
  else if(input.action==='settings'){
    if(input.cameraEnabled!==undefined)await settingsRequest('/camera',{enabled:input.cameraEnabled});
    else if(input.timeZone!==undefined){const config=await settingsRequest('');await settingsRequest('/map',{...config.map,timeZone:input.timeZone});}
    else{const {action,...values}=input;await settingsRequest('/weather',values);}
  }else throw Error('Unsupported settings action.');
  return refresh();
}
