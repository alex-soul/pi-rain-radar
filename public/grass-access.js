// PIN is used only by this dialog. Session tokens stay in this page's memory.
let token=null;
async function unlock(){
 return new Promise((resolve,reject)=>{
   const dialog=document.createElement('dialog');dialog.className='grass-unlock';
   dialog.innerHTML='<form><h2>Unlock observation entry</h2><p>Use this installation’s six-digit PIN.</p><label>PIN<input type="password" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="off" required></label><p role="status"></p><button type="submit">Unlock</button><button type="button">Cancel</button></form>';
   const close=()=>{dialog.close();dialog.remove();};
   dialog.querySelector('button[type=button]').onclick=()=>{close();reject(Error('Entry not saved.'));};
   dialog.oncancel=event=>{event.preventDefault();close();reject(Error('Entry not saved.'));};
   dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const input=dialog.querySelector('input'),button=dialog.querySelector('button');button.disabled=true;
     try{const response=await fetch('/api/settings/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:input.value}),signal:AbortSignal.timeout(10000)});input.value='';const value=await response.json();if(!response.ok)throw Error(response.status===429?'Too many attempts. Try again later.':'PIN not accepted.');token=value.token;close();resolve();}
     catch(e){dialog.querySelector('[role=status]').textContent=e.message;}finally{button.disabled=false;}
   };document.body.append(dialog);dialog.showModal();dialog.querySelector('input').focus();
 });
}
export async function saveGrassObservation(observation){
 const post=()=>fetch('/api/grass-lab/observations',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(observation),signal:AbortSignal.timeout(10000)});
 let response=await post();if(response.status===401){await unlock();response=await post();}
 const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save.');return result;
}
