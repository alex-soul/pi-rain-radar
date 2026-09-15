import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setPin,createSettingsAuth} from '../src/settings-auth.js';
const cli=fileURLToPath(new URL('../src/setup-pin.js',import.meta.url));

test('host recovery command reports and disables protection without the forgotten PIN or data loss',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'radar-pin-cli-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const run=(...args)=>spawnSync(process.execPath,[cli,...args],{env:{...process.env,DATA_DIR:dir},encoding:'utf8',timeout:5000});
 assert.match(run('--status').stdout,/disabled/);
 await setPin(dir,'123456');
 const auth=createSettingsAuth(dir),login=await auth.unlock('123456');
 await writeFile(join(dir,'retained-data.txt'),'other settings and cache');
 assert.match(run('--status').stdout,/enabled/);
 const disabled=run('--disable');assert.equal(disabled.status,0);assert.match(disabled.stdout,/disabled/);
 assert.equal(await createSettingsAuth(dir).configured(),false);
 assert.equal(await readFile(join(dir,'retained-data.txt'),'utf8'),'other settings and cache');
 assert.deepEqual(JSON.parse(await readFile(join(dir,'settings/pin.json'),'utf8')),{disabled:true});
 await setPin(dir,'654321');assert.equal(await auth.authorized(login.token),false);
 assert.equal((await auth.unlock('654321')).status,200);
 const help=run('--help');assert.equal(help.status,0);
 for(const flag of ['--set','--reset','--enable','--disable','--status'])assert.ok(help.stdout.includes(flag));
 for(const flag of ['--set','--reset','--enable']) {const result=run(flag);assert.equal(result.status,1);assert.match(result.stderr,/Run interactively/);}
 const invalid=run('--set','123456');assert.equal(invalid.status,1);assert.equal(invalid.stderr.includes('123456'),false);
 // A malformed credential file can still be recovered through the host command.
 await writeFile(join(dir,'settings/pin.json'),'{broken');
 assert.equal(run('--status').status,1);assert.equal(run('--disable').status,0);
 assert.equal(await createSettingsAuth(dir).authorized(),true);
});
