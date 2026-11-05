// PIN is used only by this dialog. Session tokens stay in this page's memory.
let token=null;
async function unlock(){
 return new Promise((resolve,reject)=>{
   const dialog=document.createElement('dialog');dialog.className='grass-unlock';dialog.setAttribute('aria-labelledby','grass-pin-label');
   dialog.innerHTML='<form><fieldset><legend id="grass-pin-label">PIN</legend><div class="pin-digits">'+Array.from({length:6},(_,i)=>`<input type="password" inputmode="numeric" pattern="[0-9]" maxlength="1" autocomplete="off" aria-label="PIN digit ${i+1}" required>`).join('')+'</div></fieldset><p role="status"></p><div class="pin-actions"><button type="button">Cancel</button><button type="submit">Unlock</button></div></form>';
   const inputs=[...dialog.querySelectorAll('input')],buttons=[...dialog.querySelectorAll('button')];let saving=false,closed=false;
   const close=()=>{closed=true;inputs.forEach(input=>input.value='');dialog.close();dialog.remove();};
   const cancel=()=>{if(saving)return;close();reject(Error('Not saved.'));};
   dialog.querySelector('button[type=button]').onclick=cancel;
   dialog.oncancel=event=>{event.preventDefault();cancel();};
   const put=(index,value)=>{
     const digits=value.replace(/[^0-9]/g,'').slice(0,6-index);if(!digits)return;
     for(let i=0;i<digits.length;i++)inputs[index+i].value=digits[i];
     inputs[Math.min(5,index+digits.length)].focus();
   };
   inputs.forEach((input,index)=>{
     input.oninput=()=>{const value=input.value;input.value='';put(index,value);};
     input.onfocus=()=>input.select();
     input.onpaste=event=>{event.preventDefault();put(index,event.clipboardData.getData('text'));};
     input.onkeydown=event=>{
       if(event.key==='Backspace'&&!input.value&&index){event.preventDefault();inputs[index-1].value='';inputs[index-1].focus();}
       if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();inputs[Math.max(0,Math.min(5,index+(event.key==='ArrowLeft'?-1:1)))].focus();}
     };
   });
   dialog.querySelector('form').onsubmit=async event=>{
     event.preventDefault();if(saving)return;
     const pin=inputs.map(input=>input.value).join('');if(!/^[0-9]{6}$/.test(pin))return;
     saving=true;buttons.forEach(button=>button.disabled=true);inputs.forEach(input=>input.disabled=true);
     try{
       const response=await fetch('/api/settings/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin}),signal:AbortSignal.timeout(10000)});
       const value=await response.json();if(!response.ok)throw Error(response.status===429?'Too many attempts. Try again later.':'PIN not accepted.');
       token=value.token;close();resolve();
     }catch(e){dialog.querySelector('[role=status]').textContent=e.message;}
     finally{saving=false;inputs.forEach(input=>{input.value='';input.disabled=false;});buttons.forEach(button=>button.disabled=false);if(!closed)inputs[0].focus();}
   };
   document.body.append(dialog);dialog.showModal();inputs[0].focus();
 });
}
async function save(path,value){
 const post=()=>fetch('/api/grass-lab/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(value),signal:AbortSignal.timeout(10000)});
 let response=await post();if(response.status===401){await unlock();response=await post();}
 const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save.');return result;
}
export const saveGrassObservation=observation=>save('observations',observation);
export const saveGrassParameters=parameters=>save('parameters',parameters);
