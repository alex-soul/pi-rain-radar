import {shared,change,refresh,settingsRequest} from './integrations-state.js';



const $=id=>document.getElementById(id);

export function setupCameraSettings(canEdit,request){

 const editor=document.createElement('dialog');editor.id='review-camera-dialog';editor.setAttribute('aria-labelledby','review-camera-title');

 editor.innerHTML=`<div class="settings-heading"><h2 id="review-camera-title">Add camera</h2><button type="button" id="review-camera-close" aria-label="Close camera setup">×</button></div><div class="settings-content"><label for="review-camera-label">Camera name</label><input id="review-camera-label" maxlength="80" value="Camera"><button type="button" id="review-camera-replace">Replace connection</button><label id="review-camera-mode-label" for="review-camera-mode">Source</label><select id="review-camera-mode"><option value="direct">Direct snapshot</option><option value="ha">Home Assistant</option></select><div id="review-direct-fields"><label for="review-camera-url">Snapshot URL</label><input id="review-camera-url" type="password" placeholder="https://camera.example/snapshot" autocomplete="off"><label for="review-camera-auth">Authentication</label><select id="review-camera-auth"><option value="none">None / credentials in URL</option><option value="basic">Basic</option><option value="digest">Digest</option><option value="bearer">Bearer token</option></select><div id="review-direct-user" hidden><label for="review-camera-user">Username</label><input id="review-camera-user" autocomplete="off"><label for="review-camera-secret">Password</label><input id="review-camera-secret" type="password" autocomplete="off"></div><div id="review-direct-token" hidden><label for="review-camera-token">Access token</label><input id="review-camera-token" type="password" autocomplete="off"></div></div><div id="review-ha-camera-fields" hidden><label for="review-camera-entity">Camera</label><select id="review-camera-entity"></select><p id="review-discovery-note" role="status"></p></div><p id="review-camera-feedback" role="status"></p><div class="weather-key-actions"><button type="button" id="review-camera-preview">Preview</button><button type="button" id="review-camera-commit" disabled>Add</button></div></div>`;

 document.body.append(editor);

 const preview=document.createElement('dialog');preview.id='review-preview-dialog';preview.setAttribute('aria-label','Camera preview');preview.innerHTML='<img id="review-preview-image" alt="Camera preview"><button type="button" id="review-preview-back">Back</button>';document.body.append(preview);

 let nameOnly=false,tested=false,epoch=0,ticket=null,blob=null,busy=false,thumbnailBlob=null;
 const thumbnail=document.createElement("img");thumbnail.alt="Saved camera preview";thumbnail.hidden=true;$("review-camera-row").prepend(thumbnail);
 async function loadThumbnail(){try{const response=await request("/camera/thumbnail");if(!response.ok){thumbnail.hidden=true;return;}const image=await response.blob();if(!canEdit())return;if(thumbnailBlob)URL.revokeObjectURL(thumbnailBlob);thumbnailBlob=URL.createObjectURL(image);thumbnail.src=thumbnailBlob;thumbnail.hidden=false;}catch{thumbnail.hidden=true;}}

 function invalidate(){tested=false;ticket=null;$('review-camera-commit').disabled=!nameOnly;}

 async function layout(){

  const current=++epoch,ha=$('review-camera-mode').value==='ha',auth=$('review-camera-auth').value;invalidate();

  $('review-camera-replace').hidden=!nameOnly;$('review-camera-mode').hidden=nameOnly;$('review-camera-mode-label').hidden=nameOnly;$('review-camera-preview').hidden=nameOnly;
  if(nameOnly){$('review-direct-fields').hidden=true;$('review-ha-camera-fields').hidden=true;return;}
  $('review-direct-fields').hidden=ha;$('review-ha-camera-fields').hidden=!ha;$('review-direct-user').hidden=!['basic','digest'].includes(auth);$('review-direct-token').hidden=auth!=='bearer';

  $('review-camera-preview').disabled=ha;

  if(ha){$('review-camera-entity').replaceChildren();$('review-discovery-note').textContent=shared.ha?'Loading cameras…':'Configure Home Assistant in System > API first.';if(!shared.ha)return;

   try{const {cameras}=await settingsRequest('/camera/discover',{});if(current!==epoch)return;
   $('review-discovery-note').textContent=cameras.length?'':'No cameras found.';
   for(const {id,name} of cameras)$('review-camera-entity').add(new Option(name,id));
   }catch(e){if(current===epoch)$('review-discovery-note').textContent=e.message;}
   if(shared.camera?.mode==='ha'&&shared.camera.entity)$('review-camera-entity').value=shared.camera.entity;

   $('review-camera-preview').disabled=!$('review-camera-entity').options.length;

  }

 }

 function open(){if(!canEdit())return;nameOnly=!!shared.camera;tested=false;$('review-camera-title').textContent=shared.camera?'Edit camera':'Add camera';$('review-camera-commit').textContent=shared.camera?'Save changes':'Add';$('review-camera-label').value=shared.camera?.name??'Camera';$('review-camera-mode').value=shared.camera?.mode??'direct';$('review-camera-url').value='';$('review-camera-feedback').textContent='';void layout();editor.showModal();}

 $('review-camera-replace').onclick=()=>{nameOnly=false;void layout();};
 $('review-camera-add').onclick=open;$('review-camera-edit').onclick=open;

 $('review-camera-close').onclick=()=>editor.close();$('review-preview-back').onclick=()=>preview.close();

 editor.addEventListener('close',()=>{epoch++;invalidate();for(const id of ['review-camera-url','review-camera-user','review-camera-secret','review-camera-token'])$(id).value='';});

 $('review-camera-mode').onchange=layout;$('review-camera-auth').onchange=layout;editor.addEventListener('input',()=>{epoch++;invalidate();});

 function values(){const mode=$('review-camera-auth').value;return {mode:$('review-camera-mode').value,name:$('review-camera-label').value,url:$('review-camera-url').value,entity:$('review-camera-entity').value,auth:{mode,...(['basic','digest'].includes(mode)?{username:$('review-camera-user').value,password:$('review-camera-secret').value}:{}),...(mode==='bearer'?{token:$('review-camera-token').value}:{})}};}
 $('review-camera-preview').onclick=async()=>{
  if(!canEdit()||busy)return;busy=true;const current=epoch;invalidate();$('review-camera-preview').disabled=true;
  try{const result=await settingsRequest('/camera/test',values());if(current!==epoch||!canEdit())return;
   const response=await request('/camera/preview?ticket='+encodeURIComponent(result.ticket));if(!response.ok)throw Error('Preview expired. Try again.');const bytes=await response.blob();if(current!==epoch||!canEdit())return;
   if(blob)URL.revokeObjectURL(blob);blob=URL.createObjectURL(bytes);$('review-preview-image').src=blob;preview.showModal();ticket=result.ticket;tested=true;$('review-camera-commit').disabled=false;$('review-camera-feedback').textContent=result.fresh?'Preview ready.':'Connected, but the snapshot is more than ten minutes old.';
  }catch(e){if(current===epoch)$('review-camera-feedback').textContent=e.message;}finally{busy=false;$('review-camera-preview').disabled=false;}
 };
 $('review-camera-commit').onclick=async()=>{if((!tested&&!nameOnly)||!canEdit()||busy)return;busy=true;
  try{await settingsRequest('/camera',nameOnly?{name:$('review-camera-label').value}:{ticket,enabled:shared.cameraEnabled});await refresh();await loadThumbnail();editor.close();$('review-camera-note').textContent=shared.cameraEnabled?'Camera saved. Collecting.':'Camera saved. Collection disabled.';}catch(e){$('review-camera-feedback').textContent=e.message;}finally{busy=false;}
 };
 $('review-camera-enabled').onchange=async()=>{const control=$('review-camera-enabled'),previous=shared.cameraEnabled;if(!canEdit()){control.checked=previous;return;}control.disabled=true;$('review-camera-note').textContent='Saving…';try{await change({action:'settings',cameraEnabled:control.checked});}catch{control.checked=previous;$('review-camera-note').textContent='Could not save. Please try again.';}finally{control.disabled=!shared.camera;}};

 $('review-camera-delete').onclick=async()=>{if(!canEdit())return;try{await change({action:'delete-camera'});$('review-camera-note').textContent='Camera removed. Recorded history is retained.';}catch(e){$('review-camera-note').textContent=e.message;}};

 return {load(){void refresh();void loadThumbnail();},reset(){editor.close();preview.close();if(blob)URL.revokeObjectURL(blob);blob=null;}};

}


export function cameraSummary(s,timeZone='UTC'){
  if(!s?.configured)return s?.error??'Not configured';
  const date=t=>t===null||t===undefined?'—':new Date(t).toLocaleString('en-GB',{timeZone,dateStyle:'short',timeStyle:'medium'});
  return `${s.name} · ${s.mode==='ha'?'Home Assistant':'Direct snapshot'} · ${s.state}\n${s.basis==='metadata'?'Captured':'Retrieved'}: ${date(s.snapshotTime)}\nLast successful collection: ${date(s.lastSuccess)}\nNext collection: ${date(s.nextCollection)}${s.unchanged?'\nImage unchanged since the previous collection.':''}${s.error?'\n'+s.error:''}`;
}
