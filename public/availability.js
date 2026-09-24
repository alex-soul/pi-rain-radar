import {availabilityRows} from './availability-model.js';
const $=id=>document.getElementById(id),timeline=$('timeline'),playback=$('playback-row');
const root=document.createElement('div');root.id='availability';root.innerHTML='<section id="availability-panel" aria-label="Data availability" hidden><div id="availability-rows"></div><output id="availability-detail" class="weather-explanation" role="status" hidden></output></section>';playback.append(root);
let expanded=false,signature='',current=[],active=null,pinned=false,zone='Europe/London';try{expanded=localStorage.getItem('radar-availability-open')==='true';}catch{}
function hideDetail(){active=null;pinned=false;$('availability-detail').hidden=true;}
function saveExpanded(){disclosure();try{localStorage.setItem('radar-availability-open',String(expanded));}catch{}}
function disclosure(){if(!expanded)hideDetail(); $('availability-panel').hidden=!expanded;$('frame-total').setAttribute('aria-expanded',String(expanded));$('frame-total').setAttribute('aria-label',`${expanded?'Hide':'Show'} data availability`);}
$('frame-total').onclick=()=>{expanded=!expanded;saveExpanded();};disclosure();
// Playback controls, including scrubbing and play/pause, never dismiss the popup.
document.addEventListener('pointerdown',event=>{if(expanded&&!playback.contains(event.target)){expanded=false;saveExpanded();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded){expanded=false;saveExpanded();}});
window.addEventListener('resize',hideDetail);
const clock=t=>new Date(t*1000).toLocaleTimeString('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit'});
export function updateAvailability(input,onSelect){
 zone=input.zone??zone;current=availabilityRows(input);const health=current.some(r=>r.segments.some(s=>s.health==='error'))?'error':current.some(r=>r.segments.some(s=>s.health==='warning'))?'warning':current.some(r=>r.segments.some(s=>s.health==='ready'))?'ready':'disabled';$('frame-total').dataset.health=health;
 $('frame-total').title=health==='error'?'Missing data in this window':health==='warning'?'Earlier observations reused':health==='ready'?'Data available throughout this window':'Collection disabled or historical state unknown';
 const key=JSON.stringify(current);if(key!==signature){signature=key;$('availability-rows').replaceChildren();hideDetail();
 for(const row of current){const line=document.createElement('div');line.className='availability-row';const label=document.createElement('span');label.textContent=row.label;line.append(label);const track=document.createElement('div');track.className='availability-track';track.setAttribute('role','group');track.setAttribute('aria-label',row.label+' availability');
 row.segments.forEach((segment,i)=>{const b=document.createElement('button');b.type='button';b.dataset.health=segment.health;b.setAttribute('aria-label',`${row.label} ${clock(segment.time)} · ${segment.health==='ready'?'Available':segment.health==='warning'?'Earlier observation':segment.health==='error'?'Missing':segment.health==='unknown'?'Unknown':'Disabled'}`);const show=()=>{active=b;const out=$('availability-detail');out.textContent=`${row.label} · ${clock(segment.time)} · `+segment.detail.map(d=>`${d.label}: ${d.health==='ready'?'available':d.health==='warning'?'reused '+clock(d.time):d.health==='error'?'missing':d.health==='unknown'?'unknown':'disabled'}`).join(' · ');out.hidden=false;const rect=b.getBoundingClientRect();out.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-out.offsetWidth-8))+'px';out.style.top=Math.max(8,rect.top-out.offsetHeight-10)+'px';};
 b.onclick=()=>{if(active===b&&pinned)hideDetail();else{pinned=true;show();}};
 b.onpointerenter=event=>{if(event.pointerType==='mouse'&&!pinned)show();};
 b.onpointerleave=()=>{if(!pinned)hideDetail();};b.onfocus=()=>{if(!pinned)show();};b.onblur=()=>{if(!pinned)hideDetail();};
 track.append(b);});line.append(track);$('availability-rows').append(line);}
 }
 const steps=Math.round((input.end-input.start)/600),slot=Math.max(0,Math.min(steps,Math.round(((input.time??input.start)-input.start)/600)));
 const at=(slot+.5)/(steps+1)*100;root.style.setProperty('--availability-position',at+'%');
}
