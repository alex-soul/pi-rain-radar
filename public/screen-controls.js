export function setupScreenControls(canEdit,request){
  const $=id=>document.getElementById(id),panel=$('appliance-screen');
  panel.innerHTML='<p id="screen-preview-note" role="status">Checking screen controls…</p><fieldset id="screen-preview-controls" disabled><fieldset class="screen-group"><legend>Brightness</legend><label for="screen-brightness">Level <output id="screen-brightness-value"></output></label><input id="screen-brightness" type="range" min="10" max="100" step="1"></fieldset><fieldset class="screen-group"><legend>Sleep timer</legend><label class="misc-option">Enable sleep timer<input id="screen-sleep" type="checkbox" class="control-switch" role="switch"></label><label for="screen-timeout">Idle timeout <output id="screen-timeout-value"></output></label><input id="screen-timeout" type="range" min="1" max="120" step="1"></fieldset></fieldset>';
  const controls=$('screen-preview-controls'),note=$('screen-preview-note');let epoch=0,busy=false,loading=false,editing=false,latest=null;
  const visible=()=>canEdit()&&!panel.hidden&&!$('settings-panel-power').hidden;
  const labels=()=>{$('screen-brightness-value').textContent=$('screen-brightness').value+'%';$('screen-timeout-value').textContent=$('screen-timeout').value+' min';};
  function paint(s){
    latest=s;controls.disabled=s?.state!=='ready'||busy;
    if(s?.state!=='ready'){note.textContent=s?.error||'Screen controls unavailable.';return;}
    $('screen-brightness').value=s.brightness;$('screen-sleep').checked=s.automatic_blanking;$('screen-timeout').value=s.idle_timeout;$('screen-timeout').disabled=!s.automatic_blanking;
    labels();$('screen-brightness-value').textContent=s.brightness+'%';note.textContent=!s.persistence_ok?'Applied, but could not save for restart. The controller will retry.':s.persistence_pending?'Applied; saving…':s.synthetic?'Synthetic display controller — no physical screen or broker is connected.':'';
  }
  async function load(){
    if(!visible()||busy||editing||loading)return;const generation=epoch;loading=true;
    try{const response=await request('/screen');if(!response.ok)throw Error();const s=await response.json();if(generation===epoch&&visible()&&!busy&&!editing)paint(s);}
    catch{if(generation===epoch&&visible()&&!busy&&!editing)paint({state:'unavailable',error:'Could not read Screen settings. Retrying…'});}
    finally{loading=false;}
  }
  for(const [id,action]of [['screen-brightness','brightness'],['screen-sleep','automatic_blanking'],['screen-timeout','idle_timeout']]){
    const input=$(id);
    input.addEventListener('pointerdown',()=>{editing=true;});
    input.addEventListener('input',()=>{editing=true;labels();});
    input.addEventListener('change',async()=>{
      editing=false;if(!canEdit()||busy)return;const generation=++epoch;busy=true;controls.disabled=true;note.textContent='Applying…';
      try{const response=await request('/screen',{action,value:input.type==='checkbox'?input.checked:Number(input.value)});const s=await response.json();if(!response.ok)throw Error(s.error||'Could not apply setting.');if(generation===epoch&&visible()){busy=false;paint(s);}}
      catch(e){if(generation===epoch&&visible()){controls.disabled=true;note.textContent=e.message||'Could not confirm the setting. Retrying read-back…';}}
      finally{if(generation===epoch)busy=false;}
    });
    input.addEventListener('blur',()=>{editing=false;void load();});
    input.addEventListener('pointercancel',()=>{editing=false;if(latest)paint(latest);});
    input.addEventListener('pointerup',()=>{if(!busy){editing=false;void load();}});
  }
  $('settings-dialog').addEventListener('settings-tab-change',()=>{editing=false;void load();});
  const timer=setInterval(()=>void load(),2000);
  window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  return {load,clear(){epoch++;busy=false;editing=false;controls.disabled=true;latest=null;note.textContent='Checking screen controls…';}};
}
