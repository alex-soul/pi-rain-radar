import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../public/display.js', import.meta.url), 'utf8');
test('display preferences suspend idle hiding during interaction and dialogs, and recover on tap', () => {
  const events = {}, nodes = {}, classes = new Set(), content = [{}, {}, {}];
  let timer, open = false, observer, editable = true, saved;
  const dispatched = [];
  const node = id => nodes[id] ??= {checked:false, hidden:true, setAttribute(k,v){this[k]=v;}, attributes:new Set(), toggleAttribute(k,v){v?this.attributes.add(k):this.attributes.delete(k);}, style:{}, dataset:{width:214}, handlers:{}, addEventListener(k, fn){this.handlers[k]=fn;}};
  const footer = {offsetHeight:76, querySelectorAll:()=>content};
  vm.runInNewContext(source.replaceAll('export function', 'function')+'\nsetupDisplaySettings(canEdit);', {
    canEdit:()=>editable,
    document:{hidden:false, body:{style:{setProperty(){}},classList:{toggle(k,v){v?classes.add(k):classes.delete(k);}}},
      getElementById:node, querySelector:q=>q==='footer'?footer:open?{}:null, querySelectorAll:()=>[{}], addEventListener:(k,fn)=>events[k]=fn},
    window:{addEventListener:(k,fn)=>events[k]=fn,dispatchEvent(e){dispatched.push(e);}}, Event, CustomEvent, innerWidth:1280,innerHeight:720,
    localStorage:{getItem:()=>null,setItem:(k,v)=>saved=JSON.parse(v)},
    setTimeout:(fn,ms)=>{assert.equal(ms,15000);timer=fn;return 1;},clearTimeout:()=>timer=null,
    MutationObserver:class{constructor(fn){observer=fn;}observe(){}},ResizeObserver:class{observe(){}},
  });
  assert.equal(typeof timer, 'function'); assert.equal(node('settings-toggle').hidden,true);
  assert.equal(node('gust-cache-minutes').value,60);
  node('gust-cache-minutes').value='90';node('gust-cache-minutes').handlers.change();
  assert.equal(saved.gustCacheMinutes,90);assert.equal(dispatched.at(-1).type,'radar-gust-cache-change');
  editable=false;node('gust-cache-minutes').value='120';node('gust-cache-minutes').handlers.change();
  assert.equal(node('gust-cache-minutes').value,90);assert.equal(saved.gustCacheMinutes,90);editable=true;
  let invalid=0;node('gust-cache-minutes').reportValidity=()=>invalid++;
  for(const value of ['', '0', '1.5', '-1', '1441']) {node('gust-cache-minutes').value=value;node('gust-cache-minutes').handlers.change();}
  assert.equal(invalid,5);assert.equal(saved.gustCacheMinutes,90);

  events.click();assert.equal(node('settings-toggle').hidden,false);timer();assert.equal(node('settings-toggle').hidden,true);
  assert.equal(classes.has('footer-hidden'),false);
  node('footer-toggle').handlers.click();assert.equal(classes.has('footer-hidden'),true);
  events.click();assert.equal(classes.has('footer-hidden'),true);
  node('footer-toggle').handlers.click();assert.equal(classes.has('footer-hidden'),false);
  assert.equal(node('map-scale').attributes.has('hidden'),false);
  node('auto-hide-footer').checked=true;node('auto-hide-footer').handlers.change();
  assert.equal(saved.autoHide,true);timer();assert.ok(classes.has('footer-hidden'));assert.ok(content.every(x=>x.inert));
  events.click();assert.ok(!classes.has('footer-hidden'));
  events.pointerdown({pointerId:1});assert.equal(timer,null);
  events.pointerup({pointerId:1});assert.equal(typeof timer,'function');
  open=true;observer();assert.equal(timer,null);assert.ok(!classes.has('footer-hidden'));
  open=false;observer();assert.equal(typeof timer,'function');
  editable=false;node('show-map-scale').checked=false;node('show-map-scale').handlers.change();assert.equal(node('map-scale').attributes.has('hidden'),false);
  editable=true;node('show-map-scale').checked=false;node('show-map-scale').handlers.change();assert.equal(node('map-scale').attributes.has('hidden'),true);
  node('auto-hide-footer').checked=false;node('auto-hide-footer').handlers.change();assert.equal(typeof timer,'function');assert.ok(!classes.has('footer-hidden'));
  node('auto-hide-weather').checked=true;node('auto-hide-weather').handlers.change();
  assert.equal(saved.autoHideWeather,true);timer();
  assert.equal(dispatched.at(-1).detail,false);assert.ok(!classes.has('footer-hidden'));
  events.click({target:{closest:selector=>selector==='#weather-dock'}});
  assert.equal(dispatched.at(-1).detail,false);
  events.click();assert.equal(dispatched.at(-1).detail,true);
});

for (const widget of ['overview', 'minutecast']) {
  const widgetSource = await readFile(new URL(`../public/${widget}.js`, import.meta.url), 'utf8');
  test(`${widget} restores low saved positions with auto-hide, but respects a permanent footer`, () => {
    for (const autoHide of [true, false]) {
      const nodes = {}, events = {};
      const node = id => nodes[id] ??= {style:{}, offsetWidth:200, offsetHeight:170, setAttribute(){}, addEventListener(){}};
      const context = vm.createContext({
        document:{getElementById:node, querySelector:()=>({getBoundingClientRect:()=>({top:644})})},
        window:{addEventListener:(event,fn)=>events[event]=fn}, innerWidth:1280, innerHeight:720,
        localStorage:{getItem:key=>JSON.stringify(key==='radar-display'?{autoHide}:{visible:true,x:20,y:530,width:200,height:170}),setItem(){}},
        ResizeObserver:class {observe(){}},
      });
      vm.runInContext(source.replaceAll('export function','function'),context);
      vm.runInContext(widgetSource.replace(/^import[^\n]+\n/,''),context);
      assert.equal(node(widget).style.top, autoHide?'530px':'466px');
      events.resize();
      assert.equal(node(widget).style.top, autoHide?'530px':'466px');
      events['radar-display-change']();
      assert.equal(node(widget).style.top, autoHide?'530px':'466px');
    }
  });
}

test('last interacted widget comes forward without moving either widget', () => {
  const nodes = Object.fromEntries(['overview','minutecast'].map(id=>[id,{
    front:false, handlers:{}, style:{left:'20px',top:'530px'},
    classList:{toggle(key,value){nodes[id].front=value;}},
    addEventListener(key,fn){this.handlers[key]=fn;},
  }]));
  vm.runInNewContext(source.replaceAll('export function','function')+"\nsetupWidgetLayer(document.getElementById('overview'));setupWidgetLayer(document.getElementById('minutecast'));",{
    document:{getElementById:id=>nodes[id]}, localStorage:{getItem:()=>null},
  });
  for(const [id,event] of [['overview','pointerdown'],['minutecast','click'],['overview','focusin']]) {
    nodes[id].handlers[event]();
    assert.equal(nodes.overview.front,id==='overview');
    assert.equal(nodes.minutecast.front,id==='minutecast');
    for(const node of Object.values(nodes)) assert.deepEqual(node.style,{left:'20px',top:'530px'});
  }
});

for (const widget of ['overview', 'minutecast']) {
  test(`${widget} surface drag ignores taps and resize controls`, async () => {
    const nodes = {};
    const node = id => nodes[id] ??= {style:{}, handlers:{}, offsetWidth:300, offsetHeight:170,
      setAttribute(){}, focus(){}, setPointerCapture(){}, getBoundingClientRect:()=>({left:20,top:100}),
      addEventListener(k,fn){this.handlers[k]=fn;}};
    const context = vm.createContext({document:{getElementById:node,querySelector:()=>({})},
      widgetBottom:()=>720,setupWidgetLayer:()=>()=>{},innerWidth:1280,innerHeight:720,
      window:{addEventListener(){}},ResizeObserver:class{observe(){}},
      localStorage:{getItem:()=>JSON.stringify({visible:true,x:20,y:100,width:300,height:170}),setItem(){}},
    });
    const code = await readFile(new URL(`../public/${widget}.js`, import.meta.url),'utf8');
    vm.runInContext(code.replace(/^import[^\n]+\n/,''),context);
    const panel=node(widget), target={closest:()=>null};
    const down={button:0,isPrimary:true,pointerId:1,clientX:100,clientY:150,target};
    panel.handlers.pointerdown(down);
    panel.handlers.pointermove({...down,clientX:102});
    assert.equal(panel.style.left,'20px');
    panel.handlers.pointermove({...down,clientX:120,clientY:170});
    assert.equal(panel.style.left,'40px');assert.equal(panel.style.top,'120px');
    panel.handlers.pointerup();
    panel.handlers.pointerdown({...down,target:{closest:()=>node(widget+'-resize')}});
    panel.handlers.pointermove({...down,clientX:200});
    assert.equal(panel.style.left,'40px');
    panel.handlers.keydown({key:'ArrowRight',target:node(widget+'-resize')});
    assert.equal(panel.style.left,'40px');
  });
}

test('gust display lifetime restores valid preferences and defaults invalid values to 60 minutes',()=>{
  for(const [value,expected] of [[undefined,60],[false,60],[0,60],[-1,60],['90',60],[1.5,60],[1441,60],[1,1],[90,90],[1440,1440]]) {
    const context=vm.createContext({localStorage:{getItem:()=>JSON.stringify({gustCacheMinutes:value})}});
    vm.runInContext(source.replaceAll('export function','function'),context);
    assert.equal(context.gustCacheMinutes(),expected);
  }
});
