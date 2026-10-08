import assert from 'node:assert/strict';
import {createScreenControl} from '../../src/screen-control.js';
const client=createScreenControl();
assert.equal((await client.status()).brightness,75);
assert.equal((await client.execute({action:'brightness',value:43})).brightness,43);
assert.equal((await client.execute({action:'automatic_blanking',value:true})).automatic_blanking,true);
assert.equal((await client.execute({action:'idle_timeout',value:26})).idle_timeout,26);
assert.equal((await client.status()).idle_timeout,26);
assert.equal((await client.execute({action:'sleep',value:true})).status,400);
