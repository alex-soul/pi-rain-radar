import {grassLabels} from '/grass-wetness-settings.js';
const $=id=>document.getElementById(id);
let grade=null;
function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
for(let i=0;i<=5;i++){const button=element('button',String(i));button.type='button';button.setAttribute('aria-label',`${i} · ${grassLabels[i]}`);button.setAttribute('aria-pressed','false');button.onclick=()=>{grade=i;for(const b of $('grades').children)b.setAttribute('aria-pressed',String(b===button));$('grade-label').textContent=grassLabels[i];};$('grades').append(button);}
$('observation-form').onsubmit=async event=>{
  event.preventDefault();
  if(grade===null){$('save-message').textContent='Choose an intensity first.';return;}
  const observedAt=$('observed-at').value?new Date($('observed-at').value).getTime():Date.now();
  if(!Number.isFinite(observedAt)||observedAt>Date.now()+300000){$('save-message').textContent='Choose a valid observation time, up to five minutes ahead.';return;}
  $('save-observation').disabled=true;$('save-message').textContent='Saving…';
  try{
    const response=await fetch('/__grass-lab/observations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intensity:grade,observedAt,note:$('note').value}),signal:AbortSignal.timeout(10000)});
    const value=await response.json();if(!response.ok)throw Error(value.error||'Could not save.');
    const time=new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(value.observedAt);
    $('save-message').textContent=`Saved · intensity ${value.intensity} · ${time}. Ready to compare when you open the lab.`;
    $('note').value='';$('observed-at').value='';grade=null;
    for(const button of $('grades').children)button.setAttribute('aria-pressed','false');
    $('grade-label').textContent='Choose a level for your next observation.';
  }catch(e){$('save-message').textContent=e.message+' Your entry is still here.';}
  finally{$('save-observation').disabled=false;}
};
