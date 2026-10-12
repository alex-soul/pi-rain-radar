// DEV-only presentation trial using the production chart renderer and retained fixture.
import {paintWeatherTrends} from '/weather-trends.js';
import {weatherReadings,readingExplanation} from '/weather-readings.js';
import {createWeatherReplay} from '/history-weather-model.js';
import {weatherPreferences,gustCacheMinutes} from '/display.js';
import {localPreferences} from '/local-preferences.js';

const fields=[['temperature','TMP','Temperature'],['humidity','HUM','Humidity'],['dew','DPT','Dew point'],['wind','WND','Wind'],['depression','DPD','Dew point depression'],['visibility','VIS','Visibility'],['pressure','PRS','Pressure'],['uv','UVI','UV index'],['gust','GST','Wind gusts'],['rainAccumulation','RAC','Rain accumulation']];
const $=id=>document.getElementById(id),original=document.querySelector('main'),panel=$('weather-trends');
const review=document.createElement('main');review.id='chart-values-review';
review.innerHTML=`<h1>Weather chart value review</h1><p>DEV · synthetic readings · production chart renderer · no live settings changed</p>
<div class="review-controls"><label>Mode <select id="review-mode"><option value="live">Live</option><option value="archive">Archive</option></select></label><label><input id="review-now" type="checkbox"> Show “Now” in Live</label><label>Theme <select id="review-theme"><option value="dark">Dark</option><option value="light">Light</option></select></label></div>
<div class="review-controls"><label>Chart width <output id="review-width-out">180px (minimum)</output><input id="review-width" type="range" min="180" max="600" value="180"></label><label>Chart font <output id="review-font-out">100%</output><input id="review-font" type="range" min="75" max="150" step="5" value="100"></label></div>
<div id="review-chart-host"></div><div class="review-controls"><button id="review-play" type="button">Play</button><label>Capture position <output id="review-capture"></output><input id="review-scrub" type="range" min="0" max="24" value="12"></label></div>
<p id="review-status" role="status"></p><p>Try the minimum width with and without “Now”. The line moves in both modes; Live shows the latest usable value, Archive follows the capture. The chart cog retains reading selection and detach controls.</p><p id="review-error" role="alert"></p>`;
document.body.append(review);original.hidden=true;$('review-chart-host').append(panel,...document.querySelectorAll('.detached-trend'));document.body.append($('trend-editor'));
panel.hidden=false;$('weather-trends-toggle').setAttribute('aria-pressed','true');
// Temporary render context; do not persist or replace the saved Live lookback preference.
localPreferences.lookback=null;
document.documentElement.dataset.theme='dark';
let fixture,replay,index=12,timer=null,painting=false;
const stamp=seconds=>new Date(seconds*1000).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'});
function decorateValues(){
 if(!fixture)return;
 const historical=$('review-mode').value==='archive',at=fixture.start+index*300,state=historical?replay.weather(at):fixture.weather;
 const rows=weatherReadings(state,historical?at*1000:Date.now(),{historical,preferences:weatherPreferences(),gustMinutes:gustCacheMinutes()});
 for(const [id,code,name] of fields){
  const value=$('trend-value-'+id),label=value.parentElement.querySelector('span:first-child');
  if(label.textContent!==code)label.textContent=code;label.title=name;label.setAttribute('aria-label',name);
  const row=rows[id],units=['wind','gust','visibility','pressure','rainAccumulation'].includes(id)&&row.unit?' '+row.unit:'',showNow=!historical&&$('review-now').checked;
  const expected=(showNow?'Now ':'')+row.text+units;
  if(value.textContent!==expected){value.replaceChildren();if(showNow){const now=document.createElement('span');now.className='review-now';now.textContent='Now ';value.append(now);}value.append(document.createTextNode(row.text+units));}
  value.title=(historical?'At capture '+stamp(at):'Latest current reading')+' · '+readingExplanation(row,t=>stamp(t/1000));
  value.setAttribute('aria-label',value.title);value.dataset.cached=String(row.retained);value.dataset.health=row.health;
 }
}
function paint(){
 if(!fixture||painting)return;painting=true;
 try{
  const historical=$('review-mode').value==='archive',at=fixture.start+index*300;
  const state=historical?replay.weather(at):fixture.weather;
  const width=Number($('review-width').value),scale=Number($('review-font').value)/100;
  panel.style.width=width+'px';panel.style.height='260px';
  for(const detached of document.querySelectorAll('.detached-trend')){detached.style.width=width+'px';detached.style.height='140px';}
  for(const [id] of fields)$('trend-value-'+id).parentElement.style.fontSize=11*scale+'px';
  paintWeatherTrends({history:fixture.weatherHistory,valueHistory:fixture.weatherHistory,start:fixture.start,end:fixture.end,time:at,state,historical,zone:'Europe/London'});
  decorateValues();
  const overflow=fields.filter(([id])=>{const plot=$('trend-'+id).closest('.trend-mini');if(plot.hidden)return false;const legend=$('trend-value-'+id).parentElement;return legend.scrollWidth>legend.clientWidth+1||[...legend.children].some(child=>child.scrollWidth>child.clientWidth+1);}).map(([,code])=>code);
  $('review-status').textContent=(historical?'Archive value follows the capture.':'Live value stays current while the capture line moves.')+(overflow.length?' Legend exceeds width: '+overflow.join(', '):' No legend overflow at this size.');
  $('review-width-out').textContent=width+'px'+(width===180?' (minimum)':'');$('review-font-out').textContent=Math.round(scale*100)+'%';
  $('review-capture').textContent=stamp(at);$('review-now').disabled=historical;
 }finally{painting=false;}
}
for(const id of ['review-mode','review-now','review-theme'])$(id).onchange=()=>{document.documentElement.dataset.theme=$('review-theme').value;paint();};
for(const id of ['review-width','review-font'])$(id).oninput=paint;
$('review-scrub').oninput=event=>{index=Number(event.target.value);paint();};
$('review-play').onclick=()=>{if(timer){clearInterval(timer);timer=null;$('review-play').textContent='Play';}else{$('review-play').textContent='Pause';timer=setInterval(()=>{index=(index+1)%25;$('review-scrub').value=index;paint();},700);}};
new ResizeObserver(paint).observe(panel);
// The renderer also repaints on resize; restore this DEV trial's mode-specific value afterwards.
const valueObserver=new MutationObserver(decorateValues);for(const [id] of fields)valueObserver.observe($('trend-value-'+id),{childList:true,characterData:true,subtree:true});
try{
 const response=await fetch('/__dev/chart-values-data');if(!response.ok)throw Error('Synthetic fixture unavailable');fixture=await response.json();replay=createWeatherReplay(fixture.weatherHistory);paint();
}catch(error){$('review-error').textContent=error.message;}
