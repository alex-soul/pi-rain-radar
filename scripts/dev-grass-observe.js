import {saveGrassObservation} from '/__grass-access.js';
import {grassLabels} from '/grass-wetness-settings.js';
const $=id=>document.getElementById(id);
let grade=null,pendingEntry=null;
const localTime=time=>{const d=new Date(time);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
$('time-details').ontoggle=()=>{
  const past=$('time-details').open;
  $('time-summary').textContent=past?'Time: past':'Time: now';
  $('observed-at').value=past?localTime(Date.now()):'';
  $('observed-at').required=past;
  $('observed-at').max=localTime(Date.now());
  pendingEntry=null;
};

function element(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
for(let i=0;i<=5;i++){const button=element('button',String(i));button.type='button';button.setAttribute('aria-label',`${i} · ${grassLabels[i]}`);button.setAttribute('aria-pressed','false');button.onclick=()=>{grade=i;for(const b of $('grades').children)b.setAttribute('aria-pressed',String(b===button));$('grade-label').textContent=grassLabels[i];};$('grades').append(button);}
$('observation-form').onsubmit=async event=>{
  event.preventDefault();
  if(grade===null){$('save-message').textContent='Choose an intensity first.';return;}
  const observedAt=$('time-details').open?new Date($('observed-at').value).getTime():Date.now();
  if(!Number.isFinite(observedAt)||observedAt>Date.now()){$('save-message').textContent='Choose a valid time in the past.';return;}
  const signature=JSON.stringify([grade,$('observed-at').value,$('note').value]);
  if(pendingEntry?.signature!==signature)pendingEntry={signature,id:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),intensity:grade,observedAt,note:$('note').value};
  $('save-observation').disabled=true;$('save-message').textContent='Saving…';
  try{
    const {signature,...entry}=pendingEntry;const value=await saveGrassObservation(entry);pendingEntry=null;
    const time=new Intl.DateTimeFormat(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(value.observedAt);
    $('save-message').textContent=`Saved · intensity ${value.intensity} · ${time}.`;
    $('note').value='';$('observed-at').value='';$('time-details').open=false;grade=null;
    for(const button of $('grades').children)button.setAttribute('aria-pressed','false');
    $('grade-label').textContent='';
  }catch(e){$('save-message').textContent=e.message+' Your entry is still here.';}
  finally{$('save-observation').disabled=false;}
};
