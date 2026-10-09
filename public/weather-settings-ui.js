import {shared,change,settingsRequest} from './integrations-state.js';
import {weatherFields,haFields,canonicalUnit,haUnitChoices,rainUnits} from './weather-policy.js';
import {readingNames} from './weather-format.js';
import {weatherReadings,readingSourceCaption} from './weather-readings.js';
import {gustCacheMinutes,weatherPreferences} from './display.js';
const $=id=>document.getElementById(id);
const make=html=>{const t=document.createElement('template');t.innerHTML=html;return t.content.firstElementChild;};
let entities=[],generation=0,loading=false,lastPolicy='',built=false;
const readingOpen=()=>built&&$('settings-dialog').open&&!$('settings-fields').hidden&&$('review-readings-tab').getAttribute('aria-selected')==='true'&&!$('settings-panel-weather').hidden;
function options(){
  const rain=$('review-rain-accumulation'),selectedRain=shared.rainAccumulation??'disabled';
  rain.replaceChildren(new Option('Disabled','disabled'));
  if(shared.haCollect&&shared.ha){
    for(const entity of entities.filter(e=>e.deviceClass==='precipitation'&&['total','total_increasing'].includes(e.stateClass)&&rainUnits.includes(e.unit.trim().toLowerCase())))rain.add(new Option(entity.name+' · '+entity.unit,entity.id));
    if(selectedRain!=='disabled'&&![...rain.options].some(o=>o.value===selectedRain))rain.add(new Option(selectedRain+' · unavailable',selectedRain));
  }
  rain.value=selectedRain;rain.disabled=!shared.ha||!shared.haCollect||!shared.initialized;
  for(const field of weatherFields){
    const node=$('review-map-'+field),selected=shared.mappings[field]??'owm';
    node.replaceChildren(new Option('Disabled','disabled'),new Option('OpenWeather','owm'));
    if(shared.haCollect&&shared.ha&&haFields.includes(field)){
      const units=haUnitChoices[field];
      for(const entity of entities.filter(e=>units.includes(canonicalUnit(e.unit))))node.add(new Option(entity.name+' · '+entity.unit,entity.id));
      if(selected.startsWith('sensor.')&&![...node.options].some(o=>o.value===selected))node.add(new Option(selected+' · unavailable',selected));
    }
    node.value=selected;
  }
}
function sync(){
  if(!built)return;
  const signature=JSON.stringify([shared.revision,shared.ha,shared.owm]);
  if(signature!==lastPolicy){lastPolicy=signature;options();}
  if(!shared.haCollect){generation++;entities=[];}
  for(const [id,key,configured] of [['review-owm-collect','owmCollect',shared.owm],['review-ha-collect','haCollect',shared.ha],['review-forecast-collect','forecastCollect',shared.owm]]){
    $(id).checked=!!configured&&!!shared[key];$(id).disabled=!configured||!shared.initialized;
  }
  $('review-fallback').checked=shared.fallback;$('review-fallback').disabled=!shared.owm||!shared.owmCollect;
  $('review-fallback-row').hidden=!haFields.some(field=>shared.mappings[field]?.startsWith('sensor.'));
  const rain=shared.presentation?.observedRain;
  $('review-rain-status').textContent=rain?.entity?(rain.eligible?`${rain.value} ${rain.unit}`:rain.reason):'';
  const gust=shared.mappings.gust==='owm';$('review-gust-cache').hidden=!gust;$('gust-cache-minutes').disabled=!gust;
  $('review-reading-options').hidden=true;
  $('review-reading-options').classList.add('single-option');
  const rows=weatherReadings(shared.weather,Date.now(),{preferences:weatherPreferences(),gustMinutes:gustCacheMinutes()});
  for(const [id,row] of Object.entries(rows).filter(([id])=>weatherFields.includes(id))){
    $('reading-health-'+id).dataset.health=row.health;$('reading-health-'+id).title=row.reason||'OK';
    $('reading-health-'+id).setAttribute('aria-label',row.reason||'OK');
    $('reading-source-'+id).textContent=readingSourceCaption(row);
    $('review-unit-'+id).textContent=row.reason.startsWith('Unit mismatch')?row.reason:'';
  }
  $('shared-unit-note').textContent=shared.initialized?'':'Adopting this screen’s saved units…';
  for(const id of ['temperature-unit','wind-unit','visibility-unit','pressure-unit'])$(id).disabled=!shared.initialized;
}
async function save(input){
  $('review-weather-note').textContent='';
  try{await change({action:'settings',...input});}
  catch(error){$('review-weather-note').textContent=error.message;lastPolicy='';sync();}
}
export async function loadWeatherChoices(){
  if(!readingOpen()||!shared.ha||!shared.haCollect||loading)return;
  loading=true;const epoch=++generation,revision=shared.revision;
  try{const result=await settingsRequest('/home-assistant/entities');
    if(epoch!==generation||revision!==shared.revision||!readingOpen()||!shared.haCollect)return;
    entities=result.entities;options();
  }catch(error){if(epoch===generation&&readingOpen())$('review-weather-note').textContent=error.message;}
  finally{loading=false;if(epoch!==generation&&readingOpen()&&shared.haCollect)void loadWeatherChoices();}
}
export function setupWeatherLayout(){
  const panel=$('settings-panel-weather'),units=make('<section id="review-weather-units" role="tabpanel" aria-labelledby="review-units-tab" hidden></section>');
  units.append(...panel.children);panel.append(units);units.append(make('<p id="shared-unit-note" role="status"></p>'));
  const readings=make(`<section id="review-weather-readings" role="tabpanel" aria-labelledby="review-readings-tab" hidden><div class="weather-provider-switches settings-group" id="review-weather-collection"></div><div class="weather-source-grid">${weatherFields.map(field=>`<div><label for="review-map-${field}">${readingNames[field]}</label><select id="review-map-${field}"></select><small id="review-unit-${field}" role="status"></small></div>`).join('')}</div><div id="review-reading-options" class="weather-reading-options"><label id="review-fallback-row" class="misc-option" for="review-fallback">OWM fallback<input id="review-fallback" type="checkbox" class="control-switch" role="switch"></label><div id="review-gust-cache"></div></div><p id="review-weather-note" role="status"></p></section>`);
  readings.querySelector('.weather-source-grid').append(make('<div><label for="review-rain-accumulation">Observed rain (accumulated)</label><select id="review-rain-accumulation"></select><small id="review-rain-status" role="status"></small></div>'));
  const fallback=make('<div></div>');fallback.append(readings.querySelector('#review-fallback-row'));readings.querySelector('.weather-source-grid').append(fallback);
  readings.querySelector('#review-rain-accumulation').onchange=()=>save({rainAccumulation:$('review-rain-accumulation').value});
  for(const [id,label] of [['review-owm-collect','OpenWeather'],['review-ha-collect','Home Assistant']]){const row=$(id).closest('label');row.firstChild.textContent=label;readings.querySelector('#review-weather-collection').append(row);}
  $('openweather-config').querySelector('.review-collection')?.remove();
  const gust=$('gust-cache-minutes').closest('label');gust.firstChild.textContent='Gust cache';readings.querySelector('#review-gust-cache').append(gust);units.querySelector('.gust-setting-row')?.remove();
  const forecast=make('<section id="review-weather-forecast" role="tabpanel" aria-labelledby="review-forecast-tab" hidden><div class="settings-group"><label class="misc-option" for="review-forecast-collect">Enable forecast data collection<input id="review-forecast-collect" type="checkbox" class="control-switch" role="switch"></label><p>OpenWeather minute forecast.</p></div></section>');
  const tabs=make('<div class="settings-tabs settings-subtabs" role="tablist" aria-label="Weather categories"></div>');
  const dock=$('settings-tab-readings');dock.textContent='Dock';tabs.append(dock);
  for(const [id,label,target] of [['readings','Readings','readings'],['units','Units','units'],['forecast','Forecast','forecast']])tabs.append(make(`<button id="review-${id}-tab" type="button" role="tab" aria-controls="review-weather-${target}" aria-selected="false" tabindex="-1">${label}</button>`));
  dock.setAttribute('aria-selected','true');dock.tabIndex=0;$('settings-panel-readings').hidden=false;
  panel.append(tabs,$('settings-panel-readings'),readings,units,forecast);
  for(const field of weatherFields){
    const label=$('reading-'+field).previousElementSibling;
    label.prepend(make(`<span id="reading-health-${field}" class="reading-health" role="img" aria-label="Not configured"></span>`));
    label.append(make(`<small id="reading-source-${field}" class="reading-source"></small>`));
    $('review-map-'+field).onchange=()=>save({mappings:{[field]:$('review-map-'+field).value}});
  }
  for(const [id,key] of [['review-owm-collect','owmCollect'],['review-ha-collect','haCollect'],['review-forecast-collect','forecastCollect'],['review-fallback','fallback']])$(id).onchange=async()=>{
    const value=$(id).checked;$(id).disabled=true;await save({[key]:value});sync();if(key==='haCollect'&&value)await loadWeatherChoices();
  };
  const derivedLabel=$('reading-depression').previousElementSibling;derivedLabel.prepend(make('<span id="reading-health-depression" class="reading-health" role="img" aria-label="Calculated reading"></span>'));derivedLabel.append(make('<small id="reading-source-depression" class="reading-source">Temperature minus dew point</small>'));
  const rainLabel=$('reading-rainAccumulation').previousElementSibling;rainLabel.prepend(make('<span id="reading-health-rainAccumulation" class="reading-health" role="img" aria-label="Not configured"></span>'));rainLabel.append(make('<small id="reading-source-rainAccumulation" class="reading-source"></small>'));
  built=true;window.addEventListener('integration-change',sync);sync();
  $('settings-dialog').addEventListener('settings-tab-change',()=>{if(readingOpen())void loadWeatherChoices();else generation++;});
  $('settings-dialog').addEventListener('close',()=>{generation++;entities=[];});
}
