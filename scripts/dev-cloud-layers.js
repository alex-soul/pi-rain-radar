import {cloudPresentation} from '/cloud-layers-render.js';
import {setupWidgetResize} from '/widget-resize.js';
import {cloudScenarios,parseCloudGroups,plotTop,cloudBanks,cloudOutline,cloudFooter,verticalVisibility} from '/__cloud-layers-model.js';
const $=id=>document.getElementById(id),key='pi-rain-radar-dev-cloud-layers-v1';
const defaults={codes:cloudScenarios[0].codes,scenario:'layered',opacity:80,font:100,width:200,height:70,cloudOpacity:85,cloudSize:100,texture:100,seed:7,units:'m',scale:0,theme:'dark',backdrop:'map',station:'EGBB',timestamp:'131020Z',dataState:'fresh',vvStyle:'haze',convectiveShading:true};
const sliders=[['opacity','Widget opacity',0,100,1,'%'],['font','Font size',75,150,5,'%'],['width','Widget width',200,680,10,'px'],['height','Plot height',50,400,1,'px'],['cloudOpacity','Cloud opacity',20,100,1,'%'],['cloudSize','Cloud size',50,200,5,'%'],['texture','Shape irregularity',0,100,5,'%'],['seed','Shape variation',1,50,1,'']];
let state={...defaults};
try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&typeof saved==='object'){
  parseCloudGroups(saved.codes??defaults.codes);
  for(const [id,,min,max] of sliders)if(Number.isFinite(saved[id]))state[id]=Math.max(min,Math.min(max,saved[id]));
  for(const [id,values] of Object.entries({vvStyle:['haze','marker'],units:['m','ft'],theme:['dark','light'],backdrop:['map','plain'],dataState:['fresh','stale','expired','unavailable','not-configured','error'],scale:[0,1500,3000,6000]}))if(values.includes(saved[id]))state[id]=saved[id];
  if(typeof saved.convectiveShading==='boolean')state.convectiveShading=saved.convectiveShading;
  if(typeof saved.codes==='string')state.codes=saved.codes;if(typeof saved.station==='string')state.station=saved.station.slice(0,4).toUpperCase();if(typeof saved.timestamp==='string')state.timestamp=saved.timestamp.slice(0,7).toUpperCase();
  if(cloudScenarios.some(s=>s.id===saved.scenario)||saved.scenario==='custom')state.scenario=saved.scenario;
}}catch{/* Invalid/blocked storage uses the default preview. */}
function addSlider(host,[keyId,label,min,max,step=1,suffix=''],prefix=''){
  const id=prefix+keyId;
  const wrap=document.createElement('div');wrap.className='range-control';
  wrap.innerHTML=`<label for="${id}">${label}<output id="${id}-value"></output></label><input id="${id}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}">`;
  host.append(wrap);$(id).value=state[keyId];$(id).addEventListener('input',()=>{state[keyId]=Number($(id).value);paint();});
  $(id).dataset.setting=keyId;
  $(id).dataset.suffix=suffix;
}
const userSettings=['opacity','font','cloudOpacity','cloudSize','texture'];
sliders.forEach(s=>{addSlider($(userSettings.includes(s[0])?'user-appearance':'appearance'),s);if(userSettings.includes(s[0]))addSlider($('dialog-appearance'),s,'dialog-');});
// Match Weather trends' tabbedEditor structure and keyboard behaviour.
function setupCloudTabs(host,prefix=''){
  const slider=id=>$(prefix+id).closest('.range-control');
  const helps=[...host.querySelectorAll(':scope > .help')];
  const groups=[
    {title:'Clouds',nodes:[...['cloudOpacity','cloudSize','texture'].map(slider),...helps.slice(0,1)]},
    {title:'Options',nodes:[$(prefix+'units').closest('label'),$(prefix+'scale').closest('label'),...['opacity','font'].map(slider),...helps.slice(1)]}
  ];
  const tabs=document.createElement('div');tabs.className='settings-tabs cloud-setting-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Cloud settings');
  const buttons=[],panels=[];
  for(const [index,group] of groups.entries()){
    const button=document.createElement('button');button.type='button';button.textContent=group.title;button.id=host.id+'-tab-'+index;button.setAttribute('role','tab');
    const panel=document.createElement('section');panel.id=host.id+'-panel-'+index;panel.className='cloud-settings-panel';panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.tabIndex=0;
    button.setAttribute('aria-controls',panel.id);panel.append(...group.nodes);tabs.append(button);buttons.push(button);panels.push(panel);
  }
  host.querySelector('#'+(prefix?'dialog-appearance':'user-appearance')).remove();host.append(tabs,...panels);
  const select=index=>{buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});host.scrollTop=0;host.dispatchEvent(new CustomEvent('settings-tab-change',{bubbles:true}));};
  buttons.forEach((button,index)=>{button.onclick=()=>select(index);button.onkeydown=event=>{const next={ArrowLeft:(index+1)%2,ArrowRight:(index+1)%2,Home:0,End:1}[event.key];if(next!==undefined){event.preventDefault();select(next);buttons[next].focus();}};});
  if(host.tagName==='DIALOG')new MutationObserver(()=>{if(host.open)select(0);}).observe(host,{attributes:true,attributeFilter:['open']});
  select(0);
}
setupCloudTabs($('user-settings'));setupCloudTabs($('cloud-settings-dialog'),'dialog-');
$('convective-shading').onchange=()=>{state.convectiveShading=$('convective-shading').checked;paint();};
$('cloud-settings').onclick=()=>$('cloud-settings-dialog').showModal();
$('cloud-settings-close').onclick=()=>$('cloud-settings-dialog').close();
for(const scenario of cloudScenarios)for(const host of ['scenarios',...(['obscured','obscured-higher','obscured-zero','overcast-low','unknown-vv'].includes(scenario.id)?['vv-scenarios']:[])]){const button=document.createElement('button');button.textContent=scenario.title;button.dataset.scenario=scenario.id;button.onclick=()=>{state.codes=scenario.codes;state.scenario=scenario.id;state.dataState='fresh';sync();};$(host).append(button);}
$('scenario-count').textContent=cloudScenarios.length+' SCENARIOS';
function sync(){
  for(const id of ['codes','theme','backdrop','units','scale','station',...sliders.map(s=>s[0]),'timestamp'])$(id).value=state[id];
  $('vv-style').value=state.vvStyle;$('data-state').value=state.dataState;$('code-error').hidden=true;buildLayerControls();paint();
}
function buildLayerControls(){
  const layers=parseCloudGroups(state.codes).layers;$('layers').replaceChildren();
  for(let i=0;i<4;i++){
    const layer=layers[i],wrap=document.createElement('div');wrap.className='layer-editor';
    wrap.innerHTML=`<div><label>Layer ${i+1}<select data-field="amount" aria-label="Layer ${i+1} amount">${['','FEW','SCT','BKN','OVC','VV'].map(v=>`<option value="${v}">${v||'None'}</option>`).join('')}</select></label><label>Height group<input data-field="base" aria-label="Layer ${i+1} height group" type="number" min="0" max="999" step="1"></label><label>Cloud type<select data-field="type" aria-label="Layer ${i+1} type"><option value="">Unspecified</option><option>CB</option><option>TCU</option></select></label></div><div class="layer-height"><input data-field="slider" type="range" min="0" max="200" step="1" aria-label="Layer ${i+1} base height"><output></output></div><label class="unknown-height"><input data-field="unknown" type="checkbox"> Height unavailable (///)</label>`;
    const field=name=>wrap.querySelector(`[data-field="${name}"]`);
    field('amount').value=layer?.amount||'';field('base').value=Math.round((layer?.baseFt??1000)/100);field('slider').value=field('base').value;field('unknown').checked=!!layer&&layer.baseFt===null;field('type').value=layer?.type||'';
    function refreshRow(){const absent=!field('amount').value,unknown=field('unknown').checked;field('base').disabled=absent||unknown;field('slider').disabled=absent||unknown;field('unknown').disabled=absent;field('type').disabled=absent||field('amount').value==='VV';wrap.querySelector('output').textContent=absent?'—':unknown?'Unknown':(Number(field('base').value)*100).toLocaleString()+' ft';}
    function change(event){
      if(event.target===field('slider'))field('base').value=field('slider').value;
      if(event.target===field('base')){if(!field('base').validity.valid||field('base').value==='')return;field('slider').value=field('base').value;}
      if(field('amount').value==='VV')field('type').value='';
      const groups=[...$('layers').children].map(row=>{const get=name=>row.querySelector(`[data-field="${name}"]`);const amount=get('amount').value;return amount?amount+(get('unknown').checked?'///':String(Number(get('base').value)).padStart(3,'0'))+get('type').value:'';}).filter(Boolean);
      const codes=groups.join(' ');refreshRow();
      try{parseCloudGroups(codes);state.codes=codes;state.scenario='custom';$('codes').value=codes;$('code-error').hidden=true;paint();}catch(error){showError(error.message);}
    }
    wrap.addEventListener('input',change);refreshRow();$('layers').append(wrap);
  }
}
function showError(message){$('code-error').textContent=message+' Preview keeps the last valid report.';$('code-error').hidden=false;}
function applyCodes(){try{state.codes=parseCloudGroups($('codes').value).raw;state.scenario='custom';sync();}catch(error){showError(error.message);}}
$('apply').onclick=applyCodes;$('codes').onkeydown=event=>{if(event.key==='Enter')applyCodes();};
for(const id of ['theme','backdrop','station','timestamp'])$(id).addEventListener('input',()=>{state[id]=['station','timestamp'].includes(id)?$(id).value.toUpperCase():$(id).value;paint();});
for(const id of ['units','dialog-units'])$(id).addEventListener('change',()=>{state.units=$(id).value;paint();});
for(const id of ['scale','dialog-scale'])$(id).addEventListener('change',()=>{state.scale=Number($(id).value);paint();});$('vv-style').onchange=()=>{state.vvStyle=$('vv-style').value;paint();};$('data-state').onchange=()=>{state.dataState=$('data-state').value;paint();};
$('reset').onclick=()=>{state={...defaults};resizeOffset={x:0,y:0};$('cloud-widget').style.left='';$('cloud-widget').style.top='';sync();};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('export').value);$('copy-status').textContent='Copied';}catch{$('export').focus();$('export').select();$('copy-status').textContent='Select and copy the text below';}};
// Keep the whole card at least 100px tall, including its caption and plot margin.
function minimumPlotHeight(){return Math.ceil(100-document.querySelector('.cloud-footer').getBoundingClientRect().height-8);}
function paint(){
  $('convective-shading').checked=state.convectiveShading;
  const report=parseCloudGroups(state.codes),widget=$('cloud-widget'),font=state.font/100,units=state.units,factor=units==='m'?.3048:1;
  document.documentElement.dataset.theme=state.theme;$('stage').dataset.backdrop=state.backdrop;widget.dataset.state=state.dataState;
  const footer=cloudFooter(report,state);
  $('cloud-led').dataset.health=footer.health;$('cloud-led').setAttribute('aria-label',footer.label);$('cloud-led').title=footer.label;
  $('footer-station').textContent=footer.station;
  $('footer-groups').textContent=footer.groups;$('footer-groups').title=footer.groups;
  widget.style.setProperty('--card-alpha',state.opacity/100);widget.style.setProperty('--font',font);widget.style.width=state.width+'px';
  const minPlot=minimumPlotHeight();state.height=Math.max(minPlot,state.height);$('height').min=minPlot;
  const {svg,message,clipped,ceiling,vv,showVV,left}=cloudPresentation(report,state),num=value=>Math.round(value).toLocaleString('en-GB');
  $('cloud-plot').innerHTML=svg;
  const obscured=report.layers.some(layer=>layer.amount==='VV');
  if(showVV){
    const detail=vv.value===null?'Sky obscured; vertical visibility unknown. No height is available.':`Sky obscured; vertical visibility ${vv.label.slice(3)} above the aerodrome. This is not a cloud base or the top of the obscuration.${clipped?' Measurement above the selected scale.':''}`;
    $('cloud-plot').querySelector('svg').setAttribute('aria-label',detail);
    $('cloud-plot').title=detail;
    if(vv.value!==null){const badge=document.createElement('div');badge.className='vv-caption';badge.textContent=clipped?'VV above scale':'Sky obscured';badge.style.left=left+'px';$('cloud-plot').append(badge);}
  }else $('cloud-plot').removeAttribute('title');
  $('vv-explanation').textContent=obscured?`${vv.value===null?'No height marker: the measurement is unknown.':vv.label+' is the upward visibility; the dashed line is not a cloud base.'} A fresh report can still have a green LED. Haze follows Cloud opacity. The clean dashed marker has no value label; the footer keeps the VV code.`:'Choose a VV example to test haze and markers, or OVC002 to compare a real cloud base at the same numerical height.';
  $('vv-style').value=state.vvStyle;
  if(message){const element=document.createElement('div');element.className='plot-state'+(showVV?' vv-state':'');element.textContent=message;$('cloud-plot').append(element);}
  $('units').value=units;$('dialog-units').value=units;
  for(const id of ['scale','dialog-scale']){
    $(id).value=state.scale;
    for(const option of $(id).options)if(Number(option.value))option.textContent=`Fixed · ${num(Number(option.value)*(units==='m'?1:1/.3048))} ${units}`;
  }
  $('dimensions').textContent=`${state.width} × ${Math.round(widget.getBoundingClientRect().height)} px · ${state.font}% font`;
  $('range-caption').textContent=`${state.scale?'Fixed':'Auto'} scale · 0–${num(ceiling)} ${units}${clipped?' · '+clipped+' above plot':''}`;
  for(const input of document.querySelectorAll('[data-setting]')){input.value=state[input.dataset.setting];$(input.id+'-value').textContent=input.value+input.dataset.suffix;}
  document.querySelectorAll('[data-scenario]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scenario===state.scenario)));
  $('scenario-description').textContent=cloudScenarios.find(s=>s.id===state.scenario)?.description||'Custom cloud groups. Choose any scenario to return to a known example.';
  $('export').value=JSON.stringify({playground:'cloud-layers-v1',...state},null,2);
  try{localStorage.setItem(key,JSON.stringify(state));}catch{/* The controls still work if storage is blocked. */}
}
sync();

// The stage centres the preview; keep the standard resize anchor fixed during edits.
let resizeOffset={x:0,y:0};
const widgetExtra=()=>$('cloud-widget').getBoundingClientRect().height-state.height;
setupWidgetResize($('cloud-widget'),{
  limits:{minWidth:200,maxWidth:680,get minHeight(){return minimumPlotHeight()+widgetExtra();},get maxHeight(){return 400+widgetExtra();}},
  apply:rect=>{
    const panel=$('cloud-widget'),extra=widgetExtra();
    state.width=Math.round(rect.width);state.height=Math.max(minimumPlotHeight(),Math.min(400,Math.round(rect.height-extra)));paint();
    const actual=panel.getBoundingClientRect();
    resizeOffset.x+=rect.x-actual.x;resizeOffset.y+=rect.y-actual.y;
    panel.style.left=resizeOffset.x+'px';panel.style.top=resizeOffset.y+'px';
  },
  save:()=>{},cancelDrag:()=>{}
});
