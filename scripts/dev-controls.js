const scenarios=JSON.parse(document.querySelector('#scenario-data').content.textContent);
const buttons=[...document.querySelectorAll('[data-scenario]')];
for(const button of buttons) button.addEventListener('click',async()=>{
  buttons.forEach(b=>b.disabled=true);
  const status=document.querySelector('#selection-status'),error=document.querySelector('#request-error');
  error.hidden=true;status.textContent='Applying scenario…';
  try {
    const response=await fetch('/__scenario',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({scenario:button.dataset.scenario}),signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw Error('Could not apply the scenario. Check the local simulator and try again.');
    const result=await response.json(),scenario=scenarios.find(s=>s.id===result.scenario);
    if(!scenario)throw Error('Unexpected simulator response. Reload this page.');
    for(const key of ['group','title','description','expected','review'])document.querySelector('#scenario-'+key).textContent=scenario[key];
    buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.scenario===scenario.id)));
    status.textContent='Active simulation · applied';
  } catch(e) { error.textContent=e.name==='TimeoutError'?'The local simulator did not respond. Check it is running, then try again.':e.message;error.hidden=false;status.textContent='Change not confirmed'; }
  finally {buttons.forEach(b=>b.disabled=false);}
});
