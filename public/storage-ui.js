const bytes=n=>!Number.isFinite(n)?'Unknown':n<1048576?`${(n/1024).toFixed(1)} KiB`:n<1073741824?`${(n/1048576).toFixed(1)} MiB`:`${(n/1073741824).toFixed(2)} GiB`;
export function storageSummary(s,timeZone='UTC'){
  const date=value=>new Date(value).toLocaleString('en-GB',{timeZone,dateStyle:'medium',timeStyle:'short'});
  if(!s)return 'Storage information unavailable.';
  const dates=s.oldest===null?'No stored history yet.':`${date(s.oldest)} – ${date(s.newest)}`;
  return `${s.accountingComplete?'':'Estimated '}${bytes(s.appUsedBytes)} used by this app · ${bytes(s.availableBytes)} available on filesystem.\nRequested: ${s.retentionDays===null?'storage-limited':`${s.retentionDays} days`}. Retained: ${dates}\n${s.estimateLearning?'Capacity estimate: learning (at least one day of data needed).':`Estimated total capacity: about ${s.estimatedCapacityDays} days at the observed collection rate; this changes with sources and image sizes.`}${s.pressure?'\nStorage is low. Oldest history is rolling automatically to keep Live running.':''}${s.recoveryCount?`\n${s.recoveryCount} failed database recovery set(s) preserved and included in usage.`:''}${s.warning?'\nStorage needs attention: cleanup or writing is blocked.':''}`;
}
export function setupStorageSettings(canEdit,request){
  const summary=document.getElementById('storage-summary'),days=document.getElementById('storage-days'),mode=document.getElementById('storage-mode'),button=document.getElementById('storage-save'),feedback=document.getElementById('storage-feedback');
  if(!summary)return {load(){}};
  let loading=0;const timeZone=document.querySelector('meta[name="time-zone"]').content;
  mode.addEventListener('change',()=>{days.disabled=mode.value==='storage';});
  async function load(){
    const epoch=++loading;
    try{const response=await request('/storage');if(!response.ok)throw new Error();const s=await response.json();if(epoch!==loading||!canEdit())return;summary.textContent=storageSummary(s,timeZone);mode.value=s.retentionDays===null?'storage':'days';days.value=s.retentionDays??7;days.disabled=s.retentionDays===null;feedback.textContent='';}
    catch{summary.textContent='Storage information unavailable.';}
  }
  button.addEventListener('click',async()=>{
    if(!canEdit())return;
    const value=mode.value==='storage'?null:Number(days.value);
    if(value!==null&&(!Number.isSafeInteger(value)||value<1)){feedback.textContent='Choose a positive number of whole days.';return;}
    button.disabled=true;feedback.textContent='Saving…';
    try{const response=await request('/storage',{days:value});if(!response.ok)throw new Error();summary.textContent=storageSummary(await response.json(),timeZone);feedback.textContent='Saved. Rolling retention applies immediately.';}
    catch{feedback.textContent='Could not save retention. Please try again.';}finally{button.disabled=false;}
  });
  return {load};
}
