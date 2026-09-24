import {playbackSpeeds,lastFrameMultipliers} from '../public/weather-format.js';
import {createWeatherReplay} from '../public/history-weather-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const app = (await readFile(new URL('../public/app.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
// Exercise the real history handlers with a fake clock and tiny DOM adapter.
// No browser or provider is involved, and the production timeout stays ten minutes.
async function harness() {
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) nodes.set(id, {value: '2000000', handlers: {}, addEventListener(event, fn) {this.handlers[event] = fn;}, attributes: {}, setAttribute(name, value) {this.attributes[name] = value;}, showModal() {this.open=true;}, close() {this.open=false;}, toggleAttribute(name,value) {this.attributes[name]=value;}, replaceChildren() {}});
    return nodes.get(id);
  };
  let now = 0, polls = 0, adopted, hours = 2;
  const requests=[];
  const events = {};
  const context = vm.createContext({setupArchiveCalendar:()=>({sync(){},close(){}}),comparisonLead:0,weatherReplay:null,createWeatherReplay,resetHistoricalForecast(){},paintStatus(){},timeZone:'Europe/London',recordConnection(){},$, Date: class extends Date { static now() { return now; } }, setTimeout: () => 1, clearTimeout() {},
    document: {addEventListener: (event, fn) => events[event] = fn}, window: {addEventListener: (event, fn) => events[event] = fn},
    playbackHours:()=>hours,playbackSpeeds,lastFrameMultipliers,playbackSpeed:()=>1,lastFrameMultiplier:()=>2.4,archiveSpeed:null,archiveHold:null,schedulePlayback(){},
    fetch: async url => {requests.push(url);return {ok:true, json: async () => ({start:2000000-Number(new URL(url,'http://test').searchParams.get('hours')??hours)*3600,end:2000000,complete:true,times:[2000000],frames:[{time:2000000}]})};},
    ResizeObserver: class { observe() {} }, mapIdentity: "test-map", AbortSignal, encodeURIComponent, format: () => '', clock: () => '10:30', Option: class {},
    performance, serverClock:null, archiveHours:null, archiveRevision:null, providerOverlay:false, status:null, sequence:[], sequenceEnd:null, paintProviderLabels(){}, showFrame(){}, attachWindow(frames,result,hours){frames.windowHours=hours;frames.windowEnd=result.end;return frames;}, frameLoader:{cancel(){}}, liveRequestKey:'', decodeFrames: async frames => frames, adopt: frames => adopted = frames, poll: async () => {polls++;}
  });
  vm.runInContext(`let historyWindow = null, historyLoading = false, returningLive = false, generation = 0, historyTimer, pending = [1], playing = false;\n${app.slice(app.indexOf('function historyLabel('))}\nglobalThis.inspect = () => ({historyWindow, historyLoading, returningLive, pending, playing}); globalThis.pause = () => playing=false; globalThis.goNow = returnToNow;`, context);
  return {context, $, events, requests, setHours:value=>hours=value, setNow: value => now=value, polls: () => polls, adopted: () => adopted};
}

test('Archive defaults to Settings and refresh preserves its override, pause and return deadline',async()=>{
  const h=await harness();h.setHours(6);
  await h.$('archive-show').handlers.click();
  assert.match(h.requests.at(-1),/hours=6$/);assert.equal(h.adopted().windowHours,6);
  assert.equal(h.context.inspect().historyWindow.start,2000000-21600);
  h.context.pause();h.setNow(100000);h.setHours(4);
  await h.context.loadHistory(2000000,true);
  assert.match(h.requests.at(-1),/end=2000000&hours=6$/);
  assert.equal(h.context.inspect().historyWindow.start,2000000-21600);
  assert.equal(h.context.inspect().historyWindow.deadline,600000);
  assert.equal(h.context.inspect().playing,false);
});
test('historical window expires after ten minutes, including a resume after suspended timers', async () => {
  const h = await harness();
  await h.$('archive-show').handlers.click();
  assert.equal(h.context.inspect().historyWindow.deadline, 600000);
  assert.equal(h.context.inspect().pending, null);
  assert.equal(h.$('history-toggle').attributes['data-expanded'], 'true');
  assert.ok(h.$('history-selection').textContent.endsWith('10:30'));
  assert.equal(h.$('history-countdown').attributes.hidden, false);
  assert.equal('frames' in h.context.inspect().historyWindow, false);
  h.setNow(599999); h.events.visibilitychange(); assert.equal(h.polls(), 0);
  h.setNow(600001); h.events.pageshow(); assert.equal(h.polls(), 1);
  assert.equal(h.context.inspect().historyWindow, null);
  assert.equal(h.context.inspect().returningLive, true);
});
test('Now invalidates a historical image load still in flight', async () => {
  const h = await harness();
  let finish;
  h.context.decodeFrames = () => new Promise(resolve => finish=resolve);
  const loading = h.$('archive-show').handlers.click();
  await new Promise(resolve => setImmediate(resolve));
  await h.context.goNow();
  finish([{time:2000000}]); await loading;
  assert.equal(h.adopted(), undefined);
  assert.equal(h.context.inspect().historyWindow, null);
});
test('live status polling does not decode or replace images during historical playback', async () => {
  let decoded = 0, adopted = 0;
  const context = vm.createContext({setupArchiveCalendar:()=>({sync(){},close(){}}),comparisonLead:0,weatherReplay:null,createWeatherReplay,resetHistoricalForecast(){},paintStatus(){},timeZone:'Europe/London',recordConnection(){},playbackHours:()=>6,mapIdentity:"test-map", AbortSignal, fetch: async () => ({ok:true,json:async()=>({frames:[{time:3000000,url:'/new',overviewUrl:'/new-overview'}]})}), decodeFrames: async () => {decoded++;}, adopt: () => adopted++, paintStatus() {}, paintHistory() {}, paintMapUpdate() {}, ageLiveWindow(){}, performance, serverClock:null, archiveRevision:undefined, $:()=>({dataset:{}}), mapUpdateVisible:false});
  const pollCode = app.slice(app.indexOf('let pollRunning = false;'), app.indexOf('try {\n  const response = await fetch(`/maps/'));
  vm.runInContext(`let generation=1, historyWindow={end:2000000}, historyLoading=false, sequence=[{time:2000000,url:'/old',overviewUrl:'/old-overview'}], pending=null, status=null, serverReachable=false, displayed=sequence[0], returningLive=false;\n${pollCode}\nglobalThis.runPoll=poll; globalThis.readStatus=()=>status;`,context);
  await context.runPoll();
  assert.equal(context.readStatus().frames[0].time,3000000);
  assert.equal(decoded,0);
  assert.equal(adopted,0);
});

test('history range labels omit ordinals and include both dates across midnight', () => {
  const format = (time, options) => new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London', ...options}).format(new Date(time * 1000));
  const context = vm.createContext({setupArchiveCalendar:()=>({sync(){},close(){}}),comparisonLead:0,weatherReplay:null,createWeatherReplay,resetHistoricalForecast(){},paintStatus(){},timeZone:'Europe/London',recordConnection(){},format, clock: time => format(time,{hour:'2-digit',minute:'2-digit'})});
  vm.runInContext(app.slice(app.indexOf('function historyLabel('), app.indexOf('function paintHistory()')), context);
  const stamp = text => Date.parse(text) / 1000;
  assert.equal(context.historyLabel(stamp('2026-08-12T08:50:00Z'),stamp('2026-08-12T10:50:00Z')), '12 Aug 09:50 - 11:50');
  assert.equal(context.historyLabel(stamp('2026-08-11T21:30:00Z'),stamp('2026-08-11T23:30:00Z')), '11 Aug 22:30 - 12 Aug 00:30');
  assert.equal(context.historyLabel(stamp('2026-08-21T08:50:00Z'),stamp('2026-08-21T10:50:00Z')), '21 Aug 09:50 - 11:50');
});

test('countdown ring follows the deadline and restarts for a new selection', async () => {
  const h = await harness();
  await h.$('archive-show').handlers.click();
  assert.equal(h.$('history-progress').attributes['stroke-dashoffset'], '100');
  h.setNow(300000); h.context.paintHistoryRing();
  assert.equal(h.$('history-progress').attributes['stroke-dashoffset'], '50');
  h.setNow(600001); h.context.paintHistoryRing();
  assert.equal(h.$('history-progress').attributes['stroke-dashoffset'], '0');
  await h.$('archive-show').handlers.click();
  assert.equal(h.$('history-progress').attributes['stroke-dashoffset'], '100');
});


test('History icon returns to live while the date range reopens the picker without resetting its deadline', async () => {
  const h = await harness();
  await h.$('history-action').handlers.click();
  assert.equal(h.$('archive-dialog').open, true);
  await h.$('archive-show').handlers.click();
  const deadline = h.context.inspect().historyWindow.deadline;
  h.setNow(300000);
  await h.$('history-range').handlers.click();
  assert.equal(h.$('archive-dialog').open, true);
  assert.equal(h.context.inspect().historyWindow.deadline, deadline);
  h.$('archive-close').handlers.click();
  assert.equal(h.context.inspect().historyWindow.deadline, deadline);
  await h.$('history-action').handlers.click();
  assert.equal(h.context.inspect().historyWindow, null);
  assert.equal(h.polls(), 1);
});

test('Archive override and provider switch reset on return, without changing saved Live preferences',async()=>{
  const h=await harness();h.setHours(4);
  await h.$('history-action').handlers.click();
  assert.equal(h.$('archive-hours').value,'4');assert.equal(h.$('archive-provider').checked,false);
  h.$('archive-hours').value='24';h.$('archive-hours').handlers.input();
  h.$('archive-provider').checked=true;h.$('archive-provider').handlers.change();
  await h.$('archive-show').handlers.click();
  assert.match(h.requests.at(-1),/hours=24$/);
  await h.context.goNow();
  await h.$('history-action').handlers.click(); // returning-Live action remains until poll adopts; open directly below.
  await h.context.openHistoryPicker();
  assert.equal(h.$('archive-hours').value,'4');assert.equal(h.$('archive-provider').checked,false);
});

test('forecast comparison persists within a visit and resets on return to Live',async()=>{
 const h=await harness();await h.$('archive-show').handlers.click();
 h.$('archive-comparison').value='50';h.$('archive-comparison').handlers.input();
 assert.equal(h.context.comparisonLead,50);await h.context.loadHistory(2000000,true);assert.equal(h.context.comparisonLead,50);
 await h.context.goNow();assert.equal(h.context.comparisonLead,0);assert.equal(h.context.weatherReplay,null);
});


test('comparison slider updates immediately and dismissal preserves paused playback',async()=>{
 const h=await harness();await h.$('archive-show').handlers.click();assert.equal(h.context.inspect().playing,true);h.context.pause();
 const adopted=h.adopted(),deadline=h.context.inspect().historyWindow.deadline,count=h.requests.length;
 h.$('archive-comparison').value='40';h.$('archive-comparison').handlers.input();
 assert.equal(h.context.comparisonLead,40);assert.equal(h.$('archive-comparison-value').textContent,'−40 min');
 h.$('archive-close').handlers.click();assert.equal(h.adopted(),adopted);
 assert.equal(h.context.inspect().playing,false);assert.equal(h.context.inspect().historyWindow.deadline,deadline);
 assert.equal(h.requests.length,count);
 h.$('archive-comparison').value='0';h.$('archive-comparison').handlers.input();assert.equal(h.$('archive-comparison-value').textContent,'None');
 await h.$('archive-show').handlers.click();assert.equal(h.context.inspect().playing,true);
});


test('Close retains pending date/window edits without loading or unpausing; Replay uses the window',async()=>{
 const h=await harness();await h.$('archive-show').handlers.click();assert.equal(h.context.inspect().playing,true);h.context.pause();
 const requests=h.requests.length,window=h.context.inspect().historyWindow;
 h.$('archive-day').value='2026-09-23';h.$('archive-time').value='2000000';h.$('archive-hours').value='6';h.$('archive-hours').handlers.input();
 h.$('archive-close').handlers.click();h.$('archive-dialog').handlers.close();
 assert.equal(h.requests.length,requests);assert.equal(h.context.inspect().playing,false);assert.equal(h.context.inspect().historyWindow,window);
 assert.equal(vm.runInContext('pendingArchiveSelection.hours',h.context),'6');assert.equal(vm.runInContext('pendingArchiveSelection.day',h.context),'2026-09-23');
 await h.$('archive-show').handlers.click();assert.match(h.requests.at(-1),/hours=6$/);assert.equal(h.context.inspect().playing,true);
});

 test('Archive speed and hold survive close and replay, then reset on Live',async()=>{
 const h=await harness();
 await h.$('history-action').handlers.click();
 h.$('archive-speed').value=String(playbackSpeeds.indexOf(0.75));h.$('archive-speed').handlers.input();
 h.$('archive-hold').value=String(lastFrameMultipliers.indexOf(1.4));h.$('archive-hold').handlers.input();
 await h.$('archive-show').handlers.click();assert.equal(h.$('archive-dialog').open,true);assert.equal(h.context.inspect().playing,true);h.context.pause();
 h.$('archive-close').handlers.click();
 await h.$('history-range').handlers.click();
 assert.equal(h.$('archive-speed').value,String(playbackSpeeds.indexOf(0.75)));assert.equal(h.$('archive-hold').value,String(lastFrameMultipliers.indexOf(1.4)));
 assert.equal(h.context.inspect().playing,false);
 await h.$('archive-show').handlers.click();
 assert.equal(h.context.archiveSpeed,0.75);assert.equal(h.context.archiveHold,1.4);
 await h.context.goNow();
 assert.equal(h.context.archiveSpeed,null);assert.equal(h.context.archiveHold,null);
 });
