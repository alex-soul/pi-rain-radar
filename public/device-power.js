const $=id=>document.getElementById(id);
export function setupDevicePower(canEdit,request) {
  const acknowledgement=$('power-ack-dialog');
  $('power-ack-close').onclick=()=>acknowledgement.close();
  function accepted(name){
    $('power-ack-title').textContent=name==='restart'?'Reboot initiated':'Shutdown initiated';
    $('power-ack-message').textContent=name==='restart'?'Give your Pi a moment to restart.':'Your Pi is shutting down. Let it finish before switching off the power. Power it back up whenever you’re ready.';
    const settings=$('settings-dialog');
    settings.addEventListener('close',()=>{acknowledgement.showModal();$('power-ack-close').focus();},{once:true});
    settings.close();
  }
  const popup=$('power-dialog');let action=null,requestId=null,busy=false,generation=0;
  function message(title,text,confirm=false,guide=false){
    $('power-title').textContent=title;$('power-message').textContent=text;
    $('power-guide').hidden=!guide;$('power-confirm').hidden=!confirm;
    $('power-confirm').disabled=false;$('power-cancel').disabled=false;
    $('power-confirm').textContent=action==='restart'?'Restart':'Shutdown';
    $('power-cancel').textContent=confirm?'Cancel':'Close';
    if(!popup.open)popup.showModal();
  }
  async function state(){const response=await request('/power');if(!response.ok)throw Error();return response.json();}
  async function load(){
    if(!canEdit())return;const epoch=++generation;
    try{const value=await state();if(epoch!==generation)return;
      for(const name of ['restart','shutdown'])$('power-'+name).classList.toggle('power-unavailable',value.state!=='ready');
    }catch{for(const name of ['restart','shutdown'])$('power-'+name).classList.add('power-unavailable');}
  }
  for(const name of ['restart','shutdown'])$('power-'+name).onclick=async()=>{
    if(!canEdit()||busy)return;busy=true;action=name;requestId=crypto.randomUUID();
    const epoch=++generation;
    message('Device Power','Checking the helper…');
    try{const value=await state();if(epoch!==generation||!canEdit())return;
      if(value.state!=='ready')message(value.state==='unconfigured'?'Enable Device Power':'Power helper unavailable',value.error||(value.state==='pending'?'A recent power request is already being handled. Check the device before trying again.':'Install the optional helper on your Raspberry Pi and enable its Compose override to use these buttons. Radar works normally without it.'),false,true);
      else message(name==='restart'?'Restart this device?':'Shut down this device?',name==='restart'?'Radar will be unavailable while the device restarts.':'Radar will stop. Wait for the device to finish shutting down before disconnecting power. Reconnect power to start it again.',true);
    }catch{if(epoch===generation&&canEdit())message('Device Power unavailable','Could not check the helper. Reopen Settings and try again.',false,true);}
    finally{busy=false;}
  };
  $('power-cancel').onclick=()=>{generation++;popup.close();};
  popup.addEventListener('cancel',()=>{generation++;});
  $('power-confirm').onclick=async()=>{
    if(!canEdit()||busy||!action||!requestId)return;busy=true;
    $('power-confirm').disabled=true;$('power-cancel').disabled=true;
    const epoch=generation;
    try{const response=await request('/power',{action,requestId}),result=await response.json();if(epoch!==generation)return;
      if(response.status===202)accepted(action);
      else message('Power request not confirmed',result.error||'Check the device before trying again.',false,true);
    }catch{if(epoch===generation)message('Power request not confirmed','The connection was interrupted. Check the device before trying again.');}
    finally{busy=false;}
  };
  $('settings-dialog').addEventListener('settings-tab-change',()=>{if(!$('settings-panel-diagnostics').hidden)void load();});
  return {load,clear(){generation++;action=null;requestId=null;popup.close();}};
}
