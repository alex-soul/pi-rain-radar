import {setupMapDecoration} from './map-decoration.js';
import {readingNames} from './weather-format.js';
import {localPreferences,saveLocalPreferences,opacityNames,lookbacks} from './local-preferences.js';
import {createLocalIdle,AFFORDANCE_IDLE_MS} from './local-idle.js';
const $=id=>document.getElementById(id);
export const canEditLocal=()=>!document.body.classList.contains('screen-locked');
const cog='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 3-.5 2.4-2 .9-2.2-.8-2 3.4 1.7 1.6v3L2.3 15l2 3.5 2.2-.8 2 .9L9 21h4l.5-2.4 2-.9 2.2.8 2-3.5-1.7-1.5v-3l1.7-1.6-2-3.4-2.2.8-2-.9L13 3z"/><circle cx="11" cy="12" r="3.5"/></svg>';
export function editIcon(button,label){if(!button)return;button.innerHTML=cog;button.classList.add('local-cog');button.setAttribute('aria-label',label);button.title=label;}
export function setupAffordances(area,editor=null){
  if('localArea' in area.dataset)return;
  if(!area.hasAttribute('tabindex'))area.tabIndex=0;
  area.dataset.localArea='';const pointers=new Set();let hovered=false;
  const idle=createLocalIdle({delayMs:AFFORDANCE_IDLE_MS,show:()=>{if(canEditLocal())area.classList.add('local-awake');},hide:()=>{
    const active=document.activeElement;
    if(area.contains(active)&&active.matches('.local-cog,.widget-close,[id$="-resize"]')){area.tabIndex=0;area.focus({preventScroll:true});}
    area.classList.remove('local-awake');
  },held:()=>hovered||pointers.size>0||area.dataset.resizing==='true'||!!editor?.open||(document.hasFocus()&&area.contains(document.activeElement)&&document.activeElement.matches(':focus-visible'))});
  area.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'||e.pointerType==='pen')hovered=true;idle.activity();});
  area.addEventListener('pointerleave',()=>{hovered=false;idle.schedule();});
  area.addEventListener('focusout',()=>queueMicrotask(idle.schedule));
  for(const name of ['pointermove','click','keydown','focusin','input','change','radar-widget-gesture'])area.addEventListener(name,idle.activity);
  area.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);idle.activity();});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])window.addEventListener(name,e=>{if(pointers.delete(e.pointerId))idle.schedule();});
  if(editor){new MutationObserver(()=>{if(editor.open)idle.activity();else idle.schedule();}).observe(editor,{attributes:true,attributeFilter:['open']});}
  window.addEventListener('blur',()=>{hovered=false;pointers.clear();idle.schedule();});
  window.addEventListener('radar-screen-lock',()=>{pointers.clear();if(!canEditLocal()){editor?.close();idle.reset();}});
}
// Keep DOM and keyboard order canonical; only the column capacity changes.
export function setupOrderedList(list){
  list.classList.add('local-order');
  const arrange=()=>list.style.setProperty('--order-rows',String(Math.ceil(list.children.length/2)));
  new MutationObserver(arrange).observe(list,{childList:true});arrange();
}
function editor(id,title){
  const dialog=document.createElement('dialog');dialog.id=id;dialog.className='local-editor';dialog.setAttribute('aria-label',title);
  const heading=document.createElement('div');heading.className='archive-heading';
  const name=document.createElement('h2');name.textContent=title;
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Close '+title);close.onclick=()=>dialog.close();
  heading.append(name,close);dialog.append(heading);document.body.append(dialog);return dialog;
}
function attachCog(area,dialog,id,label){
  const button=document.createElement('button');button.id=id;button.type='button';editIcon(button,label);area.append(button);
  button.onclick=()=>{if(canEditLocal()){window.dispatchEvent(new Event('weather-explanation-close'));dialog.showModal();}};setupAffordances(area,dialog);return button;
}
function opacityControl(dialog,key){
  const box=document.createElement('div');box.className='local-opacity';
  box.innerHTML=`<label for="opacity-${key}">Background opacity <output></output></label><input id="opacity-${key}" type="range" min="0" max="100" step="5">`;
  const input=box.querySelector('input'),output=box.querySelector('output');
  const paint=()=>{input.value=localPreferences.opacity[key]??(key==='buttons'?(document.documentElement.dataset.theme==='dark'?90:80):70);output.textContent=key in localPreferences.opacity?localPreferences.opacity[key]+'%':'Default';};
  input.oninput=()=>{if(canEditLocal()){localPreferences.opacity[key]=Number(input.value);saveLocalPreferences();paint();}};
  dialog.append(box);window.addEventListener('radar-local-preferences',paint);new MutationObserver(paint).observe(dialog,{attributes:true,attributeFilter:['open']});paint();
}
function fontControl(dialog,key){
  const box=document.createElement('div');box.className='local-opacity';box.innerHTML=`<label for="font-${key}">Font size <output></output></label><input id="font-${key}" type="range" min="75" max="150" step="5">`;
  const input=box.querySelector('input'),output=box.querySelector('output');const paint=()=>{input.value=localPreferences.fonts[key]??100;output.textContent=input.value+'%'+(Number(input.value)===100?' (default)':'');};
  input.oninput=()=>{if(canEditLocal()){localPreferences.fonts[key]=Number(input.value);saveLocalPreferences();paint();}};
  dialog.append(box);paint();
}
const fontTargets={top:'.weather-reading,.weather-reading:not(.astro-reading) small,.astro-dock-icon',bottom:'#time,#date,#frame-count,#frame-total,#updated',camera:'#camera-source,#camera-time','rain-forecast':'.minute-axis,#minute-message,#forecast-caption',astronomy:'.astro-events',trends:'.trend-mini-legend',stats:'.stats-content,.stats-content h3,.stats-content h4',buttons:'#clock-toggle time,#history-toggle time'};
function paintFont(key){if(key==='top'){document.documentElement.style.setProperty('--dock-font-scale',(localPreferences.fonts.top??100)/100);return;}for(const node of document.querySelectorAll(fontTargets[key])){node.style.removeProperty('font-size');if((localPreferences.fonts[key]??100)!==100)node.style.fontSize=(parseFloat(getComputedStyle(node).fontSize)*localPreferences.fonts[key]/100)+'px';}}
function paintFonts(){for(const key of Object.keys(fontTargets))paintFont(key);window.dispatchEvent(new Event('radar-display-change'));document.getElementById('camera')?.dispatchEvent(new Event('snapshot-size'));}
// Share the same two-tab structure across the browser-local list editors.
function tabbedEditor(dialog,listTitle,listNodes){
  dialog.classList.add('local-editor');
  const heading=dialog.querySelector('.archive-heading');
  const options=[...dialog.children].filter(node=>node!==heading&&!listNodes.includes(node));
  const tabs=document.createElement('div');tabs.className='settings-tabs local-editor-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',dialog.getAttribute('aria-label')||'Weather trends');
  const panels=[],buttons=[];
  for(const [index,title]of [listTitle,'Options'].entries()){
    const button=document.createElement('button');button.type='button';button.textContent=title;button.id=dialog.id+'-tab-'+index;button.setAttribute('role','tab');
    const panel=document.createElement('section');panel.id=dialog.id+'-panel-'+index;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.tabIndex=0;
    button.setAttribute('aria-controls',panel.id);tabs.append(button);panels.push(panel);buttons.push(button);
  }
  panels[0].append(...listNodes);panels[1].className='local-options';panels[1].append(...options);dialog.append(tabs,...panels);
  const select=index=>{buttons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===index));button.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});dialog.scrollTop=0;dialog.dispatchEvent(new CustomEvent('settings-tab-change',{bubbles:true}));};
  buttons.forEach((button,index)=>{button.onclick=()=>select(index);button.onkeydown=event=>{const next={ArrowLeft:1-index,ArrowRight:1-index,Home:0,End:1}[event.key];if(next!==undefined){event.preventDefault();select(next);buttons[next].focus();}};});
  new MutationObserver(()=>{if(dialog.open)select(0);}).observe(dialog,{attributes:true,attributeFilter:['open']});select(0);
}
function paintOpacity(){for(const key of opacityNames){const prop='--local-'+key+'-alpha';if(key in localPreferences.opacity)document.documentElement.style.setProperty(prop,localPreferences.opacity[key]/100);else document.documentElement.style.removeProperty(prop);}}
function commonEditor(top,bottom,side){
  const main=editor('main-editor','Main map'),field=$('layer-main-rain').closest('fieldset');
  main.append(field);
  const layers=[...field.querySelectorAll(':scope > .layer-choice')];
  field.querySelector('legend')?.remove();
  const layerBox=document.createElement('div');layerBox.className='local-options';layerBox.append(...layers);
  main.append(layerBox);tabbedEditor(main,'Layers',[layerBox]);
  const common=editor('ui-editor','Screen settings'),selector=document.createElement('select');selector.id='ui-settings-section';selector.setAttribute('aria-label','Screen settings category');
  const heading=common.querySelector('.archive-heading');heading.classList.add('settings-heading');heading.querySelector('h2').after(selector);
  const categories=[['main','Main map',main],['top','Top dock',top],['bottom','Bottom dock',bottom],['side','Side buttons',side]],panels=[];
  for(const [key,title,old]of categories){
    selector.add(new Option(title,key));const panel=document.createElement('section');panel.id='ui-settings-'+key;panel.setAttribute('aria-label',title);
    panel.append(...[...old.children].filter(node=>!node.classList.contains('archive-heading')));common.append(panel);panels.push(panel);old.remove();
  }
  const choose=()=>{panels.forEach((panel,i)=>{panel.hidden=categories[i][0]!==selector.value;if(!panel.hidden)panel.querySelector('[role=tab]')?.click();});common.scrollTop=0;};
  selector.onchange=choose;choose();
  const toggle=$('layers-toggle');toggle.setAttribute('aria-label','Open screen settings');toggle.title='Screen settings';toggle.setAttribute('aria-controls',common.id);toggle.removeAttribute('aria-expanded');
  toggle.onclick=()=>{if(canEditLocal()){window.dispatchEvent(new Event('weather-explanation-close'));choose();common.showModal();}};
  $('layers-panel').remove();
  window.addEventListener('radar-screen-lock',()=>{if(!canEditLocal())common.close();});
}
function setupDockLayout(){
  for(const id of Object.keys(readingNames)){
    const value=$('weather-'+id),row=value.closest('.weather-reading');
    let slot=row.querySelector('.reading-value-slot');
    if(!slot){slot=document.createElement('span');slot.className='reading-value-slot';slot.dataset.reading=id;value.before(slot);slot.append(value);}
    let marker=row.querySelector('.reading-trend');
    if(!marker&&!['direction','sun','moon'].includes(id)){marker=document.createElement('span');marker.className='reading-trend';marker.setAttribute('aria-hidden','true');}
    if(marker)row.prepend(marker);
    // Remove empty wrappers left by the original number/unit markup.
    for(const wrapper of [...row.children])if(wrapper.tagName==='SPAN'&&!wrapper.className&&!wrapper.textContent.trim()&&!wrapper.children.length)wrapper.remove();
  }
}
export function setupLocalEditors(){
  setupDockLayout();
  $('layers-toggle').innerHTML=cog;$('settings-toggle').innerHTML='<svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';$('settings-toggle').setAttribute('aria-label','Open main menu');
  const top=editor('top-editor','Top dock'),bottom=editor('bottom-editor','Playback dock'),side=editor('side-editor','Side buttons');
  top.append($('weather-choices'));
  for(const id of ['auto-hide-weather','gust-cache-minutes'])top.append($(id).closest('label'));
  for(const id of ['astro-sun-mode','astro-moon-mode'])top.append($(id).parentElement);
  side.append($('control-list'),$('control-feedback'),$('auto-hide-buttons').closest('label'));
  const speed=$('playback-speed');bottom.append(document.querySelector('label[for="playback-speed"]'),speed,document.querySelector('.speed-labels'));
  for(const id of ['playback-hours','last-frame-multiplier','auto-hide-footer'])bottom.append($(id).closest('label'));
  // Keep asynchronous playback feedback on-screen even with its editor closed.
  const note=$('playback-window-note');note.classList.add('playback-notice');document.querySelector('footer').append(note);
  $('layer-main-rain').closest('fieldset').append($('show-map-scale').closest('label'));
  for(const [dialog,key]of [[top,'top'],[bottom,'bottom'],[side,'buttons'],[$('trend-editor'),'trends']])opacityControl(dialog,key);
  const playbackOptions=document.createElement('div');playbackOptions.className='local-options';
  const speedField=document.createElement('div');speedField.className='local-slider-field';
  speedField.append(bottom.querySelector('label[for="playback-speed"]'),speed,bottom.querySelector('.speed-labels'));
  playbackOptions.append(speedField,...[...bottom.children].filter(node=>!node.classList.contains('archive-heading')));bottom.append(playbackOptions);
  for(const [id,title]of [['rain-forecast','Rain forecast'],['astronomy','Sun and Moon'],['stats','Stats for nerds']]){
    const dialog=editor(id+'-editor',title);opacityControl(dialog,id);fontControl(dialog,id);attachCog($(id),dialog,id+'-edit','Edit '+title);
  }
  const select=document.createElement('select');select.id='trends-lookback';select.append(new Option('Follow main playback','follow'),...lookbacks.map(h=>new Option(h+' hours',String(h))));select.value=String(localPreferences.lookback??'follow');
  const label=document.createElement('label');label.className='misc-option';label.textContent='Chart lookback';label.append(select);$('trend-editor').insertBefore(label,$('trend-editor').querySelector('.local-opacity'));
  select.onchange=()=>{if(canEditLocal()){localPreferences.lookback=lookbacks.includes(Number(select.value))?Number(select.value):null;saveLocalPreferences();}};
  for(const id of ['astro-sun-mode','astro-moon-mode'])$(id).parentElement.classList.add('local-option-row');
  for(const [dialog,key]of [[top,'top'],[side,'buttons'],[bottom.querySelector('.local-options'),'bottom'],[$('trend-editor'),'trends']])fontControl(dialog,key);
  tabbedEditor(top,'Readings',[$('weather-choices')]);
  const playback=bottom.querySelector('.local-options');bottom.append(...playback.querySelectorAll(':scope > .local-opacity'));
  tabbedEditor(bottom,'Playback',[playback]);
  tabbedEditor(side,'Buttons',[$('control-list'),$('control-feedback')]);
  tabbedEditor($('trend-editor'),'Charts',[$('trend-list'),$('trend-feedback')]);
  for(const id of ['reading-list','control-list','trend-list'])setupOrderedList($(id));
  editIcon($('trend-edit'),'Edit Weather trends');
  setupAffordances($('weather-trends'),$('trend-editor'));
  for(const area of document.querySelectorAll('.detached-trend')){editIcon(area.querySelector('.trend-edit')??area.editButton,'Edit Weather trends');setupAffordances(area,$('trend-editor'));}
  const overview=editor('overview-editor','Overview map'),camera=editor('camera-editor','Camera');
  overview.append($('layer-overview-rain').closest('fieldset'));attachCog($('overview'),overview,'overview-edit','Edit Overview map');
  fontControl(camera,'camera');attachCog($('camera'),camera,'camera-edit','Edit Camera');
  setupMapDecoration(overview,$('layer-main-rain').closest('fieldset'));
  commonEditor(top,bottom,side);
  paintFonts();window.addEventListener('radar-local-preferences',paintFonts);window.addEventListener('resize',paintFonts);
  new MutationObserver(()=>paintFont('stats')).observe($('stats-data'),{childList:true,subtree:true});
  // Remove relocated tabs, retaining shared configuration and protected lock management.
  for(const id of ['settings-tab-readings','settings-tab-buttons'])$(id)?.remove();
  for(const id of ['settings-panel-readings','settings-panel-buttons'])$(id)?.remove();
  $('review-readings-tab').setAttribute('aria-selected','true');$('review-readings-tab').tabIndex=0;$('review-weather-readings').hidden=false;$('review-weather-units').hidden=true;
  $('shared-unit-note').textContent='';
  for(const group of document.querySelectorAll('#settings-panel-display .settings-group'))if(!group.querySelector('input,select,button'))group.remove();
  document.querySelector('#settings-panel-display .display-groups').classList.add('single-group');
  for(const id of ['cloud-enabled','review-camera-enabled']){
    const row=$(id).closest('label'),group=document.createElement('div');group.className='settings-group';row.before(group);group.append(row);
  }
  paintOpacity();window.addEventListener('radar-local-preferences',paintOpacity);
}
export function movablePanel(panel,handle){
  let drag=null;handle.tabIndex=0;handle.setAttribute('aria-label','Move Archive panel. Drag or use arrow keys.');
  const place=(x,y)=>{panel.style.left=Math.max(8,Math.min(x,innerWidth-panel.offsetWidth-8))+'px';panel.style.top=Math.max(8,Math.min(y,innerHeight-panel.offsetHeight-8))+'px';};
  handle.addEventListener('pointerdown',e=>{if(e.target.closest('button')||e.button!==0||!canEditLocal())return;const r=panel.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX-r.left,y:e.clientY-r.top};handle.setPointerCapture(e.pointerId);e.preventDefault();});
  handle.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId)place(e.clientX-drag.x,e.clientY-drag.y);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(name,()=>{drag=null;});
  handle.addEventListener('keydown',e=>{if(e.target!==handle)return;const d={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];if(d){e.preventDefault();const r=panel.getBoundingClientRect();place(r.left+d[0],r.top+d[1]);}});
  window.addEventListener('resize',()=>{if(panel.open){const r=panel.getBoundingClientRect();place(r.left,r.top);}});
  window.addEventListener('radar-screen-lock',()=>{drag=null;if(!canEditLocal())panel.close();});
  return anchor=>{const r=anchor.getBoundingClientRect();place(r.right+10,r.top);};
}
