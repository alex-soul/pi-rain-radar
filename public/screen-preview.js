// Step 1 mock only. A production server has no __dev endpoint or applied state.
export function setupScreenPreview(panel){
  panel.innerHTML='<p id="screen-preview-note">Screen controls are not connected on this installation.</p><fieldset id="screen-preview-controls" disabled><label for="screen-brightness">Brightness <output id="screen-brightness-value"></output></label><input id="screen-brightness" type="range" min="10" max="100" step="1"><label class="misc-option">Enable sleep timer<input id="screen-sleep" type="checkbox" class="control-switch" role="switch"></label><label for="screen-timeout">Idle timeout <output id="screen-timeout-value"></output></label><input id="screen-timeout" type="range" min="1" max="120" step="1"></fieldset>';
  const $=id=>document.getElementById(id);let active=false;
  const paint=s=>{$('screen-brightness').value=s.brightness;$('screen-brightness-value').textContent=s.brightness+'%';$('screen-sleep').checked=s.sleep;$('screen-timeout').value=s.timeout;$('screen-timeout-value').textContent=s.timeout+' min';$('screen-timeout').disabled=!s.sleep;};
  fetch('/__dev/screen').then(r=>r.ok?r.json():null).then(s=>{if(!s?.synthetic)return;active=true;$('screen-preview-controls').disabled=false;$('screen-preview-note').textContent='Simulated screen controls — no display or MQTT commands are sent.';paint(s);}).catch(()=>{});
  let queue=Promise.resolve();
  for(const id of ['screen-brightness','screen-sleep','screen-timeout'])$(id).addEventListener('input',()=>{
    if(!active)return;const state={brightness:Number($('screen-brightness').value),sleep:$('screen-sleep').checked,timeout:Number($('screen-timeout').value)};paint(state);
    queue=queue.then(()=>fetch('/__dev/screen',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)})).then(r=>{if(!r.ok)throw Error();}).catch(()=>{$('screen-preview-note').textContent='Simulation unavailable. Reopen the preview to retry.';});
  });
}
