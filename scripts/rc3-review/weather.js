import {shared} from './shared.js';
import {frameFor,fields} from './model.mjs';
let model;
const comparison=()=>document.getElementById('review-archive-source')?.value??'recorded';
export function reviewPreferences(now,historical,preferences){model=frameFor(shared,now,historical,comparison());return {...preferences,...model.config.units,reviewRevision:shared.revision,reviewComparison:comparison()};}
export function paintReviewReadings(state,now,historical,prefs){
 model=frameFor(shared,now,historical,comparison());
 const raw={temperature:'19.9',feels:'19.2',wind:'5',gust:'8'};
 for(const f of fields){
  const row=model.rows[f],node=document.getElementById('weather-'+f);if(!node)continue;
  const holder=node.closest('.weather-reading');
  if(row.source==='ha')node.textContent=raw[f]+(['temperature','feels'].includes(f)?'°':'');else if(!row.source)node.textContent='—';
  node.dataset.cached=String(row.fallback);holder.dataset.reviewSource=row.source??'gap';
  holder.title=`${f}: ${node.textContent} ${row.unit} · ${row.source==='ha'?'Home Assistant · Reported to HA':row.fallback?'OpenWeather fallback':row.source==='owm'?'OpenWeather':'Unavailable'}${row.reason?' · '+row.reason:''}${historical?' · Historical':''}`;holder.setAttribute('aria-label',holder.title);
 }
 // Restore non-current OWM fixture values for history; the painter handles normal OWM conversions.
 document.getElementById('weather-dock')?.setAttribute('data-review-source',model.config.source);
 if(shared.source==='ha'){
  const live=frameFor(shared,Date.now(),false),rows=Object.values(live.rows),bad=rows.some(r=>!r.source),fallback=rows.some(r=>r.fallback);
  const health=bad?'error':fallback?'warning':'ready',summary=bad?'Some readings unavailable':fallback?'OpenWeather fallback active':'Connected';
  const status=document.getElementById('settings-api-status');status.textContent='Home Assistant + OpenWeather · '+summary;status.dataset.health=health;
  const dock=document.getElementById('weather-dock');dock.dataset.health=health;dock.title=summary;
  dock.setAttribute('aria-label',`${dock.getAttribute('aria-expanded')==='true'?'Collapse':'Expand'} weather readings · ${historical?'Historical readings; current connection: ':''}${summary}`);
 }
}
export function reviewWeatherCredit({dockExpanded,forecastVisible}){
 if(forecastVisible)return true;
 if(!dockExpanded)return false;
 if(!model)return true;
 const readings=[...document.querySelectorAll('.weather-reading')].filter(e=>!e.hidden);
 return readings.some(e=>{const id=e.querySelector('[id^="weather-"]')?.id?.replace('weather-','');const row=model.rows[id];return !row||row.source==='owm'||model.config.source==='openweather'||model.config.mappings[id]==='owm'||model.config.fallback;});
}
