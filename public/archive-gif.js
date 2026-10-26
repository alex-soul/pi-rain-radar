import {setupSettingsHelp} from './settings-help.js';
import {dockOutline} from './weather-format.js';
import {gifPlan} from './archive-gif-model.js';
import {createGifAssets} from './archive-gif-assets.js';
const $=id=>document.getElementById(id);
const buttons='.map-controls,footer button:not(#footer-toggle),.settings-button,.local-cog,.widget-close,.settings-info';
const handles='#weather-handle,#footer-toggle,[id$="-resize"],.widget-drag-handle';
const excluded='dialog,script,style,.source,#layers-panel,#availability-panel,.widget-options,[role="tooltip"]';
export function setupArchiveGif(playback){
  const dialog=document.createElement('dialog');dialog.id='gif-dialog';dialog.setAttribute('aria-labelledby','gif-title');
  dialog.innerHTML=`<div class="gif-heading"><h2 id="gif-title">Export GIF</h2><button id="gif-close" aria-label="Close GIF export">×</button></div>
  <div class="gif-grid"><div class="gif-options"><fieldset id="gif-fields">
  <label for="gif-mode">View<select id="gif-mode"><option value="current">Current view</option><option value="main">Main map only</option><option value="overview">Overview map only</option></select></label>
  <label for="gif-size">Output size<select id="gif-size"><option value="1">100% · original size</option><option value="0.75" selected>75%</option><option value="0.5">50%</option><option value="0.25">25%</option></select></label>
  <label for="gif-colors">Colour detail<select id="gif-colors"><option value="64">Small · 64 colours</option><option value="128">Balanced · 128 colours</option><option value="256" selected>Best · 256 colours</option></select></label>
  <label class="gif-switch" for="gif-loop">Loop<input id="gif-loop" type="checkbox" class="control-switch" role="switch" checked></label>
  <div id="gif-view-options"><label class="gif-switch" for="gif-buttons">Hide buttons<input id="gif-buttons" type="checkbox" class="control-switch" role="switch"></label>
  <label class="gif-switch" for="gif-handles">Hide handles<input id="gif-handles" type="checkbox" class="control-switch" role="switch"></label></div>
  </fieldset></div><figure class="gif-preview"><img id="gif-preview" alt="GIF composition preview" hidden><figcaption id="gif-summary"></figcaption></figure></div>
  <progress id="gif-progress" value="0" max="1" hidden></progress><p id="gif-status" role="status" aria-live="polite"></p>
  <div class="gif-actions"><button id="gif-cancel" hidden>Cancel</button><button id="gif-generate">Generate GIF</button><a id="gif-download" hidden download>Download GIF</a></div>`;
  document.body.append(dialog);setupSettingsHelp(dialog);
  let session=null,controller=null,assets=null,worker=null,busy=false,previewing=false,pendingPreview=false,output=null,previewUrl=null,sourceSize=null,frozen=new Map(),plan=null,restoring=false,opening=false;
  const note=text=>{$('gif-status').textContent=text;};
  const mode=()=>$('gif-mode').value;
  const root=()=>mode()==='current'?document.querySelector('main'):mode()==='main'?document.querySelector('main'):document.querySelector('.overview-map');
  function keep(node){
    if(!(node instanceof Element))return true;
    if(mode()==='main'&&node.parentElement===document.querySelector('main')&&!node.matches('.map,#map-scale'))return false;
    return !node.matches(excluded)&&!node.hidden&&getComputedStyle(node).display!=='none';
  }
  function size(){
    if(mode()!=='overview')return sourceSize;
    const svg=document.querySelector('.overview-map'),r=svg.getBoundingClientRect(),v=svg.viewBox.baseVal;
    const panel=$('overview'),style=getComputedStyle(panel),savedWidth=parseFloat(panel.style.width);
    const width=r.width||(savedWidth?savedWidth-parseFloat(style.borderLeftWidth)-parseFloat(style.borderRightWidth):v.width);
    return {width,height:width*v.height/v.width};
  }
  function settings(){return {mode:mode(),scale:Number($('gif-size').value),colors:Number($('gif-colors').value),loop:$('gif-loop').checked,buttons:$('gif-buttons').checked,handles:$('gif-handles').checked};}
  function summary(){
    if(!session)return;
    const dimensions=size();plan=gifPlan({...session,...dimensions,scale:Number($('gif-size').value)});
    $('gif-summary').textContent=`${session.label} · ${session.count} frames · ${(plan.duration/1000).toFixed(2)} seconds · ${plan.width} × ${plan.height} px`;
    $('gif-view-options').hidden=mode()!=='current';
  }
  function urls(node){
    const found=[];
    function visit(n){if(!keep(n))return;if(n instanceof HTMLImageElement&&n.getAttribute('src'))found.push(n.src);if(n instanceof SVGImageElement&&n.href.baseVal)found.push(n.href.baseVal);for(const c of n.children??[])visit(c);}
    visit(node);return found;
  }
  async function prepare(list,signal,progress){
    const unique=[...new Set(list)];let count=0;
    for(const url of unique){signal.throwIfAborted();await assets.add(url);progress?.(++count,unique.length);}
  }
  function credits(){
    if(mode()==='current')return document.querySelector('.source').innerText.replace(/\s+/g,' ').trim();
    const role=mode(),svg=root(),rain=svg.querySelector(role==='main'?'#radar':'#overview-radar'),cloud=svg.querySelector(role==='main'?'#cloud-layer':'#overview-cloud-layer');
    const bits=['Map: Natural Earth'];
    if(rain?.getAttribute('href')&&rain.style.visibility==='visible'&&Number(rain.style.opacity)!==0){const text=$(role+'-provider').textContent.trim();if(text)bits.unshift('Radar: '+text);}
    if(cloud?.getAttribute('href')&&cloud.style.visibility==='visible'&&Number(cloud.style.opacity)!==0)bits.push('Clouds: Rainbow');
    if(!$('town-credit').hidden)bits.push('Towns: GeoNames (CC BY 4.0)');
    return bits.join(' · ');
  }
  async function capture(options,signal){
    signal.throwIfAborted();
    if(innerWidth!==sourceSize.width||innerHeight!==sourceSize.height)throw Error('The screen size changed. Close export and reopen it with the new layout.');
    const {toCanvas}=await import('./vendor/html-to-image/index.js'),dimensions=size();
    await prepare(urls(root()),signal);
    const canvas=await toCanvas(root(),{...dimensions,canvasWidth:plan.width,canvasHeight:plan.height,pixelRatio:1,skipFonts:true,skipAutoScale:true,
      backgroundColor:getComputedStyle(document.documentElement).backgroundColor,filter:keep,resourceResolver:url=>assets.resolve(url),
      style:{position:'relative',left:'0',top:'0',margin:'0',transform:'none',width:dimensions.width+'px',height:dimensions.height+'px'},
      onCloneNode(original,clone){
        if(!(original instanceof Element))return;
        const saved=frozen.get(original);if(saved)for(const [key,value]of Object.entries(saved))clone.style.setProperty(key,value);
        clone.style?.setProperty('animation','none');clone.style?.setProperty('transition','none');
        if(options.mode==='current'){
          if((options.buttons&&original.matches(buttons))||(options.handles&&original.matches(handles)))clone.style.opacity='0';
          if(options.handles&&original.id==='weather-outline'){
            const {width,height}=original.ownerSVGElement.viewBox.baseVal;
            clone.setAttribute('d',dockOutline(width,height,false));
          }
          if(options.handles&&original.matches('footer')){
            // Close the border gap left by the removed bottom-dock handle.
            const style=document.createElement('style'),stroke=getComputedStyle(original.querySelector('.footer-shape path')).stroke;
            style.textContent=`footer::before{background:${stroke}!important;}`;clone.append(style);
          }
        }
      }
    });
    signal.throwIfAborted();
    // Lay out attribution in source pixels, then scale it with the exported map.
    const ctx=canvas.getContext('2d'),font=11,line=15,pad=5;
    ctx.save();ctx.scale(canvas.width/dimensions.width,canvas.height/dimensions.height);ctx.font=`${font}px Arial`;
    const words=credits().split(' '),lines=[];let text='';
    for(const word of words){if(text&&ctx.measureText(text+' '+word).width>dimensions.width-pad*2){lines.push(text);text=word;}else text+=(text?' ':'')+word;}if(text)lines.push(text);
    const boxWidth=Math.min(dimensions.width,Math.ceil(Math.max(0,...lines.map(text=>ctx.measureText(text).width)))+pad*2),left=dimensions.width-boxWidth;
    ctx.fillStyle='#142623ee';ctx.fillRect(left,dimensions.height-lines.length*line-pad*2,boxWidth,lines.length*line+pad*2);ctx.fillStyle='#edf4ee';
    lines.forEach((text,i)=>ctx.fillText(text,left+pad,dimensions.height-pad-(lines.length-1-i)*line-2));
    ctx.restore();
    return canvas;
  }
  function releasePreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;}
  function releaseOutput(){if(output)URL.revokeObjectURL(output);output=null;$('gif-download').hidden=true;}
  async function preview(){
    if(!session||busy)return;
    if(previewing){pendingPreview=true;return;}previewing=true;$('gif-generate').disabled=true;
    releaseOutput();note('');$('gif-generate').textContent='Preparing preview…';
    try{
      summary();await prepare(session.assets(mode(),session.index),controller.signal);await session.render(session.index,mode(),assets);const canvas=await capture(settings(),controller.signal),blob=await new Promise(resolve=>canvas.toBlob(resolve));
      controller.signal.throwIfAborted();releasePreview();previewUrl=URL.createObjectURL(blob);$('gif-preview').src=previewUrl;$('gif-preview').hidden=false;
      note('');$('gif-generate').disabled=false;
    }catch(error){if(error.name!=='AbortError')note(error.message||'Could not prepare preview.');}
    finally{$('gif-generate').textContent='Generate GIF';previewing=false;if(pendingPreview&&session){pendingPreview=false;void preview();}}
  }
  function workerCall(message,signal,transfer=[]){
    return new Promise((resolve,reject)=>{
      const abort=()=>{cleanup();reject(signal.reason);};
      const cleanup=()=>{signal.removeEventListener('abort',abort);worker?.removeEventListener('message',receive);worker?.removeEventListener('error',error);};
      const receive=({data})=>{cleanup();data.type==='error'?reject(Error(data.message)):resolve(data);};
      const error=()=>{cleanup();reject(Error('GIF encoding failed. Try a smaller output size.'));};
      signal.addEventListener('abort',abort,{once:true});worker.addEventListener('message',receive);worker.addEventListener('error',error);worker.postMessage(message,transfer);
    });
  }
  async function generate(){
    if(busy||previewing||!session)return;busy=true;releaseOutput();$('gif-fields').disabled=true;$('gif-generate').disabled=true;$('gif-cancel').hidden=false;$('gif-progress').hidden=false;
    const signal=controller.signal,options=settings(),started=performance.now();
    try{
      const chunks=[];
      worker=new Worker('/archive-gif-worker.js',{type:'module'});
      for(let i=0;i<session.count;i++){
        signal.throwIfAborted();
        // Keep only this frame's media and the currently visible static assets.
        const needed=session.assets(options.mode,i);
        assets.retain([...needed,...urls(root())]);
        note(`Preparing frame · ${i+1} / ${session.count}`);
        await prepare(needed,signal);await session.render(i,options.mode,assets);
        const canvas=await capture(options,signal),rgba=canvas.getContext('2d').getImageData(0,0,plan.width,plan.height);
        note(`Rendering GIF · ${i+1} / ${session.count}`);
        const encoded=await workerCall({type:'frame',pixels:rgba.data.buffer,width:plan.width,height:plan.height,colors:options.colors,delay:plan.delays[i],loop:options.loop},signal,[rgba.data.buffer]);
        chunks.push(new Blob([encoded.bytes]));
        canvas.width=canvas.height=1;$('gif-progress').value=(i+1)/session.count;
      }
      const result=await workerCall({type:'finish'},signal),blob=new Blob([...chunks,result.bytes],{type:'image/gif'});
      output=URL.createObjectURL(blob);releasePreview();$('gif-preview').src=output;
      $('gif-download').href=output;$('gif-download').download=`pi-weather-${options.mode}-${new Date(session.end*1000).toISOString().replaceAll(':','-')}.gif`;$('gif-download').hidden=false;
      note(`Ready · ${(blob.size/1048576).toFixed(2)} MB · generated in ${((performance.now()-started)/1000).toFixed(1)} s on this device.`);
    }catch(error){note(error.name==='AbortError'?'Export cancelled.':error.message||'Export failed. Close and reload history to try again.');}
    finally{
      worker?.terminate();worker=null;assets.clear();busy=false;$('gif-cancel').hidden=true;$('gif-progress').hidden=true;
      // Restore ordinary playback even while the finished download stays open.
      restoring=true;const previous=session;session=null;
      try{await previous.restore();}finally{restoring=false;frozen.clear();}
      $('gif-generate').hidden=true;$('gif-fields').disabled=true;
    }
  }
  async function close(){
    if(busy){controller.abort();return;}
    if(restoring)return;
    controller?.abort();if(session){const old=session;session=null;await old.restore();}
    assets?.clear();frozen.clear();releasePreview();releaseOutput();dialog.close();
  }
  $('archive-export').addEventListener('click',async()=>{
    if(session||busy||restoring||opening)return;opening=true;
    $('archive-dialog').close();
    try{
      session=await playback.begin();sourceSize={width:innerWidth,height:innerHeight};
      frozen=new Map([...document.querySelectorAll('.map-controls,.map-controls>*,header,footer,#weather-handle,#footer-toggle,.settings-button')].map(node=>{const s=getComputedStyle(node);return [node,Object.fromEntries(['opacity','visibility','transform'].map(k=>[k,s.getPropertyValue(k)]))];}));
      controller=new AbortController();assets=createGifAssets(controller.signal);$('gif-fields').disabled=false;$('gif-generate').hidden=false;dialog.showModal();void preview();
    }catch(error){note(error.message);if(!dialog.open)dialog.showModal();}
    finally{opening=false;}
  });
  const invalidate=()=>{if(session)controller?.abort(Error('Screen settings changed. Close export and reopen it with the new layout.'));};
  for(const event of ['radar-local-preferences','radar-weather-preferences','radar-layers-change'])window.addEventListener(event,invalidate);
  window.addEventListener('storage',event=>{if(!event.key||event.key.startsWith('radar-'))invalidate();});
  $('gif-fields').addEventListener('change',()=>void preview());$('gif-generate').onclick=generate;$('gif-cancel').onclick=()=>controller.abort();$('gif-close').onclick=close;
  dialog.addEventListener('cancel',event=>{event.preventDefault();void close();});
}
