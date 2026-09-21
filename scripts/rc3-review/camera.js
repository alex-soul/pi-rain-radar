import {shared,change} from './shared.js';
export {cameraSummary} from '/camera-settings-ui.js';
const $=id=>document.getElementById(id);
export function setupCameraSettings(canEdit){
 const editor=document.createElement('dialog');editor.id='review-camera-dialog';editor.setAttribute('aria-labelledby','review-camera-title');
 editor.innerHTML=`<div class="settings-heading"><h2 id="review-camera-title">Add camera</h2><button type="button" id="review-camera-close" aria-label="Close camera setup">×</button></div><div class="settings-content"><label for="review-camera-label">Camera name</label><input id="review-camera-label" maxlength="80" value="Camera"><label for="review-camera-mode">Source</label><select id="review-camera-mode"><option value="direct">Direct snapshot</option><option value="ha">Home Assistant</option></select><div id="review-direct-fields"><label for="review-camera-url">Snapshot URL</label><input id="review-camera-url" type="password" placeholder="https://camera.example/snapshot" autocomplete="off"><label for="review-camera-auth">Authentication</label><select id="review-camera-auth"><option value="none">None / credentials in URL</option><option value="basic">Basic</option><option value="digest">Digest</option><option value="bearer">Bearer token</option></select><div id="review-direct-user" hidden><label for="review-camera-user">Username</label><input id="review-camera-user" autocomplete="off"><label for="review-camera-secret">Password</label><input id="review-camera-secret" type="password" autocomplete="off"></div><div id="review-direct-token" hidden><label for="review-camera-token">Access token</label><input id="review-camera-token" type="password" autocomplete="off"></div></div><div id="review-ha-camera-fields" hidden><label for="review-camera-entity">Camera</label><select id="review-camera-entity"></select><p id="review-discovery-note" role="status"></p></div><p id="review-camera-feedback" role="status"></p><div class="weather-key-actions"><button type="button" id="review-camera-preview">Preview</button><button type="button" id="review-camera-commit" disabled>Add</button></div></div>`;
 document.body.append(editor);
 const preview=document.createElement('dialog');preview.id='review-preview-dialog';preview.setAttribute('aria-label','Camera preview');preview.innerHTML='<img id="review-preview-image" alt="Synthetic camera preview"><button type="button" id="review-preview-back">Back</button>';document.body.append(preview);
 let tested=false,epoch=0;
 function invalidate(){tested=false;$('review-camera-commit').disabled=true;}
 async function layout(){
  const current=++epoch,ha=$('review-camera-mode').value==='ha',auth=$('review-camera-auth').value;invalidate();
  $('review-direct-fields').hidden=ha;$('review-ha-camera-fields').hidden=!ha;$('review-direct-user').hidden=!['basic','digest'].includes(auth);$('review-direct-token').hidden=auth!=='bearer';
  $('review-camera-preview').disabled=ha;
  if(ha){$('review-camera-entity').replaceChildren();$('review-discovery-note').textContent=shared.ha?'Loading cameras…':'Configure Home Assistant in System > API first.';if(!shared.ha)return;
   await new Promise(r=>setTimeout(r,250));if(current!==epoch)return;
   const fail=['offline','auth'].includes(shared.scenario);$('review-discovery-note').textContent=fail?'Could not load cameras. Check Home Assistant connection.':shared.scenario==='empty'?'No cameras found.':'';
   if(!fail&&shared.scenario!=='empty')for(const [id,name]of [['camera.drive','Drive'],['camera.garden','Garden']])$('review-camera-entity').add(new Option(name,id));
   if(shared.camera?.mode==='ha'&&shared.camera.entity)$('review-camera-entity').value=shared.camera.entity;
   $('review-camera-preview').disabled=!$('review-camera-entity').options.length;
  }
 }
 function open(){if(!canEdit())return;tested=false;$('review-camera-title').textContent=shared.camera?'Edit camera':'Add camera';$('review-camera-commit').textContent=shared.camera?'Save changes':'Add';$('review-camera-label').value=shared.camera?.name??'Camera';$('review-camera-mode').value=shared.camera?.mode??'direct';$('review-camera-url').value='';$('review-camera-feedback').textContent='';void layout();editor.showModal();}
 $('review-camera-add').onclick=open;$('review-camera-edit').onclick=open;
 $('review-camera-close').onclick=()=>editor.close();$('review-preview-back').onclick=()=>preview.close();
 editor.addEventListener('close',()=>{epoch++;invalidate();for(const id of ['review-camera-url','review-camera-user','review-camera-secret','review-camera-token'])$(id).value='';});
 $('review-camera-mode').onchange=layout;$('review-camera-auth').onchange=layout;editor.addEventListener('input',invalidate);
 $('review-camera-preview').onclick=async()=>{
  if(!canEdit())return;
  if($('review-camera-mode').value==='direct'&&!shared.camera&&!$('review-camera-url').value){$('review-camera-feedback').textContent='Enter a snapshot URL.';return;}
  if(['offline','auth'].includes(shared.scenario)&&$('review-camera-mode').value==='ha'){$('review-camera-feedback').textContent='Home Assistant camera unavailable.';return;}
  $('review-preview-image').src='/__review/camera.jpg?portrait='+Number(shared.scenario==='portrait');preview.showModal();tested=true;$('review-camera-commit').disabled=false;$('review-camera-feedback').textContent='Preview ready.';
 };
 $('review-camera-commit').onclick=async()=>{if(!tested||!canEdit())return;await change({action:'camera',mode:$('review-camera-mode').value,name:$('review-camera-label').value,entity:$('review-camera-entity').value,portrait:shared.scenario==='portrait'});editor.close();$('review-camera-note').textContent=shared.cameraEnabled?'Camera saved. Collecting.':'Camera saved. Collection disabled.';};
 $('review-camera-enabled').onchange=async()=>{const control=$('review-camera-enabled'),previous=shared.cameraEnabled;if(!canEdit()){control.checked=previous;return;}control.disabled=true;$('review-camera-note').textContent='Saving…';try{await change({action:'settings',cameraEnabled:control.checked});}catch{control.checked=previous;$('review-camera-note').textContent='Could not save. Please try again.';}finally{control.disabled=!shared.camera;}};
 $('review-camera-delete').onclick=async()=>{if(!canEdit())return;await change({action:'delete-camera'});$('review-camera-note').textContent='Camera removed. Recorded history is retained.';};
 return {load(){},reset(){editor.close();preview.close();}};
}
