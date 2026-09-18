import test from 'node:test';
import assert from 'node:assert/strict';
import {setupSettingsIdle} from '../public/settings-idle.js';
function fixture(protectedSession = true) {
  let time=1000000, open=true, renewals=0, expiry=time+300000;
  const jobs=new Map(); let id=0;
  const idle=setupSettingsIdle({active:()=>open,protectedSession:()=>protectedSession,
    close:()=>{open=false;},now:()=>time,schedule:(fn,ms)=>{jobs.set(++id,{fn,at:time+ms});return id;},cancel:id=>jobs.delete(id),
    renew:async()=>{renewals++;expiry=time+300000;return expiry;}});
  async function advance(ms) {
    const end=time+ms;
    while(true) {const next=[...jobs].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      time=next[1].at;jobs.delete(next[0]);next[1].fn();await Promise.resolve();}
    time=end;await Promise.resolve();
  }
  idle.start(expiry);
  return {idle,advance,open:()=>open,renewals:()=>renewals};
}
for(const pin of [true,false]) test(`activity at 4:59 restarts five-minute inactivity; PIN=${pin}`,async()=>{
  const f=fixture(pin);await f.advance(299000);f.idle.activity();await Promise.resolve();
  await f.advance(299999);assert.equal(f.open(),true);await f.advance(1);assert.equal(f.open(),false);
  assert.equal(f.renewals(),pin?1:0);
});
test('idle performs no renewal and expires at five minutes',async()=>{
  const f=fixture();await f.advance(300000);assert.equal(f.open(),false);assert.equal(f.renewals(),0);
  f.idle.activity();assert.equal(f.renewals(),0);
});
test('rapid activity is bounded and clearing cancels pending work',async()=>{
  const f=fixture();for(let i=0;i<100;i++)f.idle.activity();assert.equal(f.renewals(),0);
  await f.advance(30000);assert.equal(f.renewals(),1);f.idle.activity();f.idle.clear();
  await f.advance(600000);assert.equal(f.renewals(),1);
});

test('failed renewal closes settings and does not silently extend authorization',async()=>{
  let closed=0;
  // A separate clock lets activity occur beyond the throttle interval.
  let time=1000,task;
  const session=setupSettingsIdle({active:()=>true,protectedSession:()=>true,now:()=>time,
    schedule:(fn,ms)=>{if(ms===30000)task=fn;return fn;},cancel(){},renew:async()=>{throw new Error('Offline');},close:()=>closed++});
  session.start(301000);session.activity();time+=30000;await task();assert.equal(closed,1);session.clear();
});
