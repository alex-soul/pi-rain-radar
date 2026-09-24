const $=id=>document.getElementById(id);
export function setupRadarSettings(canEdit,request) {
  // The separate UI fixture owns its simulated controls.
  if($('fixture-toggle'))return {load(){},clear(){}};
  let configured=false,usage={tiles:0,requests:0},busy=false,generation=0,tilesPerView={main:6,overview:6};
  let appliedSources = {main:'rainviewer',overview:'same'};
  const confirmation = document.createElement('dialog'); confirmation.id='radar-confirm-dialog'; confirmation.ariaLabel='Rainbow configured';
  confirmation.innerHTML='<h2>Rainbow configured</h2><p>Your key is saved. Save and apply your provider changes now?</p><div class="weather-key-actions"><button type="button" id="radar-confirm-cancel">Not now</button><button type="button" id="radar-confirm-apply">Save and Apply</button></div>';
  document.body.append(confirmation);
  $('radar-confirm-cancel').onclick=()=>confirmation.close();
  $('radar-confirm-apply').onclick=()=>{ confirmation.close(); $('radar-apply').click(); };
  const panel=document.createElement('div');panel.id='rainviewer-config';panel.className='api-provider-config';
  panel.innerHTML='<details class="estimate-drawer"><summary>RainViewer public API</summary><p>RainViewer generously provides public API access without a key. Data is cached and shared across displays to respect rate limits.</p><a class="api-setup-link" href="https://github.com/alex-soul/pi-rain-radar/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener noreferrer">Usage &amp; limits</a></details>';
  const left=document.createElement('div');left.className='radar-source-column';
  const selectors=$('radar-main-source').closest('.units-grid');selectors.before(left);
  left.append(selectors,$('radar-settling').closest('label'),$('radar-settling-note'),panel);
  $('rainbow-key').after($('rainbow-key-note'));
  left.append($('radar-apply').closest('.weather-key-actions'),$('radar-source-note'));
  const unavailableNote='Rainbow is disabled until an API key is configured. Choose RainViewer to change the saved source.';
  function availability(){
    for(const id of ['radar-main-source','radar-overview-source']){
      const option=$(id).querySelector('option[value="rainbow"]');
      option.hidden=!configured;option.disabled=!configured;option.textContent=configured?'Rainbow Weather':'Rainbow Weather · API key required';
    }
    $('radar-apply').disabled=busy||(!configured&&['radar-main-source','radar-overview-source'].some(id=>$(id).value==='rainbow'));
    if(!configured&&['radar-main-source','radar-overview-source'].some(id=>$(id).value==='rainbow'))$('radar-source-note').textContent=unavailableNote;
    else if($('radar-source-note').textContent===unavailableNote)$('radar-source-note').textContent='';
  }
  async function refreshSelection(){
    const response=await request('');if(!response.ok)return;
    const result=await response.json();if(!result.radar)return;
    appliedSources={main:result.radar.main,overview:result.radar.overview};
    for(const role of ['main','overview'])$('radar-'+role+'-source').value=appliedSources[role];
    estimate();window.dispatchEvent(new Event('radar-sources-change'));
  }
  window.addEventListener('radar-provider-change',()=>{void refreshSelection();});
  function buttons(){availability(); $('rainbow-save').textContent=configured?'Replace key':'Save key';$('rainbow-remove').disabled=busy||!configured;$('rainbow-save').disabled=busy; }
  function estimate(){
    availability();
    const main=$('radar-main-source').value,overview=$('radar-overview-source').value==='same'?main:$('radar-overview-source').value;
    $('rainbow-config').hidden=main!=='rainbow'&&overview!=='rainbow';panel.hidden=main!=='rainviewer'&&overview!=='rainviewer';
    $('rainbow-limit-fields').hidden=!$('rainbow-cap').checked;
  }
  for(const id of ['radar-main-source','radar-overview-source','rainbow-cap','rainbow-limit'])$(id).addEventListener('change',estimate);
  $('rainbow-limit').addEventListener('input',estimate);
  async function key(remove){
    if(!canEdit()||busy)return;const initial=!configured;const epoch=generation,apiKey=remove?'':$('rainbow-key').value.trim();
    if(!remove&&!apiKey){$('rainbow-key-note').textContent='Enter a Rainbow API key.';return;}
    $('rainbow-key').value='';busy=true;buttons();$('rainbow-key-note').textContent='Checking…';
    try{
      const response=await request('/rainbow',{apiKey}),result=await response.json();if(epoch!==generation)return;
      if(response.status===401){$('settings-dialog').close();return;}
      if(Object.hasOwn(result,'configured'))configured=result.configured;
      if(result.usage)usage=result.usage;
      if(response.ok&&remove)await refreshSelection();
      $('rainbow-key-note').textContent=response.ok?(configured?'Configured.':'Not configured.'):(result.error||'Could not confirm the key.');estimate();
      if(response.ok && initial && configured && (appliedSources.main!==$('radar-main-source').value || appliedSources.overview!==$('radar-overview-source').value)) confirmation.showModal();
    }catch{if(epoch===generation)$('rainbow-key-note').textContent='Could not confirm the save. Reopen Settings to check.';}
    finally{busy=false;buttons();}
  }
  $('rainbow-save').onclick=()=>key(false);$('rainbow-remove').onclick=()=>key(true);
  $('radar-apply').onclick=async()=>{
    if(!canEdit()||busy)return;const epoch=generation;
    if($('rainbow-cap').checked&&!$('rainbow-limit').reportValidity())return;
    busy=true;$('radar-apply').disabled=true;$('radar-source-note').textContent='Preparing sources…';
    const selected={main:$('radar-main-source').value,overview:$('radar-overview-source').value};
    try{const response=await request('/radar',{waitForSettle:$('radar-settling').checked,main:$('radar-main-source').value,overview:$('radar-overview-source').value,monthlyLimit:$('rainbow-cap').checked?Number($('rainbow-limit').value):null});const result=await response.json();if(epoch!==generation)return;if(response.status===401){$('settings-dialog').close();return;}if(response.ok){appliedSources=selected;window.dispatchEvent(new Event('radar-sources-change'));}$('radar-source-note').textContent=response.ok?'Sources applied.':result.error||'Could not apply sources.';}
    catch{if(epoch===generation)$('radar-source-note').textContent='Could not confirm the update. Reopen Settings to check.';}
    finally{busy=false;availability();}
  };
  return {
    clear(){generation++;if(confirmation.open)confirmation.close();$('rainbow-key').value='';},
    async load(radar){
      const epoch=++generation;appliedSources={main:radar?.main??'rainviewer',overview:radar?.overview??'same'};$('radar-main-source').value=radar?.main??'rainviewer';$('radar-overview-source').value=radar?.overview??'same';$('rainbow-cap').checked=radar?.monthlyLimit!=null;$('rainbow-limit').value=radar?.monthlyLimit??28000;$('radar-source-note').textContent='';estimate();
      try{const response=await request('/rainbow');if(!response.ok)return;const state=await response.json();if(epoch!==generation)return;configured=state.configured;usage=state.usage;if(state.tilesPerView)tilesPerView=state.tilesPerView;$('rainbow-key-note').textContent=configured?'Configured.':'Not configured.';buttons();estimate();}catch{$('rainbow-key-note').textContent='Cannot reach Rainbow settings.';}
    },
  };
}
