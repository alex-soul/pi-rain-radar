import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const formatSource = (await readFile(new URL('../public/weather-format.js', import.meta.url), 'utf8')).replaceAll('export ', '');
const source = formatSource + '\n' + (await readFile(new URL('../public/display.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
test('display preferences suspend idle hiding during interaction and dialogs, and recover on tap', () => {
  const events = {}, nodes = {}, classes = new Set(), content = [{}, {}, {}];
  let timer, open = false, observer, editable = true, saved;
  const dispatched = [];
  const node = id => nodes[id] ??= {checked:false, hidden:true, classList:{toggle(){}}, closest(){return this;}, setAttribute(k,v){this[k]=v;}, attributes:new Set(), toggleAttribute(k,v){v?this.attributes.add(k):this.attributes.delete(k);}, style:{}, dataset:{width:214}, handlers:{}, addEventListener(k, fn){this.handlers[k]=fn;}};
  const footer = {offsetHeight:76, querySelectorAll:()=>content};
  vm.runInNewContext(source.replaceAll('export function', 'function')+'\nsetupDisplaySettings(canEdit);', {
    canEdit:()=>editable,
    document:{hidden:false, body:{style:{setProperty(){}},classList:{contains:k=>classes.has(k),toggle(k,v){v?classes.add(k):classes.delete(k);}}},
      getElementById:node, querySelector:q=>q==='footer'?footer:open?{}:null, querySelectorAll:q=>q==='[data-reading-choice]'?[]:[{}], addEventListener:(k,fn)=>events[k]=fn},
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
  // Lock still permits automatic dock reveal, without enabling their controls.
  node('auto-hide-footer').checked=true;node('auto-hide-footer').handlers.change();
  classes.add('screen-locked');timer();
  assert.ok(classes.has('footer-hidden'));assert.equal(dispatched.at(-1).detail,false);
  events['radar-settings-wake']({target:{}});
  assert.ok(!classes.has('footer-hidden'));assert.equal(dispatched.at(-1).detail,true);
  assert.ok(content.every(x=>x.inert));
  timer();assert.ok(classes.has('footer-hidden'));assert.equal(dispatched.at(-1).detail,false);
  // With auto-hide off, opening Settings/enabling lock cannot undo manual collapse.
  classes.delete('screen-locked');
  node('auto-hide-footer').checked=false;node('auto-hide-footer').handlers.change();
  node('auto-hide-weather').checked=false;node('auto-hide-weather').handlers.change();
  node('footer-toggle').handlers.click();
  classes.add('screen-locked');const count=dispatched.length;
  events['radar-screen-lock']();events['radar-settings-wake']({target:{}});
  assert.ok(classes.has('footer-hidden'));assert.equal(dispatched.length,count);
});

for (const widget of ['overview', 'rain-forecast']) {
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
  const nodes = Object.fromEntries(['overview','rain-forecast'].map(id=>[id,{
    front:false, handlers:{}, style:{left:'20px',top:'530px'},
    classList:{toggle(key,value){nodes[id].front=value;}},
    addEventListener(key,fn){this.handlers[key]=fn;},
  }]));
  vm.runInNewContext(source.replaceAll('export function','function')+"\nsetupWidgetLayer(document.getElementById('overview'));setupWidgetLayer(document.getElementById('rain-forecast'));",{
    document:{getElementById:id=>nodes[id]}, localStorage:{getItem:()=>null},
  });
  for(const [id,event] of [['overview','pointerdown'],['rain-forecast','click'],['overview','focusin']]) {
    nodes[id].handlers[event]();
    assert.equal(nodes.overview.front,id==='overview');
    assert.equal(nodes['rain-forecast'].front,id==='rain-forecast');
    for(const node of Object.values(nodes)) assert.deepEqual(node.style,{left:'20px',top:'530px'});
  }
});

for (const widget of ['overview', 'rain-forecast']) {
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

test('display choices restore independently and reject unsupported units and playback speeds', () => {
  function screen(saved) {
    const context=vm.createContext({localStorage:{getItem:()=>JSON.stringify(saved)}});
    vm.runInContext(source.replaceAll('export function','function'),context);
    return context;
  }
  const selected=screen({temperatureUnit:'F',windUnit:'kn',readings:[],playbackSpeed:2,playbackHours:6});
  assert.equal(selected.playbackHours(),6);
  assert.equal(screen({playbackHours:4}).playbackHours(),4);
  for(const playbackHours of [0,3,8,'6',null]) assert.equal(screen({playbackHours}).playbackHours(),2);
  assert.equal(selected.weatherPreferences().temperatureUnit,'F');
  assert.equal(selected.weatherPreferences().readings.length,0);
  assert.equal(selected.playbackSpeed(),2);
  const defaults=screen({temperatureUnit:'K',windUnit:'invalid',readings:['dew','invalid','dew'],playbackSpeed:50});
  assert.equal(defaults.weatherPreferences().temperatureUnit,'C');
  assert.equal(defaults.weatherPreferences().windUnit,'mph');
  assert.deepEqual(Array.from(defaults.weatherPreferences().readings),['dew']);
  assert.equal(defaults.playbackSpeed(),1);
});

test('reading editor saves reorder, preserves hidden readings, and cancels interrupted drags', () => {
  const ids=['temperature','feels','wind','gust','humidity','dew','direction','visibility','pressure','uv'];
  let children=[], saved, writes=0, editable=true;
  const list={get children(){return children;},append(row){children=children.filter(x=>x!==row);children.push(row);},insertBefore(row,before){children=children.filter(x=>x!==row);children.splice(children.indexOf(before),0,row);}};
  const rows=ids.map(id=>{
    const handle={handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},setPointerCapture(){},focus(){}};
    const row={dataset:{readingRow:id},handle,classList:{add(){},remove(){}},querySelector:()=>handle,getBoundingClientRect:()=>({top:children.indexOf(row)*60,bottom:children.indexOf(row)*60+54})};return row;
  });
  children=[...rows];
  const c=vm.createContext({document:{getElementById:id=>id==='reading-list'?list:{}},window:{dispatchEvent(){}},Event:class{},localStorage:{getItem:()=>null,setItem:(_,value)=>{saved=JSON.parse(value);writes++;}}});
  vm.runInContext(source.replaceAll('export function','function'),c);
  const cancel=c.setupReadingEditor(()=>editable), handle=rows[0].handle;
  handle.handlers.pointerdown({button:0,isPrimary:true,pointerId:1});handle.handlers.pointermove({pointerId:1,clientY:90});
  assert.equal(children[1],rows[0]);cancel();assert.equal(children[0],rows[0]);assert.equal(writes,0);
  handle.handlers.keydown({key:'ArrowDown',preventDefault(){}});
  assert.deepEqual(saved.readingOrder,['feels','temperature','wind','gust','humidity','dew','direction','visibility','pressure','uv']);
  assert.deepEqual(saved.readings,['temperature','feels','wind','gust']);
  editable=false;handle.handlers.keydown({key:'ArrowDown',preventDefault(){}});assert.equal(writes,1);
});

test('new weather preferences default safely and preserve old reading choices',()=>{
  function load(saved){const c=vm.createContext({localStorage:{getItem:()=>JSON.stringify(saved)}});vm.runInContext(source.replaceAll('export function','function'),c);return c.weatherPreferences();}
  const old=load({readings:['wind','gust'],readingOrder:['gust','wind']});
  assert.equal(old.directionConvention,'flow');assert.equal(old.directionFormat,'compass');assert.equal(old.visibilityUnit,'km');assert.equal(old.pressureUnit,'hPa');assert.deepEqual([...old.readings],['wind','gust']);
  const custom=load({visibilityUnit:'mi',pressureUnit:'mmHg',directionFormat:'degrees',directionConvention:'meteorological',readings:[]});
  assert.equal(custom.visibilityUnit,'mi');assert.equal(custom.pressureUnit,'mmHg');assert.equal(custom.directionFormat,'degrees');assert.equal(custom.directionConvention,'meteorological');assert.equal(custom.readings.length,0);
  const invalid=load({visibilityUnit:'m',pressureUnit:'psi',directionFormat:'arrows',directionConvention:'from'});
  assert.equal(invalid.visibilityUnit,'km');assert.equal(invalid.pressureUnit,'hPa');assert.equal(invalid.directionFormat,'compass');assert.equal(invalid.directionConvention,'flow');
});
