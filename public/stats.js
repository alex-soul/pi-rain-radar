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
  connection.textContent=`(${s.connection.toLowerCase()})`;connection.dataset.stale=String(s.stale);
  const grid=element('div','');grid.className='stats-grid';
  for(const [role,name] of [['main','Main'],['overview','Overview']]) {
    const source=s.sources[role],column=element('div',''),list=element('dl','');
    column.append(element('strong',`${name} · ${source?.source==='rainbow'?'Rainbow':source?.source==='rainviewer'?'RainViewer':'Unavailable'}`));
    const activity=!s.stale && source?.fetching ? source.nextUpdate?.state==='fetching'?'Fetching…':'Checking…':null;
    row(list,'Acquisition',s.stale?'Last received':activity ?? (source ? source.error?'Problem':source.state==='ready'?'Ready':source.state==='stale'?'Stale observation':'Waiting' : 'Unavailable'));
    row(list,'Latest observation',source?.time ? `${clock(source.time*1000)} · ${Math.max(0,Math.floor((s.now-source.time*1000)/60000))} min ago`:'Unavailable');
    row(list,'Last check',clock(source?.checkedAt));
    row(list,'Next check (estimate)',activity ?? clock(source?.nextCheckAt));
    if(source?.nextUpdate?.state==='waiting')row(list,'Settling · eligible check',clock(source.nextUpdate.expectedAt));
    column.append(list,element('h4',s.windowLabel));
    const c=s.counts?.[role],counts=element('dl','');
    row(counts,'Window ending',clock(s.end == null ? null : s.end*1000));
    row(counts,'Available / missing',c?`${c.available} / ${c.missing}`:'Unavailable');
    const known=c?.tracked>0;
    row(counts,'Gaps seen',known?String(c.gapsSeen):'Untracked');
    row(counts,'Late arrivals',known?String(c.lateArrivals):'Untracked');
    row(counts,'Incident tracking',known?`${c.tracked} of ${c.total} slots${c.tracked<c.total?' · partial':''}`:'No recorded history');
    column.append(counts);
    // Monthly usage belongs to the provider, so show it once if both views use Rainbow.
    if(source?.source==='rainbow' && (role==='main'||s.sources.main?.source!=='rainbow')) {
      const usage=s.rainbow,monthly=element('dl','');
      column.append(element('h4','Monthly usage'));
      row(monthly,'Month',usage?.month??'Unavailable');
      row(monthly,'Requests',usage?String(usage.requests):'Unavailable');
      row(monthly,'Tiles',usage?String(usage.tiles):'Unavailable');
      column.append(monthly);
    }
    grid.append(column);
  }
  const weather=s.weather, weatherColumn=element('div',''),weatherInfo=element('dl','');
  weatherColumn.append(element('strong','OpenWeather'));
  if (!weather?.configured) row(weatherInfo,'Status',weather ? 'Not configured' : 'Unavailable');
  else {
    row(weatherInfo,'Acquisition',s.stale?'Last received':weather.fetching?'Fetching':weather.error||weather.forecastError?'Problem':'Ready');
    row(weatherInfo,'Current weather',clock(weather.fetchedAt));
    row(weatherInfo,'Minute forecast',clock(weather.forecastFetchedAt));
    row(weatherInfo,'Next check',weather.nextAttemptAt ? clock(weather.nextAttemptAt) : 'Due');
  }
  weatherColumn.append(weatherInfo);grid.append(weatherColumn);
  data.replaceChildren(grid);
}
setupFloatingWidget({id:'stats',storageKey:'radar-stats',width:620,minWidth:560,height:600,maxHeight:640,minHeight:220,startX:80,startY:160,onVisibility(value){visible=value;render();}});
export function updateStats(value) { input=value;render(); }
