const $=id=>document.getElementById(id);
export function setupEmbedSettings(canEdit,request) {
  if($('embed-address'))$('embed-address').textContent=new URL('/embed',location.href).href;
  let epoch=0,busy=false,pending=null,saved=null,desired=null;
  const visibility=()=>{$('embed-fields').hidden=!$('embed-enabled').checked;};
  $('embed-enabled').addEventListener('change',()=>{visibility();queue('enabled',$('embed-enabled').checked);});
  for(const name of ['hours','speed','theme','origins'])$(`embed-${name}`).addEventListener('change',()=>{
    const value=$(`embed-${name}`).value;
    queue(name,name==='origins'?value.split(/\s+/).filter(Boolean):name==='theme'?value:Number(value));
  });
  function paint(value) {
    $('embed-enabled').checked=value.enabled;
    $('embed-origins').value=value.origins.length?value.origins.join('\n'):'http://homeassistant.local:8123';
    for(const name of ['hours','speed','theme'])$(`embed-${name}`).value=value[name];
    visibility();
  }
  function queue(name,value) {
    if(!canEdit()||!desired)return;
    // Disabling must still work if another field contains an invalid draft.
    desired=name==='enabled'&&!value?{...saved,enabled:false}:{...desired,[name]:value};
    if(name==='enabled'&&value&&!desired.origins.length)desired.origins=$('embed-origins').value.split(/\s+/).filter(Boolean);
    pending=structuredClone(desired);void save();
  }
  async function save() {
    if(busy)return;busy=true;const current=epoch;
    try {
      while(pending&&current===epoch&&canEdit()) {
        const next=pending;pending=null;$('embed-note').textContent='Saving…';
        try {
          const response=await request('/embed',next),result=await response.json();
          if(current!==epoch)return;
          if(!response.ok)throw new Error(result.error||'Could not save embed settings.');
          saved=next;
          if(!next.enabled&&!pending)paint(next);
          $('embed-note').textContent='Saved. Reload the embed to apply changes.';
        }catch(error){
          if(current!==epoch)return;
          if(!pending){desired.enabled=saved.enabled;$('embed-enabled').checked=saved.enabled;visibility();}
          $('embed-note').textContent=error.message||'Could not confirm the save. Reopen Settings to check.';
        }
      }
    }finally{if(current===epoch)busy=false;}
  }
  return {
    clear(){epoch++;busy=false;pending=null;saved=desired=null;},
    async load(){const current=++epoch;try{const response=await request('/embed');if(!response.ok)throw new Error();const result=await response.json();if(current===epoch){saved=structuredClone(result);desired=structuredClone(result);paint(result);$('embed-note').textContent='';}}catch{if(current===epoch)$('embed-note').textContent='Embed settings unavailable.';}},
  };
}
