import {createAstronomy,bearing} from './astronomy-model.js';
import {weatherPreferences} from './display.js';
import {setupFloatingWidget} from './floating-widget.js';
const $=id=>document.getElementById(id),panel=$('astronomy'),zone=document.querySelector('meta[name="time-zone"]').content;
const calculate=createAstronomy(Number(document.querySelector('meta[name="latitude"]').content),Number(document.querySelector('meta[name="longitude"]').content));
const modes={sun:'event',moon:'event'};
try{const saved=JSON.parse(localStorage.getItem('radar-astronomy-dock'));for(const id of ['sun','moon'])if(['position','event'].includes(saved?.[id]))modes[id]=saved[id];}catch{}
let lastTime=Date.now(),lastKey='',data=null,moonKey='';
for(const id of ['sun','moon']){
 const select=$('astro-'+id+'-mode');select.value=modes[id];select.addEventListener('change',()=>{if(document.body.classList.contains('screen-locked'))return;modes[id]=select.value;try{localStorage.setItem('radar-astronomy-dock',JSON.stringify(modes));}catch{}lastKey='';paintAstronomy(lastTime);window.dispatchEvent(new Event('radar-display-change'));});
}
const stamp=t=>t===null?'—':new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit'}).format(new Date(t));
const dateStamp=t=>t===null?'No event in the surrounding days':new Intl.DateTimeFormat('en-GB',{timeZone:zone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(t));
function drawMoon(moon){
 const light=moon.illumination,key=[light.fraction.toFixed(4),(light.angle-moon.parallacticAngle).toFixed(1)].join();if(key===moonKey)return;moonKey=key;
 const c=$('astro-moon-icon'),ctx=c.getContext('2d'),im=ctx.createImageData(64,64),angle=(light.angle-moon.parallacticAngle)*Math.PI/180,lz=2*light.fraction-1,side=Math.sqrt(Math.max(0,1-lz*lz)),lx=-Math.sin(angle)*side,ly=-Math.cos(angle)*side;
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){
  const nx=(x-31.5)/30,ny=(y-31.5)/30,r=nx*nx+ny*ny;if(r>1)continue;
  const z=Math.sqrt(1-r),lit=Math.max(0,nx*lx+ny*ly+z*lz),texture=1-.1*Math.exp(-((nx+.25)**2+(ny+.22)**2)*35)-.16*Math.exp(-((nx-.27)**2+(ny-.28)**2)*65)+.015*Math.sin(x*.9)*Math.cos(y*.7),v=(24+208*Math.pow(lit,.55))*texture,i=(y*64+x)*4;
  im.data[i]=v;im.data[i+1]=v*1.015;im.data[i+2]=v*1.02;im.data[i+3]=Math.min(255,(1-Math.sqrt(r))*1800);
 }
 ctx.putImageData(im,0,0);
}
export function paintAstronomy(time){
 lastTime=time;const key=Math.floor(time/60000);if(key!==lastKey){lastKey=key;data=calculate(time);}if(!data)return;
 for(const id of ['sun','moon']){
  const value=data[id],row=$('astro-'+id),icon=$('astro-'+id+'-icon'),lane=row.querySelector('.astro-lane');
  icon.style.visibility=value.up?'visible':'hidden';icon.style.left=(value.continuous?18+Math.max(0,lane.clientWidth-36)*value.progress:-17+(lane.clientWidth+34)*value.progress)+'px';
  const label=id==='sun'?'Sun':'Moon',position=`${value.altitude.toFixed(1)}° ${bearing(value.azimuth)}`,state=value.up?(value.continuous?'above horizon; no bounding rise/set':'above horizon'):'below horizon';
  row.setAttribute('aria-label',`${label}: ${position}, ${state}. Rise ${dateStamp(value.rise)}. Highest ${dateStamp(value.transit)}. Set ${dateStamp(value.set)}.`);
  const events=row.querySelector('.astro-events');events.replaceChildren(...[['↑','rise'],['⌃','transit'],['↓','set']].map(([symbol,event])=>{const e=document.createElement('span');e.textContent=symbol+' '+stamp(value[event]);e.title=label+' '+(event==='transit'?'highest point':event)+' · '+dateStamp(value[event]);return e;}));
  const holder=$('astro-'+id+'-reading');holder.hidden=!weatherPreferences().readings.includes(id);const dockValue=$('weather-'+id),number=document.createElement('span'),unit=document.createElement('small');
  if(modes[id]==='event'){number.textContent=value.next?stamp(value.next.time):'No event';unit.className='astro-event-unit';unit.textContent=value.next?{rise:'r',transit:'p',set:'s'}[value.next.type]:'';unit.title=value.next?{rise:'Rise',transit:'Peak',set:'Set'}[value.next.type]:'';}
  else{number.textContent=value.altitude.toFixed(1)+'°';unit.textContent=bearing(value.azimuth);}
  dockValue.replaceChildren(number,unit);
  holder.setAttribute('aria-label',row.getAttribute('aria-label')+' · Calculated locally'+(id==='moon'?` · ${Math.round(value.illumination.fraction*100)}% illuminated`:''));
 }
 const anyDock=[...document.querySelectorAll('.weather-details .weather-reading')].some(e=>!e.hidden);$('weather-dock').classList.toggle('no-readings',!anyDock);
 if(!panel.hidden)drawMoon(data.moon);
}
setupFloatingWidget({id:'astronomy',storageKey:'radar-astronomy',width:320,height:98,minWidth:180,minHeight:90,maxHeight:230,startX:200,startY:110,onVisibility:()=>{if(data)paintAstronomy(lastTime);}});
new ResizeObserver(()=>{const h=panel.clientHeight,shown=panel.classList.contains('astro-times');if(!shown&&h>=124)panel.classList.add('astro-times');else if(shown&&h<118)panel.classList.remove('astro-times');if(data)paintAstronomy(lastTime);}).observe(panel);
window.addEventListener('radar-weather-preferences',()=>paintAstronomy(lastTime));
