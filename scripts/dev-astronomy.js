// Isolated simulator page: production widget/rendering, no application clock changes.
import {paintAstronomy as paintBase} from '/astronomy.js';
import {createAstronomy} from '/astronomy-model.js';
const $=id=>document.getElementById(id),polar=new URLSearchParams(location.search).has('polar');
document.documentElement.dataset.theme='dark';
const at=createAstronomy(polar?80:52.40801,polar?20:-1.51041),day=Date.parse(polar?'2026-06-21T00:00Z':'2026-10-08T00:00Z'),events=at(day+12*3600000);
const controls=document.createElement('section');controls.id='astronomy-review';
controls.innerHTML='<h1>Sun and Moon motion</h1><p>Accelerated review using the real widget. No live clock or settings change. Drag a widget corner to compare sizes.</p><label>Motion <select id="astro-motion"><option value="gentle">Gentler centre slowdown</option><option value="current">Current curve (comparison)</option></select></label><br><label>Review interval <select id="astro-case"></select></label><label>History time · 10-minute steps<input id="astro-clock" type="range" step="600000"></label><output id="astro-stamp"></output><p><button id="astro-play">Play</button> <button id="astro-restart">Start again</button></p><div id="astro-anchors"></div><p><a href="/__astronomy">Normal day</a> · <a href="/__astronomy?polar=1">Polar day</a> · <a href="/__dev">Studio</a> · <a href="/">App</a></p>';
document.body.append(controls);
new ResizeObserver(()=>document.body.style.setProperty('--preview-widget-top',controls.getBoundingClientRect().bottom+24+'px')).observe(controls);
const intervals=[['Whole day',day,day+86400000]];
for(const body of ['sun','moon'])for(const [name,a,b]of [['rise','rise','riseEnd'],['set','setStart','set']])if(events[body][a]!==null&&events[body][b]!==null)intervals.push([body+' '+name,events[body][a]-60000,events[body][b]+60000]);
for(const [i,item]of intervals.entries())$('astro-case').add(new Option(item[0],i));
let playing=false,previous=performance.now(),playCursor=0;
// Preview-only experiment: nonzero shared transit velocity, with the same anchors.
// Production celestial-motion.js and astronomy.js remain unchanged.
export function gentlePosition(time,e,width,radius){
 const {rise,riseEnd,transit,setStart,set}=e;
 if(!Number.isFinite(rise)||!Number.isFinite(set)||set<=rise||width<=0||radius<=0)return null;
 const peak=Number.isFinite(transit)&&transit>rise&&transit<set?transit:(rise+set)/2;
 const complete=width>4*radius&&Number.isFinite(riseEnd)&&Number.isFinite(setStart)&&rise<riseEnd&&riseEnd<peak&&peak<setStart&&setStart<set;
 const times=complete?[rise,riseEnd,peak,setStart,set]:[rise,peak,set];
 const positions=complete?[-radius,radius,width/2,width-radius,width+radius]:[-radius,width/2,width+radius];
 const d=times.slice(1).map((t,i)=>(positions[i+1]-positions[i])/(t-times[i]));
 const centre=.65*Math.min(...(complete?[d[1],d[2]]:d));
 let v;
 if(complete){const left=Math.min(3*d[1]-2*centre,d[0]),right=Math.min(3*d[2]-2*centre,d[3]);v=[2*d[0]-left,left,centre,right,2*d[3]-right];}
 else v=[3*d[0]-2*centre,centre,3*d[1]-2*centre];
 if(time<=rise)return -radius;if(time>=set)return width+radius;
 const i=times.findIndex((t,j)=>j<times.length-1&&time>=t&&time<=times[j+1]);
 const h=times[i+1]-times[i],u=(time-times[i])/h;
 return (2*u**3-3*u*u+1)*positions[i]+(u**3-2*u*u+u)*h*v[i]+(-2*u**3+3*u*u)*positions[i+1]+(u**3-u*u)*h*v[i+1];
}
let reviewTime=day+43200000;
function render(time){
 reviewTime=time;paintBase(time);if($('astro-motion').value!=='gentle')return;
 const data=at(time);
 for(const body of ['sun','moon']){
  const value=data[body],icon=$('astro-'+body+'-icon'),lane=$('astro-'+body).querySelector('.astro-lane');
  if(value.continuous)continue;
  const radius=icon.getBoundingClientRect().width/2*(body==='moon'?60/64:1);
  const x=gentlePosition(time,value,lane.clientWidth,radius);
  if(x!==null)icon.style.left=x+'px';
 }
}
$('astro-motion').onchange=()=>render(reviewTime);
new ResizeObserver(()=>render(reviewTime)).observe($('astronomy'));
function paint(){const time=Number($('astro-clock').value);render(time);$('astro-stamp').textContent=new Date(time).toLocaleString('en-GB',{timeZone:'Europe/London',timeZoneName:'short'});}
function choose(){playing=false;$('astro-play').textContent='Play';$('astro-anchors').replaceChildren();const [name,start,end]=intervals[Number($('astro-case').value)];
 const clock=$('astro-clock'),step=600000;clock.min=Math.floor(start/step)*step;clock.max=Math.ceil(end/step)*step;clock.value=clock.min;
 for(const body of ['sun','moon'])for(const key of ['rise','riseEnd','transit','setStart','set']){const time=events[body][key];if(time===null||time<start||time>end)continue;const button=document.createElement('button');button.textContent=body+' '+key;button.onclick=()=>{playing=false;$('astro-play').textContent='Play';$('astro-clock').value=time;render(time);$('astro-stamp').textContent=new Date(time).toLocaleString('en-GB',{timeZone:'Europe/London',timeZoneName:'short'});};$('astro-anchors').append(button);}
 paint();}
$('astro-case').onchange=choose;$('astro-clock').oninput=()=>{playing=false;$('astro-play').textContent='Play';paint();};
$('astro-play').onclick=()=>{playCursor=Number($('astro-clock').value);playing=!playing;$('astro-play').textContent=playing?'Pause':'Play';};$('astro-restart').onclick=choose;
document.body.append($('astronomy'));
if($('astronomy').hidden)$('astronomy-toggle').click();
$('astronomy').style.left='16px';$('astronomy').style.top='330px';
choose();$('astro-clock').value=day+43200000;paint();setInterval(()=>{const now=performance.now(),elapsed=now-previous;previous=now;if(playing){const clock=$('astro-clock'),start=Number(clock.min),span=Number(clock.max)-start;playCursor=start+(playCursor-start+elapsed*span/60000)%span;clock.value=playCursor;paint();}},40);
