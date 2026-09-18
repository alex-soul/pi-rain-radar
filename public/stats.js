import { setupFloatingWidget } from './floating-widget.js';
import { statsSnapshot } from './stats-format.js';
import { formatTime } from './time.js';
let input = {}, visible = false, previous = '';
const zone = document.querySelector('meta[name="time-zone"]').content;
const data = document.getElementById('stats-data');
const connection = document.getElementById('stats-connection');
const clock = value => value == null ? 'Unavailable' : formatTime(typeof value === 'string' ? Date.parse(value)/1000 : value/1000, {hour:'2-digit',minute:'2-digit'}, zone);
function element(tag, text) { const node=document.createElement(tag);node.textContent=text;return node; }
function row(list, name, value) { list.append(element('dt',name),element('dd',value)); }
function render() {
  if (!visible) return;
  const s=statsSnapshot(input);
  // Round ages to minutes and avoid rebuilding unchanged content on the shared tick.
  const signature=JSON.stringify({...s,now:Math.floor(s.now/60000)});
  if(signature===previous)return;previous=signature;
  connection.textContent=s.connection;connection.dataset.stale=String(s.stale);
  const grid=element('div','');grid.className='stats-grid';
  for(const [role,name] of [['main','Main'],['overview','Overview']]) {
    const source=s.sources[role],column=element('div',''),list=element('dl','');
    column.append(element('strong',`${name} · ${source?.source==='rainbow'?'Rainbow':source?.source==='rainviewer'?'RainViewer':'Unavailable'}`));
    row(list,'Acquisition',source ? source.fetching?'Fetching':source.error?'Problem':source.state==='ready'?'Ready':source.state==='stale'?'Stale observation':'Waiting' : 'Unavailable');
    row(list,'Latest observation',source?.time ? `${clock(source.time*1000)} · ${Math.max(0,Math.floor((s.now-source.time*1000)/60000))} min ago`:'Unavailable');
    row(list,'Last check',clock(source?.checkedAt));
    row(list,'Next check (estimate)',clock(source?.nextCheckAt));
    if(source?.nextUpdate?.state==='waiting')row(list,'Settling · eligible check',clock(source.nextUpdate.expectedAt));
    column.append(list);grid.append(column);
  }
  const title=element('h4',`${s.windowLabel} · ending ${clock(s.end == null ? null : s.end*1000)}`);
  const counts=element('div','');counts.className='stats-grid';
  for(const [role,name] of [['main','Main'],['overview','Overview']]) {
    const c=s.counts?.[role];counts.append(element('div',`${name}: ${c ? `${c.available} available · ${c.missing} missing`:'Unavailable'}`));
  }
  const usage=s.rainbow;
  const weather=s.weather, weatherInfo=element('div','');
  if (!weather?.configured) weatherInfo.textContent=weather ? 'Not configured' : 'Unavailable';
  else {
    weatherInfo.className='stats-grid';
    weatherInfo.append(element('div',`Weather fetched: ${clock(weather.fetchedAt)}`),element('div',`Forecast fetched: ${clock(weather.forecastFetchedAt)}`),element('div',`Next attempt: ${weather.nextAttemptAt ? clock(weather.nextAttemptAt) : 'Due'}`),element('div',weather.fetching?'Fetching':weather.error||weather.forecastError?'Problem':'Ready'));
  }
  data.replaceChildren(grid,title,counts,element('h4','OpenWeather · last successful fetch / next attempt'),weatherInfo,element('h4','Rainbow · local monthly counts'),element('div',usage?`${usage.month} · ${usage.requests} requests · ${usage.tiles} tiles`:'Unavailable'),element('p','Local counts, not billing totals. Next check does not guarantee a new frame.'));
}
setupFloatingWidget({id:'stats',storageKey:'radar-stats',width:430,height:500,maxHeight:640,minHeight:220,startX:80,startY:160,onVisibility(value){visible=value;render();}});
export function updateStats(value) { input=value;render(); }
