import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('gap explanations never seek; playback controls preserve popup while outside dismisses',async()=>{
 const events={},nodes=new Map();
 const make=()=>({children:[],hidden:false,dataset:{},style:{setProperty(k,v){this[k]=v;}},offsetWidth:120,offsetHeight:40,
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}},
  replaceChildren(...items){this.children=[];this.append(...items);},
  contains(item){return item===this||this.children.some(child=>child.contains(item));},
  setAttribute(name,value){this[name]=value;},getAttribute(name){return this[name];},
  getBoundingClientRect(){return {left:100,top:200};}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
 node('footer').append(node('playback-row'),node('date'),node('footer-toggle'));
 node('playback-row').closest=()=>node('footer');
 node('playback-row').append(node('play'),node('timeline'),node('frame-count'));
 const source=(await readFile(new URL('../public/availability.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'').replace('export function','function');
 const context=vm.createContext({document:{getElementById:node,createElement:make,addEventListener:(name,fn)=>events[name]=fn},window:{innerWidth:1280,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},availabilityRows:()=>[{label:'Clouds',segments:[{time:1000,health:'warning',detail:[{label:'Main',health:'warning',time:400}]}]}]});
 vm.runInContext(source,context);
 let seeks=0;context.updateAvailability({start:1000,end:1000,time:1000},()=>seeks++);
 for(const [time,position] of [[1000,0],[2800,3],[4600,6],[8200,12]]){context.updateAvailability({start:1000,end:8200,time},()=>seeks++);assert.equal(node('playback-row').children.at(-1).style['--availability-position'],(position+.5)/13*100+'%');}
 context.updateAvailability({start:1000,end:87400,time:44200},()=>seeks++);
 assert.equal(node('playback-row').children.at(-1).style['--availability-count'],'145');
 assert.equal(node('playback-row').children.at(-1).style['--availability-position'],'50%');
 node('frame-count').onclick();assert.equal(node('availability-panel').hidden,false);
 for(const target of [node('play'),node('timeline'),node('date'),node('footer-toggle'),node('frame-count')]){events.pointerdown({target});assert.equal(node('availability-panel').hidden,false);}
 node('frame-count').onclick();assert.equal(node('availability-panel').hidden,false);
 const gap=node('availability-rows').children[0].children[1].children[0];
 gap.onclick();assert.equal(seeks,0);assert.equal(node('availability-detail').hidden,false);
 gap.onclick();assert.equal(node('availability-detail').hidden,true);
 gap.onpointerenter({pointerType:'mouse'});assert.equal(node('availability-detail').hidden,false);
 gap.onpointerleave();assert.equal(node('availability-detail').hidden,true);
 events.pointerdown({target:make()});assert.equal(node('availability-panel').hidden,true);
});
