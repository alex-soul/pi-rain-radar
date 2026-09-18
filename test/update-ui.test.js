import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('browser reloads after an app upgrade, waits for Settings to close and ignores transient outages',async()=>{
  const app=(await readFile(new URL('../public/app.js',import.meta.url),'utf8')).replaceAll('\r\n','\n');
  let reloads=0,fail=false;
  const dialog={open:true,dataset:{}};
  const context=vm.createContext({historyWindow:null,historyLoading:false,appVersion:'0.1.1',mapIdentity:'map',AbortSignal,
    $:()=>dialog,location:{reload(){reloads++;}},paintStatus(){},paintMapUpdate(){},ageLiveWindow(){},playbackHours:()=>2,
    fetch:async()=>{if(fail)throw Error('restarting');return {ok:true,json:async()=>({appVersion:'0.1.2',mapId:'map'})};}
  });
  vm.runInContext(`let generation=0,status,serverReachable=true,displayed={},mapUpdateVisible=false;\n${app.slice(app.indexOf('let pollRunning = false;'),app.indexOf('try {\n  const response = await fetch(`/maps/'))}`,context);
  await context.poll();assert.equal(reloads,0);
  fail=true;dialog.open=false;
  await context.poll();assert.equal(reloads,0);
  fail=false;await context.poll();assert.equal(reloads,1);
});
