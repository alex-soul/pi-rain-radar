import {spawn,execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createDevicePower} from '../../src/device-power.js';
const gid=Number(execFileSync('getent',['group','radar-power'],{encoding:'utf8'}).split(':')[2]);
const start=()=>spawn('python3',['/usr/local/lib/pi-rain-radar-power/helper.py'],{gid,stdio:'inherit'});
const client=createDevicePower({socketPath:'/run/pi-rain-radar-power/control.sock',tokenFile:'/etc/pi-rain-radar-power/token'});
let helper=start();
const waitReady=async()=>{for(let i=0;i<100;i++){const state=await client.status();if(state.state==='ready'||state.state==='pending')return state;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Helper did not start');};
try{
 assert.equal((await waitReady()).state,'ready');
 const input={action:'restart',requestId:randomUUID()};
 assert.equal((await client.execute(input)).status,202);
 assert.equal((await client.execute(input)).status,409);
 assert.equal((await client.status()).state,'pending');
 helper.kill();await new Promise(resolve=>helper.once('exit',resolve));helper=start();
 assert.equal((await waitReady()).state,'pending');
 assert.equal((await client.execute({action:'shutdown',requestId:randomUUID()})).status,503);
 const calls=await readFile('/tmp/power-test-calls','utf8');
 assert.equal(calls.split('\n').filter(line=>line==='--no-block reboot').length,1);
 assert.equal(calls.includes('--no-block poweroff'),false);
 // Match the app's non-root user plus the optional socket/token group.
 const code=`import {createDevicePower} from './src/device-power.js'; const c=createDevicePower({socketPath:'/run/pi-rain-radar-power/control.sock',tokenFile:'/etc/pi-rain-radar-power/token'}); if((await c.status()).state!=='pending')process.exit(1);`;
 execFileSync('node',['--input-type=module','-e',code],{uid:1000,gid});
 console.log('Real Unix socket verified with non-root app identity; exactly one mocked restart.');
}finally{helper.kill();}
