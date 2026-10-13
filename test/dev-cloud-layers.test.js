import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCloudGroups,plotTop,randomCloud,cloudScenarios,cloudFooter,cloudBanks,cloudOutline,verticalVisibility} from '../scripts/dev-cloud-layers-model.js';
test('cloud preview scenarios parse and distinguish unavailable from clear',()=>{
  for(const scenario of cloudScenarios)assert.doesNotThrow(()=>parseCloudGroups(scenario.codes));
  assert.equal(parseCloudGroups('').state,'missing');
  assert.equal(parseCloudGroups('CAVOK').state,'clear');
  assert.notEqual(parseCloudGroups('CAVOK').message,parseCloudGroups('SKC').message);
});
test('footer preserves report timestamp and groups with explicit health colours',()=>{
  const report=parseCloudGroups('FEW006 BKN014 OVC028'),context={station:'EGBB',timestamp:'131020Z',dataState:'fresh'};
  assert.deepEqual(cloudFooter(report,context),{health:'ready',label:'METAR up to date',station:'EGBB',timestamp:'131020Z',groups:report.raw});
  for(const [dataState,health] of [['stale','warning'],['unavailable','neutral'],['not-configured','neutral'],['error','error']])assert.equal(cloudFooter(report,{...context,dataState}).health,health);
  assert.equal(cloudFooter(parseCloudGroups(''),context).health,'neutral');
  assert.equal(cloudFooter(report,{...context,dataState:'unavailable'}).groups,'—');
  assert.equal(cloudFooter(report,{...context,timestamp:'139999Z'}).health,'neutral');
});
test('cloud bases retain source precision and missing heights are not zero',()=>{
  const result=parseCloudGroups('few006 SCT/// BKN020CB');
  assert.deepEqual(result.layers.map(l=>[l.amount,l.baseFt,l.type]),[['FEW',600,''],['SCT',null,''],['BKN',2000,'CB']]);
  assert.equal(parseCloudGroups('VV///').layers[0].baseFt,null);
});
test('cloud-group editor rejects full reports, trends and invalid combinations',()=>{
  for(const code of ['BKN020 TEMPO OVC005','METAR EGBB FEW020','<svg>','VV002 BKN020','VV002CB','CAVOK FEW020','BKN20'])assert.throws(()=>parseCloudGroups(code));
});
test('auto scale contains known bases and fixed scale remains fixed',()=>{
  const layers=parseCloudGroups('SCT008 BKN060 OVC180').layers;
  assert.ok(plotTop(layers)>18000*.3048);
  assert.equal(plotTop(layers,'m',1500),1500);
  assert.ok(Number.isFinite(plotTop(parseCloudGroups('SCT///').layers)));
  const a=randomCloud(7),b=randomCloud(7);assert.deepEqual(Array.from({length:20},a),Array.from({length:20},b));
});
test('cloud banks stay reproducible, with distinct coverage and real gaps across variations',()=>{
  for(let seed=1;seed<=50;seed++)for(const variation of [0,.5,1])for(const size of [.5,1,1.5,2]){
    let previous=0;
    for(const amount of ['FEW','SCT','BKN','OVC']){
      const banks=cloudBanks(amount,seed,variation,size);
      assert.deepEqual(banks,cloudBanks(amount,seed,variation,size));
      const coverage=banks.reduce((sum,bank)=>sum+bank.width,0);
      assert.ok(coverage>previous);previous=coverage;
      if(amount==='OVC'){assert.ok(banks[0].start<0);assert.ok(banks[0].start+banks[0].width>1);}
      else for(let i=1;i<banks.length;i++)assert.ok(banks[i].start>banks[i-1].start+banks[i-1].width);
      for(const span of [110,600])for(const bank of banks)assert.doesNotMatch(cloudOutline(bank,span),/NaN|Infinity/);
    }
  }
  assert.notDeepEqual(cloudBanks('BKN',7),cloudBanks('BKN',8));
});

test('size changes bank widths while retaining category coverage; irregularity changes contour not extent',()=>{
  for(const amount of ['FEW','SCT','BKN','OVC']){
    const small=cloudBanks(amount,7,.5,.5),large=cloudBanks(amount,7,.5,2);
    const coverage=banks=>banks.reduce((sum,b)=>sum+b.width,0);
    assert.ok(Math.abs(coverage(small)-coverage(large))<1e-9);
    if(amount!=='OVC')assert.ok(coverage(large)/large.length>coverage(small)/small.length);
    else assert.notDeepEqual(small[0].peaks,large[0].peaks);
    const bank=cloudBanks(amount,7)[0];
    const smooth=cloudOutline({...bank,variation:0},400),uneven=cloudOutline({...bank,variation:1},400);
    assert.notEqual(smooth,uneven);
    const height=path=>Math.min(...[...path.matchAll(/[-\d.]+,([-\d.]+)/g)].map(m=>Number(m[1])));
    assert.ok(Math.abs(height(smooth)-height(uneven))<=.01);
  }
});

test('vertical visibility is distinct from cloud bases, unknown height and absent data',()=>{
  assert.deepEqual(verticalVisibility(parseCloudGroups('VV002'),'ft'),{value:200,label:'VV 200 ft'});
  const metres=verticalVisibility(parseCloudGroups('VV002'));
  assert.equal(metres.value,60.96);assert.equal(metres.label,'VV 61 m');
  assert.deepEqual(verticalVisibility(parseCloudGroups('VV///')),{value:null,label:'VV unknown'});
  assert.equal(verticalVisibility(parseCloudGroups('VV000')).value,0);
  for(const code of ['OVC002','SCT///','','SKC'])assert.equal(verticalVisibility(parseCloudGroups(code)),null);
  assert.equal(cloudFooter(parseCloudGroups('VV///'),{station:'EGBB',timestamp:'131020Z',dataState:'fresh'}).health,'ready');
});
