import {integrationHealth} from './integration-health.js';
import { setupFloatingWidget } from './floating-widget.js';
import { statsSnapshot } from './stats-format.js';
import { formatTime } from './time.js';
let input = {}, visible = false, previous = '';
const zone = document.querySelector('meta[name="time-zone"]').content;
const data = document.getElementById('stats-data');
const connection = document.createElement('dd');connection.id='stats-connection';
const clock = value => value == null ? 'Unavailable' : formatTime(typeof value === 'string' ? Date.parse(value)/1000 : value/1000, {hour:'2-digit',minute:'2-digit'}, zone);
function element(tag, text) { const node=document.createElement(tag);node.textContent=text;return node; }
function row(list, name, value) { list.append(element('dt',name),element('dd',value)); }
function render() {
  if (!visible) return;
  const s=statsSnapshot(input);
  // Round ages to minutes and avoid rebuilding unchanged content on the shared tick.
  const signature=JSON.stringify({...s,clouds:input.status?.clouds,now:Math.floor(s.now/60000)});
  if(signature===previous)return;previous=signature;
  connection.textContent=s.connection;connection.dataset.stale=String(s.stale);
  const grid=element('div','');grid.className='stats-grid';
  for(const [role,name] of [['main','Main'],['overview','Overview']]) {
    const source=s.sources[role],column=element('div',''),list=element('dl','');
    column.append(element('strong',`${name} · ${source?.source==='disabled'?'Disabled':source?.source==='rainbow'?'Rainbow':source?.source==='rainviewer'?'RainViewer':'Unavailable'}`));
    if(role==='main')list.append(element('dt','Backend'),connection);
    const activity=!s.stale && source?.fetching ? source.nextUpdate?.state==='fetching'?'Fetching…':'Checking…':null;
    row(list,'Acquisition',s.stale?'Last received':activity ?? (source?.state==='disabled'?'Disabled':source ? source.error?'Problem':source.state==='ready'?'Ready':source.state==='stale'?'Stale observation':'Waiting' : 'Unavailable'));
    row(list,'Latest observation',source?.time ? `${clock(source.time*1000)} · ${Math.max(0,Math.floor((s.now-source.time*1000)/60000))} min ago`:'Unavailable');
    row(list,'Last check',clock(source?.checkedAt));
    row(list,'Next check (estimate)',activity ?? clock(source?.nextCheckAt));
    column.append(list);
    grid.append(column);
  }
  const clouds=input.status?.clouds,cloudColumn=element('div',''),cloudInfo=element('dl','');
  cloudColumn.append(element('strong','Clouds · Rainbow'));
  row(cloudInfo,'Acquisition',s.stale?'Last received':clouds?.collecting?'Fetching…':clouds?.state??'Unavailable');
  row(cloudInfo,'Collection maps',clouds?.map==='both'?'Main + Overview':clouds?.map==='main'?'Main':clouds?.map==='overview'?'Overview':'Unavailable');
  for(const [role,name] of [['main','Main observation'],['overview','Overview observation']]){
    const enabled=clouds?.map===role||clouds?.map==='both';
    row(cloudInfo,name,!clouds?'Unavailable':enabled?clock(clouds.latest?.[role]):'Not selected');
  }
  row(cloudInfo,'Last collection',clock(clouds?.lastSuccess));
  row(cloudInfo,'Next check (estimate)',!s.stale&&clouds?.collecting?'Fetching…':clock(clouds?.nextAt));
  if(clouds?.error)row(cloudInfo,'Problem',clouds.error);
  cloudColumn.append(cloudInfo);grid.append(cloudColumn);
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
  const cameraColumn=element('div',''),cameraInfo=element('dl',''),camera=s.camera;
  cameraColumn.append(element('strong','Camera'));
  row(cameraInfo,'Acquisition',s.stale?'Last received':camera?.state??'Unavailable');
  row(cameraInfo,'Last collection',clock(camera?.lastSuccess));row(cameraInfo,'Next collection',clock(camera?.nextCollection));
  cameraColumn.append(cameraInfo);grid.append(cameraColumn);
  const health=integrationHealth(input.status,s.now);
  for(const [key,title] of [['aviation','Aviation'],['grass','Grass wetness']]){
    const column=element('div',''),list=element('dl',''),item=health[key];
    column.append(element('strong',title));
    row(list,'Status',s.stale?'Last received · '+item.label:item.label);
    if(key==='aviation'){
      row(list,'Station',input.status?.aviation?.station??'Unavailable');
      for(const product of item.products){row(list,product.label,product.description);row(list,product.label+' last check',clock(product.lastSuccess));}
    }else{
      row(list,'Estimate',item.reading?.text??'—');
      row(list,'Calculated',clock(item.reading?.time));
      row(list,'Detail',item.detail);
    }
    column.append(list);grid.append(column);
  }
  data.replaceChildren(grid);
}
setupFloatingWidget({id:'stats',storageKey:'radar-stats',width:1000,minWidth:280,maxWidth:1100,height:600,maxHeight:640,minHeight:220,startX:80,startY:160,onVisibility(value){visible=value;render();}});
export function updateStats(value) { input=value;render(); }
