import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../scripts/dev-playback.mjs',import.meta.url),'utf8');
const start=source.indexOf('function filterWindow(data) {');
test('rollover updates calendar bounds even when the requested old day has no surviving times',()=>{
 const end=Date.parse('2026-09-20T22:00:00Z')/1000,context=vm.createContext({scenario:'archive-rollover',end});
 // Calendar-only responses return before the image branch.
 const code=source.slice(start,source.indexOf('  if(!Array.isArray(data.frames))return data;',start))+'  return data;\n}';
 vm.runInContext(code,context);
 const oldest=(end-86400)*1000;
 const empty=context.filterWindow({oldest,newest:end*1000,times:[end-86400]});
 assert.equal(empty.times.length,0);assert.equal(empty.oldest,(end-21600)*1000);
 const current=context.filterWindow({oldest,newest:end*1000,times:[end-86400,end-21600,end]});
 assert.deepEqual(Array.from(current.times),[end-21600,end]);assert.equal(current.newest,end*1000);
});
