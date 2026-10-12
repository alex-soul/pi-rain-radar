import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const local=await readFile(new URL('../public/local-ui.js',import.meta.url),'utf8');
const hover=local.slice(local.indexOf('export function setupExplanationHover'),local.indexOf('const cog=')).replace('export ','');
class Node {
 constructor(){this.events={};this.attributes={};this.children=[];this.dataset={};this.style={};const classes=new Set();this.classList={add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)};}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
 emit(type,properties={}){const event={type,target:this,...properties};for(const fn of this.events[type]??[])fn(event);this['on'+type]?.(event);}
 click(){this.emit('click');}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;this._text='';}
 set textContent(value){this._text=value;this.children=[];}
 get textContent(){return (this._text??'')+this.children.map(n=>typeof n==='string'?n:n.textContent).join('');}
 setAttribute(key,value){this.attributes[key]=value;}
 getAttribute(key){return this.attributes[key];}
 removeAttribute(key){delete this.attributes[key];}
 contains(node){return node===this||this.children.some(n=>typeof n!=='string'&&n.contains(node));}
 getBoundingClientRect(){return {left:20,bottom:30,width:180,height:60};}
 querySelector(){return this;}
}
async function fixture(kind){
 const body=new Node(),document=new Node();Object.assign(document,{body,createElement:()=>new Node(),createTextNode:text=>text});
 const window=new EventTarget(),Observer=class{observe(){}};
 const context=vm.createContext({document,window,Event,innerWidth:800,innerHeight:600,MutationObserver:Observer,ResizeObserver:Observer,canEditLocal:()=>true,combined:new Node(),detached:{metar:new Node(),taf:new Node()},aviationNames:{metar:'METAR',taf:'TAF'}});
 vm.runInContext(hover,context);
 if(kind==='chart'){
  const source=(await readFile(new URL('../public/chart-explanations.js',import.meta.url),'utf8')).replace(/^import .*\r?\n/gm,'').replaceAll('export ','');vm.runInContext(source,context);
  const first=new Node(),second=new Node();context.chartExplanation(first,'Temperature');context.chartExplanation(second,'Humidity');return {first,second,popup:body.children[0]};
 }
 const source=await readFile(new URL('../public/aviation-widget.js',import.meta.url),'utf8');vm.runInContext(source.slice(source.indexOf('const popup='),source.indexOf('function render()')),context);
 const section=context.reportNode('metar',{reports:{metar:{raw:'17010KT 9999',sections:[{start:0,end:7,meaning:'Wind from 170 degrees, 10 knots.'},{start:8,end:12,meaning:'Visibility 10 km or more.'}]}}});
 const buttons=section.children[0].children.filter(n=>typeof n!=='string');return {first:buttons[0],second:buttons[1],popup:body.children[0]};
}
for(const kind of ['chart','aviation'])test(`${kind} explanation opens on ordinary mouse hover without click or pointerType`,async()=>{
 const {first,second,popup}=await fixture(kind);
 assert.equal(popup.hidden,true);
 first.emit('mouseenter',{buttons:0});assert.equal(popup.hidden,false);const initial=popup.textContent;
 first.click();second.emit('mouseenter',{buttons:0});assert.equal(popup.hidden,false);assert.notEqual(popup.textContent,initial);
 second.emit('mouseleave');assert.equal(popup.hidden,true);
 second.emit('mousemove',{buttons:0});assert.equal(popup.hidden,false);
 second.click();second.emit('mouseleave');assert.equal(popup.hidden,false);second.click();assert.equal(popup.hidden,true);
 first.emit('pointerenter',{pointerType:'touch'});assert.equal(popup.hidden,true);
 first.emit('mouseenter',{sourceCapabilities:{firesTouchEvents:true}});assert.equal(popup.hidden,true);
 first.click();assert.equal(popup.hidden,false,'tap/click still opens the explanation');
});
