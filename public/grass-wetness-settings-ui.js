import {shared,change} from './integrations-state.js';
import {grassDefaults,grassControls} from './grass-wetness-settings.js';
export function setupGrassSettings(panel,tabs){
 const section=document.createElement('section');section.id='review-weather-grass';section.hidden=true;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','review-grass-tab');
 section.innerHTML='<label class="misc-option" for="grass-enabled">Calculate grass wetness<input id="grass-enabled" type="checkbox" class="control-switch" role="switch"></label><div class="grass-tuning">'+grassControls.map(([key,label,hint,min,max])=>`<div><label for="grass-${key}">${label}<output id="grass-${key}-value"></output></label><input id="grass-${key}" type="range" min="${min}" max="${max}" step="0.05"></div>`).join('')+'</div><div class="weather-key-actions grass-settings-actions"><button id="grass-apply" type="button">Apply</button><button id="grass-defaults" type="button">Reset to defaults</button></div><p id="grass-settings-note" role="status"></p>';
 const tab=document.createElement('button');tab.id='review-grass-tab';tab.type='button';tab.setAttribute('role','tab');tab.setAttribute('aria-controls',section.id);tab.setAttribute('aria-selected','false');tab.tabIndex=-1;tab.textContent='Grass';tabs.append(tab);panel.append(section);
 const $=id=>section.querySelector('#'+id);let dirty=false,busy=false;
 function paint(value){$('grass-enabled').checked=value.enabled;for(const [key]of grassControls){$('grass-'+key).value=value[key];$('grass-'+key+'-value').textContent=Number(value[key]).toFixed(2)+'×';}}
 function sync(){if(!dirty&&!busy)paint({...grassDefaults,...shared.grassWetness});$('grass-apply').disabled=busy||!shared.initialized;}
 section.addEventListener('input',e=>{if(!e.target.matches('input'))return;dirty=true;if(e.target.type==='range')$(e.target.id+'-value').textContent=Number(e.target.value).toFixed(2)+'×';$('grass-settings-note').textContent='Unsaved changes.';});
 $('grass-defaults').onclick=()=>{paint({...grassDefaults,enabled:$('grass-enabled').checked});dirty=true;$('grass-settings-note').textContent='Defaults selected. Apply to save.';};
 $('grass-apply').onclick=async()=>{if(busy)return;busy=true;sync();try{const grassWetness={enabled:$('grass-enabled').checked,...Object.fromEntries(grassControls.map(([key])=>[key,Number($('grass-'+key).value)]))};await change({action:'settings',grassWetness});dirty=false;$('grass-settings-note').textContent='Saved.';}catch(error){$('grass-settings-note').textContent=error.message;}finally{busy=false;sync();}};
 window.addEventListener('integration-change',sync);sync();
}
