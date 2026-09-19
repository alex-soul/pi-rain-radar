export function releaseText(data){
  const cached=data.stale||data.error;
  let summary='Version check unavailable.';
  if(data.state==='behind')summary=`${cached?'Last successful check: ':''}${data.complete?'':'At least '}${data.count} release${data.count===1?'':'s'} behind.`;
  else if(data.state==='current')summary=cached?'Up to date at the last successful check.':'You’re up to date.';
  let detail=data.reason??'';
  if(data.state==='behind'){
    const parts=data.breakdown?Object.entries(data.breakdown).filter(([,n])=>n).map(([k,n])=>`${n} ${k==='prerelease'?'pre-release transition'+(n===1?'':'s'):k}`).join(' · '):'Partial history; full breakdown unavailable';
    detail=`${parts}. ${data.prereleases} of these ${data.prereleases===1?'is a pre-release':'are pre-releases'}. Newest published: ${data.newest}.`;
    if(data.reason)detail+=' '+data.reason;
  }
  if(data.newest&&data.state!=='behind')detail+=` Newest published: ${data.newest}.`;
  if(data.newest?.startsWith('0.'))detail+=' Versions before 1.0 may change incompatibly.';
  const notice=data.error?(data.checkedAt?'The latest check failed. Showing the saved result.':data.error):data.stale&&data.checkedAt?'Showing the saved result. A fresh check is due.':'';
  return {summary,detail:detail.trim(),notice,date:data.checkedAt?`Checked: ${new Date(data.checkedAt).toLocaleString()}.`:'No successful check yet.'};
}
export function setupReleaseInfo(dialog){
  const $=id=>document.getElementById(id),button=$('release-info'),bubble=$('release-bubble');let generation=0;
  dialog.append(bubble);
  function close(){bubble.hidden=true;button.setAttribute('aria-expanded','false');}
  function place(){const rect=button.getBoundingClientRect(),bounds=dialog.getBoundingClientRect();bubble.style.width=`${Math.min(340,bounds.width-32)}px`;bubble.style.left=`${Math.max(bounds.left+8,Math.min(rect.left,bounds.right-bubble.offsetWidth-8))}px`;bubble.style.top=`${Math.max(bounds.top+8,Math.min(rect.bottom+5,bounds.bottom-bubble.offsetHeight-8))}px`;}
  function paint(data){const text=releaseText(data);$('release-summary').textContent=text.summary;$('release-detail').textContent=text.detail;$('release-date').textContent=text.date;$('release-notice').textContent=text.notice;$('release-notice').hidden=!text.notice;button.classList.toggle('release-behind',data.state==='behind');if(!bubble.hidden)place();}
  async function load(){const epoch=++generation;try{const response=await fetch('/api/releases',{signal:AbortSignal.timeout(5000),cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(epoch===generation)paint(data);}catch{if(epoch===generation)paint({error:'Could not read the saved version check.'});}}
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(!bubble.hidden){close();return;}bubble.hidden=false;button.setAttribute('aria-expanded','true');place();void load();});
  dialog.addEventListener('click',event=>{if(!bubble.contains(event.target))close();});
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!bubble.hidden){event.preventDefault();event.stopPropagation();close();}});
  dialog.addEventListener('close',()=>{generation++;close();});
  dialog.addEventListener('settings-tab-change',()=>{close();if(!$('settings-panel-about').hidden)void load();});
  dialog.addEventListener('scroll',close,true);window.addEventListener('resize',close);
  paint({});
}
