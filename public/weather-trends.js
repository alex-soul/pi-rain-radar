import {setupFloatingWidget} from './floating-widget.js';
import {weatherPreferences,gustCacheMinutes} from './display.js';
import {weatherReadings} from './weather-readings.js';
import {weatherSeries,trendsAt,chartSegments,gridInterval,smoothPath,trendRange,chartCredits} from './weather-trends-model.js';
import {createWeatherReplay} from './history-weather-model.js';
import {formatTime} from './time.js';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const mainWidget=setupFloatingWidget({id:'weather-trends',storageKey:'radar-weather-trends',width:440,height:220,minWidth:180,minHeight:150,maxHeight:420,startY:200});
let latestInput=null,replay=createWeatherReplay(),cache='',series={},chartKey='',historyRef=null,prefKey='',credits={openweather:false,other:''};
export const weatherTrendCredits=()=>credits;
export function paintWeatherTrends(input){
 latestInput=input;const {history,start,end,time,state,historical=false,zone}=input;
 const prefs=weatherPreferences(),gust=gustCacheMinutes(),nextPrefs=JSON.stringify([prefs,gust]);
 if(history!==historyRef||nextPrefs!==prefKey){historyRef=history;prefKey=nextPrefs;cache=JSON.stringify([history,nextPrefs]);series=weatherSeries(history,prefs,gust);replay=createWeatherReplay(history);}
 const now=historical?time*1000:Date.now(),rows=weatherReadings(state,now,{historical,preferences:prefs,gustMinutes:gust});
 const trends=trendsAt(series,rows,state);
 for(const [id,arrow] of Object.entries(trends)){
  const holder=$('weather-'+id)?.closest('.weather-reading');if(!holder)continue;
  let marker=holder.querySelector('.reading-trend');if(!marker){marker=document.createElement('span');marker.className='reading-trend';marker.setAttribute('aria-hidden','true');const value=$('weather-'+id),slot=document.createElement('span');slot.className='reading-value-slot';slot.dataset.reading=id;value.before(slot);slot.append(value,marker);}
  marker.textContent=arrow;marker.title=arrow==='↑'?'Higher than the previous observation':arrow==='↓'?'Lower than the previous observation':'';
 }
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
 const fields=[["temperature", "Temperature", "temp"], ["humidity", "Humidity", "rh"], ["dew", "Dew point", "dew"], ["wind", "Wind", "wind"], ["depression", "T−Td", "depression"], ["visibility", "Visibility", "visibility"], ["pressure", "Pressure", "pressure"], ["uv", "UV index", "uv"], ["gust", "Wind gusts", "gust"]];
 const sizes=fields.map(([id])=>{const e=$('trend-'+id);return [e.clientWidth,e.clientHeight];});
 const renderKey=JSON.stringify([cache,start,end,fields.map(([id])=>rows[id].unit),zone,sizes]);
 const stamp=t=>formatTime(t,{hour:'2-digit',minute:'2-digit'},zone);
 if(chartKey!==renderKey){chartKey=renderKey;
  credits=chartCredits(series,fields.filter(([id])=>!$('trend-'+id).closest('.trend-mini').hidden).map(([id])=>id),start,end);
  window.dispatchEvent(new Event('radar-chart-credits'));
  const segments=Object.fromEntries(fields.map(([id])=>[id,chartSegments(series[id],start,end,rows[id].unit)]));
  for(const [i,[id,label,color]]of fields.entries()){
   const svg=$('trend-'+id),[width,height]=sizes[i];if(width<5||height<12)continue;
   svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
   const [min,max]=trendRange(segments[id].flat().map(p=>p.value),id,rows[id].unit),x=t=>1+(t-start)/(end-start)*(width-2),y=v=>height-4-(v-min)/(max-min)*(height-10),nodes=[];
   const add=(tag,attrs,text)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;nodes.push(e);return e;};
   for(let n=1;n<4;n++){const yy=6+(height-10)*n/4;add('line',{class:'trend-grid',x1:1,x2:width-1,y1:yy,y2:yy});}
   const interval=gridInterval(end-start,width);
   for(let t=Math.ceil(start/interval)*interval;t<end;t+=interval)if(t>start)add('line',{class:'trend-grid',x1:x(t),x2:x(t),y1:6,y2:height-4});
   add('path',{class:'trend-axis',d:`M1,6V${height-4} M1,${height-4}H${width-1}`});
   for(const line of segments[id]){const curve=add('path',{class:'trend-curve',d:smoothPath(line.map(p=>[x(p.time),y(p.value)])),stroke:`var(--trend-${color})`});const tip=document.createElementNS(ns,'title');tip.textContent=`${label} · ${line[0]?.source??''} · ${line.length} saved observations`;curve.append(tip);}
   add('line',{id:'trend-cursor-'+id,class:'trend-cursor',y1:6,y2:height-4});svg.replaceChildren(...nodes);
   svg.setAttribute('aria-label',`${label}, ${stamp(start)} to ${stamp(end)}. Automatically scaled to recorded values. Grid every ${interval/60} minutes. ${segments[id].length?'Gaps and source or unit changes break the line.':'No stored readings.'}`);
  }
 }
 const selectedTime=Math.max(start,Math.min(end,time??end)),selected=weatherReadings(replay.weather(selectedTime),selectedTime*1000,{historical:true,preferences:prefs,gustMinutes:gust});
 for(const [i,[id]]of fields.entries()){
  const cursor=$('trend-cursor-'+id),x=1+(selectedTime-start)/(end-start)*(sizes[i][0]-2);if(cursor){cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
  $('trend-value-'+id).textContent=selected[id].text+(['wind','gust','visibility','pressure'].includes(id)?' '+selected[id].unit:'');
 }
}
new ResizeObserver(()=>{if(latestInput)paintWeatherTrends(latestInput);}).observe($('weather-trends'));



const controls = [{"id": "temperature", "label": "Temperature", "visible": true}, {"id": "humidity", "label": "Humidity", "visible": true}, {"id": "dew", "label": "Dew point", "visible": true}, {"id": "wind", "label": "Wind", "visible": false}, {"id": "depression", "label": "T−Td", "visible": false}, {"id": "visibility", "label": "Visibility", "visible": false}, {"id": "pressure", "label": "Pressure", "visible": false}, {"id": "uv", "label": "UV index", "visible": false}, {"id": "gust", "label": "Wind gusts", "visible": false}];
const key = 'radar-weather-charts';
let layout = controls.map(({ id, visible = true }) => ({ id, visible }));
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (Array.isArray(saved)) {
    const ids = new Set();
    const valid = saved.filter(item => item && controls.some(c => c.id === item.id) &&
      typeof item.visible === 'boolean' && !ids.has(item.id) && ids.add(item.id));
    layout = [...valid.map(({ id, visible }) => ({ id, visible })), ...layout.filter(item => !ids.has(item.id))];
  }
} catch { /* Use defaults if storage is unavailable or invalid. */ }
let detached=false;
try{detached=localStorage.getItem('radar-weather-charts-detached')==='true';}catch{}
const windows=new Map();
for(const [index,{id,label}] of controls.entries()){
 const panel=document.createElement('aside');panel.id='detached-'+id;panel.className='detached-trend';panel.tabIndex=0;panel.hidden=true;panel.setAttribute('aria-label',label+' history');
 const edit=document.createElement('button');edit.className='trend-edit';edit.type='button';edit.textContent='Edit';
 edit.addEventListener('click',()=>{if(!document.body.classList.contains('screen-locked'))$('trend-editor').showModal();});
 const resize=document.createElement('button');resize.id=panel.id+'-resize';resize.className='detached-resize';resize.type='button';resize.textContent='◢';resize.setAttribute('aria-label','Resize '+label+' history. Drag or use arrow keys.');
 panel.append(resize);$('weather-trends').parentElement.append(panel);
 const widget=setupFloatingWidget({id:panel.id,storageKey:'radar-chart-window-'+id,width:320,height:110,minWidth:180,minHeight:85,maxHeight:420,rememberVisibility:false,startX:28+(index%3)*36,startY:150+(index%5)*65});
 windows.set(id,{panel,edit,resize,widget});new ResizeObserver(()=>{if(latestInput)paintWeatherTrends(latestInput);}).observe(panel);
}
function apply() {
 const stack=$('trend-plots'),visible=mainWidget.isVisible(),hasCharts=layout.some(item=>item.visible);
 $('weather-trends').classList.toggle('charts-detached',detached&&hasCharts);
 $('trend-edit-store').append($('trend-edit'));
 const last=layout.filter(item=>item.visible).at(-1)?.id;
 for(const {id,visible:enabled} of layout){
  const plot=document.querySelector(`.trend-mini[data-field="${id}"]`),entry=windows.get(id);
  plot.hidden=!enabled;
  const legend=plot.querySelector('.trend-mini-legend');
  plot.classList.toggle('chart-bottom',id===last);
  if(detached){entry.panel.insertBefore(plot,entry.resize);legend.append(entry.edit);}
  else{entry.edit.remove();stack.append(plot);if(id===last)legend.append($('trend-edit'));}
  entry.widget.setVisible(detached&&visible&&enabled);
 }
 if(!hasCharts)stack.append($('trend-edit'));
 $('trend-detach').checked=detached;
 chartKey='';if(latestInput)paintWeatherTrends(latestInput);
}
new MutationObserver(apply).observe($('weather-trends-toggle'),{attributes:true,attributeFilter:['aria-pressed']});
$('trend-detach').addEventListener('change',()=>{detached=$('trend-detach').checked;try{localStorage.setItem('radar-weather-charts-detached',String(detached));}catch{}apply();});
window.addEventListener('radar-screen-lock',()=>{for(const {panel} of windows.values())panel.inert=document.body.classList.contains('screen-locked');});

apply();

export function setupTrendEditor(onChange) {
  const canEdit=()=>!document.body.classList.contains('screen-locked');
  const dialog=document.getElementById('trend-editor');
  document.getElementById('trend-edit').addEventListener('click',()=>{if(canEdit())dialog.showModal();});
  document.getElementById('trend-editor-close').addEventListener('click',()=>dialog.close());
  const list = document.getElementById('trend-list');
  const feedback = document.getElementById('trend-feedback');
  let drag = null;
  function save() {
    apply();onChange();
    try { localStorage.setItem(key, JSON.stringify(layout)); feedback.textContent = 'Saved on this screen'; }
    catch { feedback.textContent = 'Applied for now; browser storage is unavailable.'; }
  }
  function render() {
    list.replaceChildren();
    for (const { id, visible } of layout) {
      const label = controls.find(c => c.id === id).label;
      const row = document.createElement('li'); row.dataset.control = id;
      const handle = document.createElement('button');
      handle.type = 'button'; handle.className = 'control-handle'; handle.textContent = '⠿';
      handle.setAttribute('aria-label', `Move ${label}. Drag or use up and down arrow keys.`);
      const name = document.createElement('span'); name.textContent = label;
      const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.checked = visible;
      toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', `Show ${label} chart`);
      toggle.className = 'control-switch';
      toggle.addEventListener('change', () => {
        if (!canEdit()) { toggle.checked = !toggle.checked; return; }
        layout.find(c => c.id === id).visible = toggle.checked; save();
      });
      handle.addEventListener('keydown', event => {
        if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !canEdit()) return;
        event.preventDefault();
        const from = layout.findIndex(c => c.id === id);
        const to = Math.max(0, Math.min(layout.length - 1, from + (event.key === 'ArrowUp' ? -1 : 1)));
        if (from !== to) {
          layout.splice(to, 0, layout.splice(from, 1)[0]); save(); render();
          list.querySelector(`[data-control="${id}"] button`).focus();
        }
      });
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary || !canEdit()) return;
        drag = { pointer: event.pointerId, id, original: layout.map(item => ({ ...item })) };
        row.classList.add('dragging'); handle.setPointerCapture(event.pointerId);
      });
      handle.addEventListener('pointermove', event => {
        if (drag?.pointer !== event.pointerId || !canEdit()) return;
        const rows = [...list.children];
        const other = rows.find(r => {
          const rect = r.getBoundingClientRect();
          return r !== row && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
        });
        if (!other) return;
        const from = layout.findIndex(c => c.id === id);
        const to = layout.findIndex(c => c.id === other.dataset.control);
        layout.splice(to, 0, layout.splice(from, 1)[0]);
        // Move the other row, preserving pointer capture on the dragged handle.
        layout.forEach((item, index) => {
          if (item.id === id) return;
          const sibling = rows.find(r => r.dataset.control === item.id);
          if (index < to) list.insertBefore(sibling, row);
          else list.append(sibling);
        });
      });
      function finish(event) {
        if (drag?.pointer !== event.pointerId) return;
        const original = drag.original;
        drag = null; row.classList.remove('dragging');
        if (event.type === 'pointerup' && canEdit()) save();
        else layout = original;
        render();
      }
      handle.addEventListener('pointerup', finish);
      handle.addEventListener('pointercancel', finish);
      handle.addEventListener('lostpointercapture', finish);
      row.append(handle, name, toggle); list.append(row);
    }
  }
  render();
  return () => {
    if (drag) { layout = drag.original; drag = null; render(); }
    feedback.textContent = '';
  };
}


setupTrendEditor(()=>{chartKey='';if(latestInput)paintWeatherTrends(latestInput);});
