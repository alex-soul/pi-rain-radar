import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/preference-upgrade.js', import.meta.url), 'utf8');
const legacyWidget = 'radar-minutecast', legacyControl = 'minutecast-toggle';
function fixture(initial = {}) {
  const values = new Map(Object.entries(initial).map(([k,v]) => [k,JSON.stringify(v)]));
  const storage = { getItem:k => values.get(k) ?? null, setItem:(k,v) => values.set(k,v) };
  return { values, storage, run:() => vm.runInNewContext(source,{localStorage:storage}) };
}
test('forecast rename retains geometry, open state, hidden button and custom order', () => {
  const layout = {x:40,y:320,width:500,height:180,visible:true};
  const f = fixture({[legacyWidget]:layout,'radar-controls':[
    {id:'history-toggle',visible:true},{id:legacyControl,visible:false},{id:'clock-toggle',visible:true},
  ]});
  f.run();
  assert.deepEqual(JSON.parse(f.values.get('radar-rain-forecast')),layout);
  assert.deepEqual(JSON.parse(f.values.get('radar-controls')), [
    {id:'history-toggle',visible:true},{id:'rain-forecast-toggle',visible:false},{id:'clock-toggle',visible:true},
  ]);
  const first = [...f.values]; f.run(); assert.deepEqual([...f.values],first);
});
test('current preferences win over legacy widget and duplicate control entries', () => {
  const f=fixture({[legacyWidget]:{visible:true},'radar-rain-forecast':{visible:false},'radar-controls':[
    {id:legacyControl,visible:true},{id:'clock-toggle',visible:true},{id:'rain-forecast-toggle',visible:false},
  ]});
  f.run();
  assert.deepEqual(JSON.parse(f.values.get('radar-rain-forecast')),{visible:false});
  assert.deepEqual(JSON.parse(f.values.get('radar-controls')),[{id:'clock-toggle',visible:true},{id:'rain-forecast-toggle',visible:false}]);
});
test('bad legacy widget does not prevent independent button migration', () => {
  const f=fixture({'radar-controls':[{id:legacyControl,visible:false}]});
  f.values.set(legacyWidget,'broken JSON'); f.run();
  assert.equal(f.values.has('radar-rain-forecast'),false);
  assert.equal(JSON.parse(f.values.get('radar-controls'))[0].id,'rain-forecast-toggle');
});
test('fresh browsers and unavailable or full storage do not break startup', () => {
  const f=fixture(); f.run(); assert.equal(f.values.size,0);
  assert.doesNotThrow(()=>vm.runInNewContext(source,{}));
  f.values.set(legacyWidget,'{"visible":true}');
  f.storage.setItem=()=>{throw new Error('quota');};
  assert.doesNotThrow(f.run);
  assert.equal(f.values.get(legacyWidget),'{"visible":true}');
});
