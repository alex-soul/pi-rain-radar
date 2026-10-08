// Isolated simulator page: production widget/rendering, no application clock changes.
import {paintAstronomy} from '/astronomy.js';
import {createAstronomy} from '/astronomy-model.js';
const $=id=>document.getElementById(id),polar=new URLSearchParams(location.search).has('polar');
document.documentElement.dataset.theme='dark';
const at=createAstronomy(polar?80:52.40801,polar?20:-1.51041),day=Date.parse(polar?'2026-06-21T00:00Z':'2026-10-08T00:00Z'),events=at(day+12*3600000);
const controls=document.createElement('section');controls.id='astronomy-review';
controls.innerHTML='<h1>Sun and Moon motion</h1><p>Accelerated review using the real widget. No live clock or settings change. Drag a widget corner to compare sizes.</p><label>Review interval <select id="astro-case"></select></label><input id="astro-clock" type="range" min="0" max="10000" value="0"><output id="astro-stamp"></output><p><button id="astro-play">Play</button> <button id="astro-restart">Start again</button></p><div id="astro-anchors"></div><p><a href="/__astronomy">Normal day</a> · <a href="/__astronomy?polar=1">Polar day</a> · <a href="/__dev">Studio</a> · <a href="/">App</a></p>';
document.body.append(controls);
new ResizeObserver(()=>document.body.style.setProperty('--preview-widget-top',controls.getBoundingClientRect().bottom+24+'px')).observe(controls);
const intervals=[['Whole day',day,day+86400000]];
for(const body of ['sun','moon'])for(const [name,a,b]of [['rise','rise','riseEnd'],['set','setStart','set']])if(events[body][a]!==null&&events[body][b]!==null)intervals.push([body+' '+name,events[body][a]-60000,events[body][b]+60000]);
for(const [i,item]of intervals.entries())$('astro-case').add(new Option(item[0],i));
let playing=false,previous=performance.now();
function paint(){const [,start,end]=intervals[Number($('astro-case').value)];const time=start+(end-start)*Number($('astro-clock').value)/10000;paintAstronomy(time);$('astro-stamp').textContent=new Date(time).toLocaleString('en-GB',{timeZone:'Europe/London',timeZoneName:'short'});}
function choose(){playing=false;$('astro-play').textContent='Play';$('astro-clock').value=0;$('astro-anchors').replaceChildren();const [name,start,end]=intervals[Number($('astro-case').value)];
 for(const body of ['sun','moon'])for(const key of ['rise','riseEnd','transit','setStart','set']){const time=events[body][key];if(time===null||time<start||time>end)continue;const button=document.createElement('button');button.textContent=body+' '+key;button.onclick=()=>{playing=false;$('astro-play').textContent='Play';$('astro-clock').value=(time-start)/(end-start)*10000;paintAstronomy(time);$('astro-stamp').textContent=new Date(time).toLocaleString('en-GB',{timeZone:'Europe/London',timeZoneName:'short'});};$('astro-anchors').append(button);}
 paint();}
$('astro-case').onchange=choose;$('astro-clock').oninput=()=>{playing=false;$('astro-play').textContent='Play';paint();};
$('astro-play').onclick=()=>{playing=!playing;$('astro-play').textContent=playing?'Pause':'Play';};$('astro-restart').onclick=choose;
document.body.append($('astronomy'));
if($('astronomy').hidden)$('astronomy-toggle').click();
$('astronomy').style.left='16px';$('astronomy').style.top='330px';
choose();$('astro-clock').value=5000;paint();setInterval(()=>{const now=performance.now(),elapsed=now-previous;previous=now;if(playing){$('astro-clock').value=(Number($('astro-clock').value)+elapsed/6)%10000;paint();}},40);
