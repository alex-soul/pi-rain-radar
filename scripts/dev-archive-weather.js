const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
const stamp=t=>new Date(t*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
const date=t=>new Date(t*1000).toLocaleDateString([],{day:'numeric',month:'short'});
let frames=[],snapshots=[],index=0,playing=true,timer,renderId=0,lastChart='';
const bars=Array.from({length:61},(_,i)=>{const r=document.createElementNS(ns,'rect');r.setAttribute('x',String(i*1000/61+1));r.setAttribute('width',String(1000/61-2));r.appendChild(document.createElementNS(ns,'title'));$('chart').appendChild(r);return r;});
function forecast(time,i){
  // Complete snapshots generated once. Repeatable changing fronts, dry spells,
  // partial responses and one missing acquisition interval; no live data involved.
  if(i>0&&i%37===19)return null;
  return {time,points:Array.from({length:61},(_,m)=>{
    const center=30+24*Math.sin(i*.17),strength=Math.max(0,Math.sin(i*.085)+.3)*4;
    const rain=Math.max(0,strength*Math.exp(-(((m-center)/13)**2))-.13);
    return {time:time+m*60,rain:Math.round(rain*10)/10,missing:i%11===4&&m>=22&&m<30};
  })};
}
const overlay=document.createElementNS(ns,'g');$('chart').appendChild(overlay);
function drawForecast(t){
  if(Number($('compare').value)){lastChart='';drawComparison(t);return;}
  overlay.replaceChildren();
  $('rain-label').textContent='Predicted rain';$('line-legend').hidden=true;
  $('chart-label').textContent='RAIN FORECAST · SAVED SNAPSHOT';
  $('comparison-detail').textContent='';
  const start=performance.now(),snapshot=snapshots.findLast(s=>s&&s.time<=t);
  const usable=snapshot&&snapshot.time+3600>=t,withGaps=$('gaps').checked;
  const signature=`${usable?snapshot.time:'none'}:${withGaps}`;
  if(signature===lastChart){$('note').textContent=usable?`Snapshot ${stamp(snapshot.time)} still covers this step. No new snapshot; no chart redraw.`:'No saved forecast covers this step.';return;}
  lastChart=signature;
  let missing=0;
  bars.forEach((bar,m)=>{
    bar.style.display='';bar.setAttribute('x',String(m*1000/61+1));bar.setAttribute('width',String(1000/61-2));
    const p=usable?snapshot.points[m]:null,gap=!p||(withGaps&&p.missing),rain=p?.rain??0;
    if(gap)missing++;
    const height=gap||rain===0?3:Math.max(4,rain/5*115);
    bar.setAttribute('y',String(125-height));bar.setAttribute('height',String(height));
    bar.setAttribute('fill',gap?'#d1a04d':rain>0?'#70adbc':'#8db997');
    bar.firstChild.textContent=`${stamp(p?.time??t+m*60)} · ${gap?'Missing minute':rain+' mm/h'}`;
  });
  const anchor=usable?snapshot.time:t;
  $('forecast-title').textContent=usable?`Forecast starting ${stamp(anchor)}`:'No saved forecast';
  $('from').textContent=stamp(anchor);$('middle').textContent=stamp(anchor+1800);$('to').textContent=stamp(anchor+3600);
  $('coverage').textContent=`${61-missing}/61 points · fixed 0–5 mm/h scale`;
  $('note').textContent=`Snapshot ${usable?stamp(anchor):'unavailable'} · ${snapshot?.time<t?'Previous snapshot still covers this time; no replacement was saved.':'Forecast switches with the archive step.'} Chart update ${(performance.now()-start).toFixed(1)} ms (DOM work only).`;
}
// Match valid timestamps, never array offsets or receipt times. Missing pairs
// remain missing; the later NOW value is a provider estimate, not ground truth.
function comparisonAt(t,lead){
  const earlier=snapshots.find(s=>s?.time===t-lead*60);
  const later=snapshots.find(s=>s?.time===t);
  const predicted=earlier?.points.find(p=>p.time===t);
  const now=later?.points.find(p=>p.time===t);
  const valid=p=>p&&(!$('gaps').checked||!p.missing)?p.rain:null;
  return {time:t,predicted:valid(predicted),now:valid(now)};
}
function drawComparison(t){
  const lead=Number($('compare').value);
  const pairs=Array.from({length:13},(_,i)=>comparisonAt(t-(12-i)*600,lead));
  overlay.replaceChildren();
  const add=(tag,attrs,title)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,String(v));if(title){const tip=document.createElementNS(ns,'title');tip.textContent=title;e.appendChild(tip);}overlay.appendChild(e);};
  let previous=null;
  bars.forEach((bar,i)=>{
    const p=pairs[i];bar.style.display=p?'':'none';if(!p)return;
    const width=1000/13,x=(i+.5)*width,y=125-(p.predicted??0)*23;
    const h=p.now===null||p.now===0?3:Math.max(4,p.now*23);
    bar.setAttribute('x',String(i*width+8));bar.setAttribute('width',String(width-16));
    bar.setAttribute('y',String(125-h));bar.setAttribute('height',String(h));
    bar.setAttribute('fill',p.now===null?'#d1a04d':p.now===0?'#8db997':'#70adbc');
    bar.firstChild.textContent=`${stamp(p.time)} · Now estimate: ${p.now===null?'missing':p.now+' mm/h'}`;
    if(p.predicted===null){add('line',{x1:x-5,x2:x+5,y1:128,y2:128,stroke:'#d1a04d','stroke-width':3});previous=null;return;}
    if(previous)add('line',{x1:previous.x,y1:previous.y,x2:x,y2:y,stroke:'#edc0ff','stroke-width':3});
    add('circle',{cx:x,cy:y,r:4,fill:'#edc0ff'},`${stamp(p.time)} · Predicted ${lead} min earlier: ${p.predicted} mm/h`);
    previous={x,y};
  });
  $('chart-label').textContent='HISTORICAL NOW · 10-MINUTE SAMPLES';
  $('forecast-title').textContent='Forecast vs now';
  $('rain-label').textContent='Later now estimate';$('line-legend').hidden=false;
  $('line-label').textContent=`Predicted ${lead} min earlier`;
  $('from').textContent=stamp(t-7200);$('middle').textContent=stamp(t-3600);$('to').textContent=stamp(t);
  const matched=pairs.filter(p=>p.predicted!==null&&p.now!==null).length;
  $('coverage').textContent=`${matched}/13 pairs · 0–5 mm/h`;
  $('comparison-detail').textContent=`Past two hours: bars show the later now estimates; the line shows predictions made ${lead} minutes before each timestamp. Missing history stays amber. These are simulated estimates, not measured rainfall.`;
  $('note').textContent='Choose None to return to the saved next-hour forecast. Comparison changes locally with playback and scrubbing.';
}
async function show(next){
  const token=++renderId;index=next;const f=frames[index];
  const img=new Image();img.src=f.url;
  try{await img.decode();}catch{if(token===renderId){playing=false;clearTimeout(timer);$('note').textContent='Could not load this radar frame. Reload the POC to retry.';}return;}
  if(token!==renderId)return;
  $('radar').src=img.src;$('map-time').textContent=stamp(f.time);$('map-date').textContent=date(f.time);
  $('position').textContent=`${date(f.time)} · ${stamp(f.time)} · ${index+1} / ${frames.length}`;$('scrub').value=String(index);
  drawForecast(f.time);
  const following=frames[(index+1)%frames.length];const preload=new Image();preload.src=following.url;
}
function schedule(){clearTimeout(timer);if(playing)timer=setTimeout(async()=>{await show((index+1)%frames.length);schedule();},Number($('speed').value));}
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'Pause':'Play';schedule();};
$('speed').onchange=schedule;
$('scrub').oninput=()=>{playing=false;$('play').textContent='Play';clearTimeout(timer);void show(Number($('scrub').value));};
$('gaps').onchange=()=>{if(frames.length)drawForecast(frames[index].time);};
$('compare').onchange=()=>{if(frames.length)drawForecast(frames[index].time);};
try{
  const status=await(await fetch('/api/status')).json();
  const available=await(await fetch('/api/archive')).json();
  const end=available.times?.at(-1);
  if(!end)throw Error('No saved archive frames');
  // The production archive accepts at most six hours per request. Load once,
  // merge shared boundary frames, then scrub the full day locally.
  const windows=await Promise.all([0,6,12,18].map(async offset=>{
    const response=await fetch(`/api/archive?end=${end-offset*3600}&hours=6`);
    const data=await response.json();
    if(!response.ok||!Array.isArray(data.frames))throw Error(data.error||'Archive window unavailable');
    return data.frames;
  }));
  frames=[...new Map(windows.flat().filter(f=>f.url).map(f=>[f.time,f])).values()].sort((a,b)=>a.time-b.time);
  if(!frames.length)throw Error('No archive frames');
  snapshots=frames.map((f,i)=>forecast(f.time,i));
  $('base').src=`/maps/${status.mapId}/basemap-dark.svg`;
  $('scrub').max=String(frames.length-1);$('scrub').disabled=false;$('play').disabled=false;
  $('start').textContent=`${date(frames[0].time)} ${stamp(frames[0].time)}`;$('end').textContent=`${date(frames.at(-1).time)} ${stamp(frames.at(-1).time)}`;
  await show(0);schedule();
}catch(error){$('note').textContent=`POC could not start: ${error.message}. Start the scenario studio and reload.`;}
