import {createAviationUI} from '/aviation-ui.js';
import {cloudScenarios,parseCloudGroups} from '/__cloud-layers-model.js';
const $=id=>document.getElementById(id),prefix='dev-aviation-ui-';
document.documentElement.dataset.theme='dark';
const controls=document.createElement('section');controls.id='aviation-review';
controls.innerHTML='<details open><summary>Aviation UI review · synthetic data</summary><div class="review-controls"><label>Sky <select id="review-sky"></select></label><label>Data <select id="review-data"><option value="fresh">Up to date</option><option value="stale">Delayed · retain</option><option value="error">Error · retain</option><option value="expired">Expired · clear</option><option value="unavailable">Missing</option><option value="not-configured">Not configured</option></select></label><label>Theme <select id="review-theme"><option>dark</option><option>light</option></select></label><label>Screen <select id="review-screen"><option value="fresh">Fresh screen</option><option value="metar">METAR only · split</option><option value="clouds">Clouds only</option><option value="none">Nothing selected</option></select></label><button id="review-reset">Load screen case</button><label><input id="review-lock" type="checkbox"> Lock controls</label><a href="/__cloud-layers">Shape playground</a></div><p>Use the Aviation side button to open your selected widgets. Close, drag, resize and reload to review their behaviour. Screen cases reset only this review’s layout.</p></details>';
document.body.append(controls);controls.querySelector('details').open=innerWidth>=720;
const cases=[...cloudScenarios,...['CLR','NSC','NCD','BKN///'].map(code=>({id:code,codes:code,title:code,description:''}))];
for(const scenario of cases)$('review-sky').add(new Option(scenario.title,scenario.id));
// Clear geometry after navigation: outgoing widget blur handlers save their last layout.
if(sessionStorage.getItem(prefix+'reset')){
const choice=sessionStorage.getItem(prefix+'reset');
for(const key of ['aviation','aviation-window-metar','aviation-window-taf','cloud-window','cloud-settings'])localStorage.removeItem(prefix+key);
const selected={metar:choice==='fresh'||choice==='metar',taf:choice==='fresh',clouds:choice==='fresh'||choice==='clouds'};
localStorage.setItem(prefix+'aviation-group',JSON.stringify({split:choice==='metar',selected,open:{metar:false,taf:false,clouds:false}}));
$('review-screen').value=choice;sessionStorage.removeItem(prefix+'reset');
}
const ui=createAviationUI({storagePrefix:prefix});
const decodedResponse=await fetch('/__aviation-ui-data');
if(!decodedResponse.ok)throw Error('Synthetic Aviation explanations unavailable');
const decodedReports=await decodedResponse.json();
function update(){
  const report=parseCloudGroups(cases.find(s=>s.id===$('review-sky').value).codes),state=$('review-data').value;
  ui.updateClouds({report,station:'EGBB',timestamp:'131020Z',dataState:state,seed:7});
  ui.update({status:{reports:decodedReports[$('review-sky').value]}});
}
for(const id of ['review-sky','review-data'])$(id).onchange=update;
$('review-theme').onchange=()=>document.documentElement.dataset.theme=$('review-theme').value;
$('review-lock').onchange=()=>{document.body.classList.toggle('screen-locked',$('review-lock').checked);window.dispatchEvent(new Event('radar-screen-lock'));};
$('review-reset').onclick=()=>{sessionStorage.setItem(prefix+'reset',$('review-screen').value);location.reload();};
update();
