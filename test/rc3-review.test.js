import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initial,frameFor} from '../scripts/rc3-review/model.mjs';
function mixed(){return {...initial(),ha:true,haCollect:true,source:'ha',mappings:{temperature:'ha',feels:'owm',wind:'ha',gust:'owm'}};}
test('intentional OWM stays normal while unavailable mapped HA uses optional amber fallback',()=>{
 const s={...mixed(),scenario:'partial',fallback:true};const rows=frameFor(s,1000,false).rows;
 assert.equal(rows.temperature.source,'owm');assert.equal(rows.temperature.fallback,true);
 assert.equal(rows.feels.source,'owm');assert.equal(rows.feels.fallback,false);assert.equal(rows.wind.source,'ha');
 s.fallback=false;assert.equal(frameFor(s,1000,false).rows.temperature.source,null);
});
test('unit mismatch never relabels raw HA values and can use OWM fallback',()=>{
 const s=mixed();s.units.windUnit='km/h';let row=frameFor(s,1000,false).rows.wind;assert.equal(row.source,null);assert.match(row.reason,/Unit mismatch/);
 s.fallback=true;row=frameFor(s,1000,false).rows.wind;assert.equal(row.source,'owm');assert.equal(row.fallback,true);
});
test('stopping collection allows cached freshness then expires independently',()=>{
 const s={...mixed(),haCollect:false,haStoppedAt:1000,owmCollect:false,owmStoppedAt:1000,fallback:true};
 assert.equal(frameFor(s,1001,false).rows.wind.source,'ha');
 assert.equal(frameFor(s,601001,false).rows.wind.source,'owm');
 assert.equal(frameFor(s,1801001,false).rows.wind.source,null);
});
test('historical effective units and source policy survive later Live settings',()=>{
 const baseline=mixed(),after={...mixed(),units:{...initial().units,temperatureUnit:'F'},fallback:true};
 const s={...initial(),baseline,timeline:[{at:15000,config:after}]};
 assert.equal(frameFor(s,14999,true).config.units.temperatureUnit,'C');
 assert.equal(frameFor(s,15000,true).config.units.temperatureUnit,'F');
 assert.equal(frameFor(s,15000,true).rows.temperature.fallback,true);
 assert.equal(frameFor(s,15000,false).config.units.temperatureUnit,'C');
 assert.equal(frameFor(s,15000,true,'owm').rows.temperature.fallback,false);
});
