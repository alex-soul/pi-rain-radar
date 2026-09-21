// UTC dates are calendar labels; the caller maps observations in the map timezone.
export function monthDays(month) {
  const [year,m]=month.split('-').map(Number),first=new Date(Date.UTC(year,m-1,1));
  return {offset:(first.getUTCDay()+6)%7,days:Array.from({length:new Date(Date.UTC(year,m,0)).getUTCDate()},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`)};
}
export function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+delta,1)).toISOString().slice(0,7);}
// Two bounded reads cover all timezone offsets around a 31-day month without
// exceeding the backend's 32-day calendar query limit.
export function monthRanges(month,now=Infinity){const [y,m]=month.split('-').map(Number),start=Date.UTC(y,m-1,1)-15*3600000,mid=Date.UTC(y,m-1,16),end=Date.UTC(y,m,1)+15*3600000;return [[start,mid],[mid,end]].map(([a,b])=>[a,Math.min(b,now)]).filter(([a,b])=>a<=b);}
export function setupArchiveCalendar(loadDays){
 const $=id=>document.getElementById(id),field=$('archive-day'),toggle=$('archive-date-toggle'),panel=$('archive-calendar'),grid=$('archive-calendar-days');
 let month='',epoch=0,controller=null;
 const label=day=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${day}T00:00:00Z`));
 function sync(){toggle.textContent=field.value?field.value.split('-').reverse().join('/'):'Choose date';toggle.setAttribute('aria-label',field.value?`Date: ${label(field.value)}`:'Choose date');}
 function close(focus=false){epoch++;controller?.abort();panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus();}
 async function render(focus=false){
  const request=++epoch;controller?.abort();controller=new AbortController();
  $('archive-calendar-month').textContent=new Intl.DateTimeFormat('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
  $('archive-calendar-prev').disabled=!!field.min&&month<=field.min.slice(0,7);$('archive-calendar-next').disabled=!!field.max&&month>=field.max.slice(0,7);
  grid.replaceChildren();$('archive-calendar-note').textContent='Loading dates…';
  try{
   const result=await loadDays(month,controller.signal);if(request!==epoch)return;
   const available=new Set(result.days);if(result.min!==undefined)field.min=result.min;if(result.max!==undefined)field.max=result.max;
   $('archive-calendar-prev').disabled=!!field.min&&month<=field.min.slice(0,7);$('archive-calendar-next').disabled=!!field.max&&month>=field.max.slice(0,7);
   const {offset,days}=monthDays(month),nodes=[];
   for(let i=0;i<offset;i++){const blank=document.createElement('span');blank.setAttribute('aria-hidden','true');nodes.push(blank);}
   for(const day of days){const button=document.createElement('button');button.type='button';button.textContent=String(Number(day.slice(-2)));button.dataset.day=day;button.setAttribute('aria-label',label(day));button.disabled=!available.has(day);button.setAttribute('aria-pressed',String(day===field.value));button.addEventListener('click',()=>{field.value=day;sync();close(true);field.dispatchEvent(new Event('change'));});nodes.push(button);}
   grid.replaceChildren(...nodes);$('archive-calendar-note').textContent=days.some(d=>available.has(d))?'':'No stored history this month.';
   if(focus)(grid.querySelector('button[aria-pressed="true"]:not(:disabled)')??grid.querySelector('button:not(:disabled)')??$('archive-calendar-close')).focus();
  }catch{if(request===epoch)$('archive-calendar-note').textContent='Could not load dates. Close and try again.';}
 }
 toggle.addEventListener('click',()=>{if(!panel.hidden){close();return;}month=(field.value||field.max||new Date().toISOString().slice(0,10)).slice(0,7);panel.hidden=false;toggle.setAttribute('aria-expanded','true');void render(true);});
 for(const [id,delta]of [['archive-calendar-prev',-1],['archive-calendar-next',1]])$(id).addEventListener('click',()=>{month=shiftMonth(month,delta);void render();});
 $('archive-calendar-close').addEventListener('click',()=>close(true));
 $('archive-dialog').addEventListener('close',()=>close());
 $('archive-dialog').addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();event.stopPropagation();close(true);}});
 document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target))close();});
 grid.addEventListener('keydown',event=>{const day=event.target.dataset?.day;if(!day)return;const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(delta===undefined)return;event.preventDefault();const buttons=[...grid.querySelectorAll('button')],index=buttons.indexOf(event.target);let next=index+delta;while(next>=0&&next<buttons.length&&buttons[next].disabled)next+=Math.sign(delta);buttons[next]?.focus();});
 return {sync,close};
}
