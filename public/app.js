import {playbackFrameDelay} from './weather-format.js';
import {updateAvailability} from './availability.js';
import {cloudNodes,cloudUrls,updateCloudSettings} from './layer-controls.js';
import {acceptIntegrationStatus} from './integrations-state.js';
import {updateCamera} from './camera-widget.js';
import {visibleRadarSources,weatherCreditVisible} from './attribution.js';
import {cameraSummary} from './camera-settings-ui.js';
import {setupArchiveCalendar,monthRanges} from './archive-calendar.js';
import {createWeatherReplay} from './history-weather-model.js';
import {paintHistoricalForecast,resetHistoricalForecast} from './history-weather-ui.js';
import {storageSummary} from './storage-ui.js';
import { recordConnection } from './connection-events.js';
import { radarSourceHealth, cloudHandleHealth, worstHealth } from './health.js';
import { updateStats } from "./stats.js";
import { liveDueThrough, ageLiveCoverage } from './live-window.js';
import { formatTime } from './time.js';
import { paintWeather, weatherDescription, weatherCredits } from './weather.js';
import { playbackSpeed, lastFrameMultiplier, playbackHours, weatherPreferences } from './display.js';
import { mapObservation, playbackState, frameProvider, windowProviders } from './playback.js';
import { createFrameLoader } from './frame-loader.js';
import { dockOutline } from './weather-format.js';
const $ = (id) => document.getElementById(id);
const timeZone = document.querySelector('meta[name="time-zone"]').content;
const assetIdentity = document.querySelector('meta[name="map-assets"]').content;
const mapIdentity = document.querySelector('meta[name="map-id"]').content;
const appVersion = document.querySelector('meta[name="app-version"]').content;
function paintThemeToggle() {
  const dark = document.documentElement.dataset.theme === "dark";
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#142623' : '#edf4ee');
  $("theme-toggle").textContent = dark ? "☀" : "☾";
  $("theme-toggle").setAttribute(
    "aria-label",
    dark ? "Switch to light theme" : "Switch to dark theme",
  );
}
$("theme-toggle").addEventListener("click", () => {
  const theme =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("radar-theme", theme);
  } catch {
    /* The switch still works if storage is unavailable. */
  }
  paintThemeToggle();
});
paintThemeToggle();
const weatherDock = $("weather-dock");
function paintWeatherOutline() {
  const {width, height} = weatherDock.getBoundingClientRect();
  weatherDock.querySelector('.weather-shape').setAttribute('viewBox', `0 0 ${width} ${height}`);
  $('weather-outline').setAttribute('d', dockOutline(width, height));
}
new ResizeObserver(paintWeatherOutline).observe(weatherDock);
function setWeatherExpanded(expanded) {
  weatherDock.setAttribute("aria-expanded", String(expanded));
  weatherDock.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} weather readings${expanded ? `: ${weatherDescription()}` : ""}`);
  $("weather-handle").setAttribute("aria-expanded",String(expanded));
  $("weather-handle").setAttribute("aria-label",weatherDock.getAttribute("aria-label"));
  weatherDock.setAttribute("aria-label",`Weather readings: ${weatherDescription()}`);
  $("weather-details").setAttribute("aria-hidden", String(!expanded));
  $("weather-details").inert=!expanded;
  window.dispatchEvent(new Event("weather-explanation-close"));
}
window.addEventListener('radar-weather-expanded', event => setWeatherExpanded(event.detail));
try { setWeatherExpanded(localStorage.getItem("radar-weather-expanded") !== "false"); }
catch { setWeatherExpanded(true); }
$("weather-handle").addEventListener("click", () => {
  const expanded = weatherDock.getAttribute("aria-expanded") !== "true";
  setWeatherExpanded(expanded);
  try { localStorage.setItem("radar-weather-expanded", String(expanded)); } catch { /* Optional preference. */ }
});
// Explanations share the renderer's selected-time source/value/timestamp text.
const explanation=document.createElement('div');
explanation.id='weather-explanation';explanation.className='weather-explanation';
explanation.setAttribute('role','tooltip');explanation.hidden=true;document.body.append(explanation);
let explained=null,pinned=false;
function closeExplanation(){
  explained?.removeAttribute('aria-describedby');explained=null;pinned=false;explanation.hidden=true;
}
function positionExplanation(){
  if(!explained)return;
  const rect=explained.getBoundingClientRect(),box=explanation.getBoundingClientRect();
  explanation.style.left=Math.max(8,Math.min(innerWidth-box.width-8,rect.left+rect.width/2-box.width/2))+'px';
  explanation.style.top=Math.max(8,Math.min(innerHeight-box.height-8,rect.bottom+10))+'px';
}
function showExplanation(reading){
  if(document.body.classList.contains('screen-locked')||weatherDock.getAttribute('aria-expanded')!=='true')return;
  if(explained!==reading){closeExplanation();explained=reading;}
  explanation.replaceChildren(...reading.getAttribute('aria-label').split(' · ').map((text,index)=>{
    const line=document.createElement(index===0?'strong':'div');line.textContent=text;return line;
  }));
  reading.removeAttribute('title');reading.setAttribute('aria-describedby',explanation.id);
  explanation.hidden=false;positionExplanation();
}
for(const reading of weatherDock.querySelectorAll('.weather-reading')){
  reading.tabIndex=0;reading.setAttribute('role','button');
  reading.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'&&!pinned)showExplanation(reading);});
  reading.addEventListener('pointerleave',()=>{if(!pinned&&document.activeElement!==reading)closeExplanation();});
  reading.addEventListener('focus',()=>showExplanation(reading));
  reading.addEventListener('blur',()=>{if(explained===reading)closeExplanation();});
  reading.addEventListener('click',()=>{if(explained===reading&&pinned)closeExplanation();else{showExplanation(reading);pinned=true;}});
  reading.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();reading.click();}});
  new MutationObserver(()=>{reading.removeAttribute('title');if(explained===reading)showExplanation(reading);}).observe(reading,{attributes:true,attributeFilter:['aria-label']});
}
document.addEventListener('pointerdown',event=>{if(explained&&!explained.contains(event.target)&&!explanation.contains(event.target))closeExplanation();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeExplanation();});
window.addEventListener('weather-explanation-close',closeExplanation);
window.addEventListener('resize',positionExplanation);
new MutationObserver(()=>{if(document.body.classList.contains('screen-locked'))closeExplanation();}).observe(document.body,{attributes:true,attributeFilter:['class']});
let statsReceivedAt = null;
let weatherReplay=null,comparisonLead=0;
let historyWindow = null, historyLoading = false, returningLive = false, generation = 0;
let historyTimer;
let displayed = null,
  status = null,
  serverReachable = true;
let sequence = [],
  pending = null,
  index = 0,
  playing = true;
let sequenceHours = 2, sequenceEnd = null, liveRequestKey = '';
let archiveHours = null, providerOverlay = false, renderRevision = 0;
let serverClock = null, archiveRevision = null;
const frameLoader = createFrameLoader({timeoutMs:4000});
let renderPending=false;
const format = (time, options) => formatTime(time, options, timeZone);
const clock = (time) => format(time, { hour: "2-digit", minute: "2-digit" });
function paintCurrentTime() {
  const now = new Date();
  $("current-time").textContent = format(now.getTime() / 1000, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("current-time").dateTime = now.toISOString();
  paintHistoryRing();
}
function setClockExpanded(expanded) {
  $("clock-toggle").setAttribute("aria-expanded", String(expanded));
  $("clock-toggle").setAttribute("aria-label", `${expanded ? "Hide" : "Show"} current ${timeZone} time`);
  $("current-time").setAttribute("aria-hidden", String(!expanded));
}
try {
  setClockExpanded(localStorage.getItem("radar-clock") !== "false");
} catch {
  /* The clock remains usable without storage. */
}
$("clock-toggle").addEventListener("click", () => {
  const expanded = $("clock-toggle").getAttribute("aria-expanded") !== "true";
  setClockExpanded(expanded);
  try { localStorage.setItem("radar-clock", String(expanded)); } catch { /* Optional preference. */ }
});
paintCurrentTime();
setInterval(paintCurrentTime, 1000);
document.addEventListener("visibilitychange", paintCurrentTime);
// Fixed ten-minute slots; frame arrays still contain only available images.
function timelineWindow(frames, end = frames.at(-1)?.time ?? Math.floor(Date.now()/600000)*600, hours = 2) {
  const steps = hours * 6, start = end - hours * 3600;
  function track(key) {
    const occupied = new Set(frames.filter(f => f[key]).map(f => Math.round((f.time-start)/600)));
    const role=key==='url'?'main':'overview';
    const missing = frames.coverage ? frames.coverage.filter(c=>!c[role]&&!c.pending&&c.sources?.[role]!=='disabled').map(c=>(c.time-start)/600) : Array.from({length:steps+1},(_,i)=>i).filter(i=>!occupied.has(i));
    const stops = ['transparent 0%'];
    for (const slot of missing) {
      const left=Math.max(0,slot/(steps+1)*100),right=Math.min(100,(slot+1)/(steps+1)*100);
      stops.push(`transparent ${left}%`, `var(--timeline-gap) ${left}%`, `var(--timeline-gap) ${right}%`, `transparent ${right}%`);
    }
    stops.push('transparent 100%');
    return {missing,gradient:`linear-gradient(to right, ${stops.join(', ')})`};
  }
  const main=track('url'),overview=track('overviewUrl');
  return {start,end,steps,main,overview,missing:[...new Set([...main.missing,...overview.missing])].sort((a,b)=>a-b),gradient:main.gradient};
}
function nearestTimelineFrame(frames, start, slot) {
  const time = start + slot * 600;
  return frames.reduce((nearest, frame, i) => Math.abs(frame.time - time) < Math.abs(frames[nearest].time - time) ? i : nearest, 0);
}
let timelineFrames, timelineEnd, timelineHours, timelineModel;
function paintTimeline() {
  const end = historyWindow?.end ?? sequenceEnd ?? sequence.at(-1)?.time ?? Math.floor(Date.now()/600000)*600;
  const hours = sequenceHours;
  if (timelineFrames !== sequence || timelineEnd !== end || timelineHours !== hours) {
    timelineFrames = sequence; timelineEnd = end; timelineHours = hours;
    timelineModel = timelineWindow(sequence, end, hours);
    $('timeline').style.setProperty('--timeline-main-gaps', 'linear-gradient(transparent,transparent)');
    $('timeline').style.setProperty('--timeline-overview-gaps', 'linear-gradient(transparent,transparent)');
  }
  const slot = Math.max(0, Math.min(timelineModel.steps, ((displayed?.time ?? timelineModel.start) - timelineModel.start) / 600));
  $('history-start').textContent = clock(timelineModel.start);
  $('history-end').textContent = clock(end);
  $('timeline').min = -.5;
  $('timeline').max = timelineModel.steps + .5;
  $('timeline').value = slot;
  $('timeline').style.setProperty('--timeline-progress', `${(slot + .5) / (timelineModel.steps + 1) * 100}%`);
  $('timeline').title = `${hours}-hour playback window`;
}
function paintRadarHandle(health, sources) {
  const handle = $('footer-toggle');
  handle.dataset.health = health[0];
  handle.setAttribute('aria-label', `Radar controls: ${health[1]}`);
  handle.title = health[1];
  for (const role of ['main', 'overview']) {
    const row = $('settings-'+role+'-status');
    if (row) {
      row.textContent = `${status?.sources?.[role]?.source === 'disabled' ? 'Radar' : status?.sources?.[role]?.source === 'rainbow' ? 'Rainbow' : 'RainViewer'} · ${sources[role][1]}`;
      row.dataset.health = sources[role][0];
    }
  }
}
function paintStatus() {
  const cameraCounts=updateCamera({status,selected:historyWindow,time:displayed?.time,hours:playbackHours()});
  paintAttribution();
  updateStats({status,cameraCounts, reachable:serverReachable, receivedAt:statsReceivedAt, selected:historyWindow, hours:playbackHours(), loading:historyLoading});
  if(historyWindow&&displayed&&weatherReplay){
    paintWeather(weatherReplay.weather(displayed.time),displayed.time*1000,{historical:true,operational:serverReachable?status?.weather:null});
    paintHistoricalForecast(weatherReplay,displayed.time,comparisonLead,timeZone);
  }else paintWeather(serverReachable ? status?.weather : null);

  const sources = Object.fromEntries(['main','overview'].map(role => [role, radarSourceHealth(status?.sources?.[role], serverReachable)]));
  const health = status?.cloudDemo?['unconfigured','Recorded cloud demo · collection stopped']:worstHealth([...Object.values(sources),cloudHandleHealth(status?.clouds,serverReachable)]);
  document.body.classList.toggle('stale', health[0] !== 'ready');
  document.body.classList.toggle('ready', health[0] === 'ready');
  paintRadarHandle(health, sources);
  $("time").textContent = displayed ? clock(displayed.time) : '—';
  $("date").textContent = displayed ? `${format(displayed.time, { weekday: "short" })}, ${format(displayed.time, { day: "numeric" })} ${format(displayed.time, { month: "short" }).slice(0, 3)}` : '';
  paintTimeline();
  $("timeline").disabled = sequence.length < 2;
  $("timeline").setAttribute(
    "aria-valuetext",
    `${displayed ? clock(displayed.time) : "No captures"}, frame ${displayed ? Math.max(0,sequence.indexOf(displayed))+1 : 0} of ${sequence.length}`,
  );
  const radarDisabled=!historyWindow&&status?.radarDisabled;
  const state = radarDisabled?'paused':playbackState(playing, sequence.length, !!historyWindow);
  $("play").disabled = radarDisabled || !!historyWindow && sequence.length < 2;
  $("play").dataset.state = state;
  $("play").dataset.paused = String(state !== "playing");
  $("play").setAttribute(
    "aria-label",
    state === "waiting" ? "Automatically paused; waiting for captures. Click to pause manually" : state === "playing" ? "Pause playback" : "Play playback",
  );
  if(radarDisabled){$('play').setAttribute('aria-label','Radar playback disabled');$('timeline').title='Radar playback disabled';$('time').textContent='Radar disabled';$('date').textContent='';}
  $("frame-position").textContent = String(displayed ? index + 1 : 0);
  $("frame-total").textContent = String(sequence.length);
  const expected = sequenceHours * 6 + 1;
  $("frame-total").classList.remove("incomplete");
  updateAvailability({frames:sequence,data:historyWindow??status,status,archive:!!historyWindow,start:timelineModel.start,end:timelineModel.end,time:displayed?.time,zone:timeZone},time=>{playing=false;if(!sequence.length)return;index=nearestTimelineFrame(sequence,time,0);showFrame();});
  $("frame-count").setAttribute("aria-label", `Frame ${displayed ? Math.max(0,sequence.indexOf(displayed))+1 : 0} of ${sequence.length}. Expected ${expected} frames in a complete ${sequenceHours}-hour window.`);
}
function paintProviderLabels(frame) {
  for (const [i,id] of ['main-provider','overview-provider'].entries()) {
    const label=$(id),source=frameProvider(frame,i===0?'main':'overview');
    label.hidden=!(historyWindow && providerOverlay && source);
    label.textContent=source === 'rainbow' ? 'Rainbow' : source === 'rainviewer' ? 'RainViewer' : '';
  }
}
function paintAttribution(){
  const sources=visibleRadarSources({frame:displayed,observations:['main','overview'].map(role=>mapObservation(sequence,Math.max(0,sequence.indexOf(displayed)),role,!!historyWindow)),overviewVisible:!$('overview').hidden,currentSources:status?.sources,archive:!!historyWindow});
  $('cloud-credit').hidden=!cloudNodes.some((node,i)=>(!i||!$('overview').hidden)&&node.getAttribute('href')&&node.style.visibility==='visible');
  const dockExpanded=$('weather-dock').getAttribute('aria-expanded')==='true',credits=weatherCredits(weatherPreferences().readings);
  $('weather-credit').hidden=!(dockExpanded&&credits.openweather||!$('rain-forecast').hidden);
  $('ha-credit').textContent=dockExpanded&&credits.other?' · '+credits.other:'';
  const credit=$('radar-credit'),key=[...sources].sort().join(',');
  if(credit.dataset.sources!==key){
    const providers=[['rainviewer','RainViewer','https://www.rainviewer.com/'],['rainbow','Rainbow','https://rainbow.ai/']].filter(([source])=>sources.has(source)).map(([,name,url])=>[name,url]);
    const nodes=[];
    for(const [name,url]of providers){
      if(nodes.length)nodes.push(document.createTextNode(' & '));
      const link=document.createElement('a');link.textContent=name;link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('data-provider-credit','');nodes.push(link);
    }
    credit.replaceChildren(...nodes);credit.dataset.sources=key;
  }
}
for(const id of ['overview','rain-forecast','weather-dock'])new MutationObserver(paintAttribution).observe($(id),{attributes:true,attributeFilter:['hidden','aria-expanded']});
function showFrame() {
  const next=sequence[index]??null,epoch=++renderRevision;
  const observations=['main','overview'].map(role=>mapObservation(sequence,index,role,!!historyWindow));
  const rain=observations.map((o,i)=>status?.cloudDemo?(i===0?next?.url:null):o?.url??null);
  const urls=[...rain,...cloudUrls(next,status?.cloudDemo,!!historyWindow)],nodes=[$('radar'),$('overview-radar'),...cloudNodes];
  renderPending=true;
  void Promise.all(urls.map(url=>url?frameLoader.prepare(url):null)).then(images=>{
    if(epoch!==renderRevision)return;renderPending=false;
    // Commit every visible layer and its timestamp together after decoding.
    nodes.forEach((node,i)=>{if(images[i]&&urls[i]){node.setAttribute('href',urls[i]);node.style.visibility='visible';node.dataset.loading='ready';}else{node.removeAttribute('href');node.style.visibility='hidden';node.dataset.loading=urls[i]?'failed':'ready';}});
    displayed=next;paintProviderLabels(displayed);$('empty').hidden=!mapUpdateVisible;paintStatus();
  });
  for(const offset of [-1,1,2]){
    const ahead=sequence[(index+offset+sequence.length)%sequence.length];
    if(ahead)for(const url of [ahead.url,ahead.overviewUrl,...cloudUrls(ahead,status?.cloudDemo,!!historyWindow)])if(url)void frameLoader.prepare(url,false);
  }
}
window.addEventListener('radar-layers-change',showFrame);
function adopt(next, preservePosition = false) {
  const previousTime = displayed?.time;
  next.providers=windowProviders(next);
  sequence = next;
  sequenceHours = next.windowHours ?? 2;
  sequenceEnd = next.windowEnd ?? next.at(-1)?.time;
  index = preservePosition && previousTime ? nearestTimelineFrame(next, previousTime, 0) : 0;
  showFrame();
}
let playbackTimer;
function schedulePlayback() {
  clearTimeout(playbackTimer);
  playbackTimer = setTimeout(tick, playbackFrameDelay(index === sequence.length - 1,playbackSpeed(),lastFrameMultiplier()));
}
window.addEventListener('radar-playback-speed', schedulePlayback);
function tick() {
  if (playing && !renderPending && sequence.length >= 2) {
    if (index === sequence.length - 1 && pending) {
      adopt(pending);
      pending = null;
    } else {
      index = (index + 1) % sequence.length;
      showFrame();
    }
  }
  schedulePlayback();
}
$("play").addEventListener("click", () => {
  playing = !playing;
  if (pending) {
    adopt(pending, true);
    pending = null;
  }
  paintStatus();
});
$("timeline").addEventListener("input", (event) => {
  playing = false;
  const value = Math.max(0,Math.min(timelineModel.steps,Math.round(Number(event.target.value))));
  if (!sequence.length) return;
  index = nearestTimelineFrame(sequence, timelineModel.start, value);
  showFrame();
});
// Keyboard navigation skips unavailable timestamps instead of getting stuck in a gap.
$('timeline').addEventListener('keydown', event => {
  if (!sequence.length || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  playing = false;
  index = event.key === 'Home' ? 0 : event.key === 'End' ? sequence.length - 1 : Math.max(0, Math.min(sequence.length - 1, index + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : -1)));
  showFrame();
});
async function decodeFrames(offered, epoch = generation) {
  renderRevision++;renderPending=false;
  return frameLoader.load(offered, [...sequence, ...(pending || [])], () => epoch === generation);
}
let mapUpdateVisible = false;
let dismissedMapError = null;
function paintMapUpdate(update) {
  const error = update?.error;
  mapUpdateVisible = !!update?.applying || !!(error && error !== dismissedMapError);
  $('map-update-dismiss').hidden = !mapUpdateVisible || !!update?.applying;
  if (!mapUpdateVisible) { $('empty').hidden = true; return; }
  $('empty').hidden = false;
  $('empty').querySelector('h2').textContent = update.applying
    ? (update.progress ? 'Preparing radar history' : 'Preparing map') : 'Map update unavailable';
  $('empty').querySelector('p').textContent = update.applying
    ? (update.progress ? `Caching complete frames · ${update.progress.completed} of ${update.progress.total}`
      : 'Your new view is being prepared. It will appear automatically when ready.') : error;
}
$('map-update-dismiss').addEventListener('click', () => {
  dismissedMapError = status.mapUpdate?.error;
  paintMapUpdate(status.mapUpdate);
});
window.addEventListener('map-update-started', () => {
  dismissedMapError = null;
  paintMapUpdate({applying:true});
  void poll();
});
window.addEventListener('radar-playback-window', () => {
  if (historyWindow || historyLoading) return; // Archive override lasts for this visit.
  generation++; frameLoader.cancel(); pending = null; liveRequestKey = '';
  void poll();
});
function attachWindow(frames, result, hours) {
  frames.windowHours=hours; frames.windowEnd=result.end; frames.complete=result.complete;frames.coverage=result.coverage;frames.borrowFrames=result.borrowFrames??[];
  frames.dueThrough=result.dueThrough;
  return frames;
}
function ageLiveWindow() {
  if(historyWindow || historyLoading || !serverClock||status?.radarDisabled||status?.cloudDemo)return;
  const now=serverClock.time+(performance.now()-serverClock.receivedAt);
  const dueThrough=liveDueThrough(now/1000);
  const end=Math.max(dueThrough,sequenceEnd??0),start=end-sequenceHours*3600;
  if(end===sequenceEnd&&sequence.dueThrough===dueThrough)return;
  const borrowFrames=[...(sequence.borrowFrames??[]),...sequence].filter(f=>f.time>=start-1800&&f.time<start);
  const next=attachWindow(sequence.filter(f=>f.time>=start&&f.time<=end),{end,dueThrough,...ageLiveCoverage(sequence.coverage,start,end,dueThrough),borrowFrames},sequenceHours);
  pending=null;adopt(next,true);
}
window.addEventListener('radar-sources-change',()=>{generation++;pending=null;liveRequestKey='';void poll();});
let pollRunning = false;
async function poll() {
  if (pollRunning) return;
  pollRunning = true;
  const epoch = generation;
  try {
    const response = await fetch(`/api/status?hours=${playbackHours()}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Status unavailable");
    status = await response.json();
    acceptIntegrationStatus(status);
    updateCloudSettings(status.cloudDemo?{enabled:true,configured:true,map:'main',state:'ready'}:status.clouds);
    statsReceivedAt = Date.now();
    if (status.appVersion && status.appVersion !== appVersion) {
      if (!$('settings-dialog').open) location.reload();
      return;
    }
    if (status.mapId && status.mapId !== mapIdentity) { location.reload(); return; }
    paintMapUpdate(status.mapUpdate);
    if (status.mapUpdate?.busy || status.mapUpdate?.error) {
      $('map-note').textContent=status.mapUpdate.busy?'Preparing map…':status.mapUpdate.error;
      $('map-apply').disabled=!!status.mapUpdate.busy;
    }
    if($('status-camera'))$('status-camera').textContent=cameraSummary(status.camera,timeZone);
    if($('status-storage'))$('status-storage').textContent=storageSummary(status.storage,timeZone);
    serverReachable = true;
    recordConnection(true);
    serverClock={time:status.serverTime??Date.now(),receivedAt:performance.now()};
    const offered=status.frames??[],hours=playbackHours();
    const requestKey=`${hours}:${status.end}:${status.dueThrough}:${offered.map(f=>`${f.time}:${f.url}:${f.overviewUrl}:${f.cloudUrl}:${f.overviewCloudUrl}`).join('|')}`;
    if(!historyWindow&&!historyLoading&&epoch===generation&&(returningLive||requestKey!==liveRequestKey)) {
      const next=await decodeFrames(offered,epoch);
      if(epoch!==generation||historyWindow||historyLoading||!next)return;
      attachWindow(next,{end:status.end??offered.at(-1)?.time,dueThrough:status.dueThrough,complete:status.complete,coverage:status.coverage,borrowFrames:status.borrowFrames},hours);
      liveRequestKey=requestKey;
      const previousTimes=new Set(sequence.map(f=>f.time));
      const additions=next.some(f=>!previousTimes.has(f.time));
      if(playing&&sequence.length>=2&&next.filter(f=>previousTimes.has(f.time)).length>=2&&sequenceHours===hours&&!returningLive&&additions) {
        pending=next;
        adopt(attachWindow(next.filter(f=>previousTimes.has(f.time)),{end:next.windowEnd,dueThrough:next.dueThrough,complete:next.complete,coverage:next.coverage,borrowFrames:next.borrowFrames},hours),true);
      } else { adopt(next,!returningLive);pending=null; }
      returningLive=false;paintHistory();
      $('playback-window-note').textContent='';
    }
  } catch {
    if (epoch !== generation) return;
    serverReachable = false;
    recordConnection(false);
    if (epoch === generation && !historyWindow && !historyLoading) $('playback-window-note').textContent = 'Could not load the selected window. Keeping available radar; retrying shortly.';
    if (mapUpdateVisible) {
      $('empty').querySelector('p').textContent = 'Connection interrupted. Checking map progress again automatically.';
    } else if (!displayed) {
      $("empty").querySelector("h2").textContent = "Waiting for the local app";
      $("empty").querySelector("p").textContent =
        "The connection will be retried automatically.";
    }
  } finally {
    pollRunning = false;
    ageLiveWindow();
    if(['radar','overview-radar'].some(id=>$(id).dataset.loading==='failed'))showFrame();
    paintStatus();
    if (epoch !== generation && !historyWindow && !historyLoading) void poll();
  }
}
try {
  const response = await fetch(`/maps/${assetIdentity}/places.json`);
  for (const place of await response.json()) {
    const [x, y] = place.position;
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x + 7);
    text.setAttribute("y", y + 4);
    text.textContent = place.name;
    const point = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    point.setAttribute("cx", x);
    point.setAttribute("cy", y);
    point.setAttribute("r", 2);
    $("places").append(point, text);
  }
} catch {
  /* Map and radar remain usable without place labels. */
}
void poll();
setInterval(() => void poll(), 15000);
schedulePlayback();
setInterval(() => { ageLiveWindow(); paintStatus(); }, 1000);

function historyLabel(start, end) {
  const date = time => {
    return `${format(time, { day: 'numeric' })} ${format(time, { month: 'short' }).slice(0, 3)}`;
  };
  const sameDay = format(start, { year: 'numeric', month: 'numeric', day: 'numeric' }) === format(end, { year: 'numeric', month: 'numeric', day: 'numeric' });
  return `${date(start)} ${clock(start)} - ${sameDay ? '' : `${date(end)} `}${clock(end)}`;
}
function paintHistoryRing() {
  if (!historyWindow && !returningLive) return;
  const elapsed = historyWindow ? Math.max(0, Math.min(1, 1 - (historyWindow.deadline - Date.now()) / 600000)) : 1;
  $('history-progress').setAttribute('stroke-dashoffset', String(100 * (1 - elapsed)));
  $('history-track').setAttribute('stroke-dasharray', `0 ${100 * elapsed} ${100 * (1 - elapsed)} 100`);
}
function paintHistory() {
  paintHistoryRing();
  const active = !!historyWindow || returningLive;
  $('history-countdown').toggleAttribute('hidden', !active);
  $('history-action').setAttribute('aria-label', active ? 'Return to Live' : 'Open Archive');
  $('history-action').title = returningLive ? 'Returning to Live…' : active ? 'Return to Live' : 'Open Archive';
  $('history-range').inert = !active;
  $('history-toggle').setAttribute('data-expanded', String(active));
  $('history-selection').setAttribute('aria-hidden', String(!active));
  if (historyWindow) {
    const selected = historyLabel(historyWindow.start, historyWindow.end);
    $('history-selection').textContent = selected;
    $('history-selection').dateTime = new Date(historyWindow.end * 1000).toISOString();
    $('history-range').setAttribute('aria-label', `Choose Archive. Selected window ${selected}`);
  }
}
async function returnToNow() {
  generation++;
  frameLoader.cancel(); liveRequestKey = '';
  historyWindow = null;weatherReplay=null;comparisonLead=0;resetHistoricalForecast();
  archiveHours=null;providerOverlay=false;archiveRevision=null;pendingArchiveSelection=null;
  $('archive-provider').checked=false;
  paintProviderLabels(null);
  sequence=[];sequenceEnd=null;showFrame();
  historyLoading = false;
  pending = null;
  clearTimeout(historyTimer);
  returningLive = true;
  playing = true;
  paintHistory();
  await poll();
}
function checkHistoryDeadline() {
  if (historyWindow && Date.now() >= historyWindow.deadline) void returnToNow();
}
document.addEventListener('visibilitychange', checkHistoryDeadline);
window.addEventListener('pageshow', checkHistoryDeadline);
$('history-action').addEventListener('click', () => historyWindow || returningLive ? returnToNow() : openHistoryPicker());
$('history-range').addEventListener('click', () => openHistoryPicker());
const historyDialog = $('archive-dialog');
const archiveCalendar=setupArchiveCalendar(async(month,signal)=>{
  const pages=await Promise.all(monthRanges(month,Date.now()).map(async([start,until])=>{
    const response=await fetch(`/api/archive?map=${mapIdentity}&start=${start}&until=${until}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
    if(!response.ok)throw new Error();return response.json();
  }));
  return {days:pages.flatMap(p=>p.times.map(dayKey)),min:pages[0]?.oldest==null?'':dayKey(pages[0].oldest/1000),max:dayKey(Date.now()/1000)};
});
let archiveTimes = [];
let pendingArchiveSelection=null;
let historyTargetEnd = null;
const dayKey = time => {const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time*1000));const get=type=>parts.find(p=>p.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;};
function populateTimes() {
  const selected = archiveTimes.filter(time => dayKey(time) === $('archive-day').value);
  $('archive-time').replaceChildren(...selected.map(time => new Option(format(time, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }), String(time))));
  $('archive-time').value = String(selected.at(-1));
}
$('archive-day').addEventListener('change', () => void loadArchiveDay());
async function loadArchiveDay(){
  const day=$('archive-day').value;if(!day)return;
  $('archive-show').disabled=true;
  const midnight=Date.parse(`${day}T00:00:00Z`),start=midnight-15*3600000,end=Math.min(Date.now(),midnight+39*3600000);
  try{const response=await fetch(`/api/archive?map=${mapIdentity}&start=${start}&until=${end}`,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error();const data=await response.json();if($('archive-day').value!==day)return;archiveTimes=data.times.filter(t=>dayKey(t)===day);populateTimes();$('archive-show').disabled=!archiveTimes.length;$('archive-feedback').textContent=archiveTimes.length?'':'No stored history on this date.';}catch{$('archive-feedback').textContent='Archive unavailable. Please try again.';}
}
async function openHistoryPicker() {
  if(!historyWindow&&!historyLoading){archiveHours=pendingArchiveSelection?Number(pendingArchiveSelection.hours):playbackHours();providerOverlay=false;comparisonLead=0;}
  $('archive-comparison').value=String(comparisonLead);
  $('archive-comparison-value').textContent=comparisonLead?`−${comparisonLead} min`:'None';
  $('archive-hours').value=String(archiveHours??playbackHours());
  $('archive-hours-value').textContent=`${$('archive-hours').value} h`;
  $('archive-provider').checked=providerOverlay;
  archiveCalendar.close();
  historyDialog.showModal();
  $('archive-feedback').textContent = 'Loading available history…';
  $('archive-show').disabled = true;
  try {
    const response = await fetch(`/api/archive?map=${mapIdentity}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    const available=await response.json();archiveTimes=available.times;
    $('archive-day').min=available.oldest===null?'':dayKey(available.oldest/1000);$('archive-day').max=dayKey(Date.now()/1000);

    const selectedEnd = pendingArchiveSelection?.time ? Number(pendingArchiveSelection.time) : archiveTimes.includes(historyWindow?.end) ? historyWindow.end : archiveTimes.at(-1)??(available.newest===null?null:available.newest/1000);
    $('archive-day').value = pendingArchiveSelection?.day || (selectedEnd ? dayKey(selectedEnd) : '');
    archiveCalendar.sync();
    await loadArchiveDay();
    if (selectedEnd) $('archive-time').value = String(selectedEnd);
    $('archive-feedback').textContent = archiveTimes.length ? '' : 'No stored history yet.';
    $('archive-show').disabled = !archiveTimes.length;
  } catch { $('archive-feedback').textContent = 'Archive unavailable. Please try again.'; }
}
$('archive-close').addEventListener('click', () => historyDialog.close());
$('archive-hours').addEventListener('input',()=>{
  archiveHours=Number($('archive-hours').value);
  $('archive-hours-value').textContent=`${archiveHours} h`;
});
$('archive-provider').addEventListener('change',()=>{
  providerOverlay=$('archive-provider').checked;
  if(historyWindow)showFrame();
});
$('archive-comparison').addEventListener('input',()=>{comparisonLead=Number($('archive-comparison').value);$('archive-comparison-value').textContent=comparisonLead?`−${comparisonLead} min`:'None';if(historyWindow)paintStatus();});
$('archive-show').addEventListener('click', () => loadHistory($('archive-time').value));
async function loadHistory(end, preserve = false) {
  const epoch = ++generation;
  const hours = preserve ? historyWindow.hours : archiveHours ?? playbackHours();
  const deadline = preserve ? historyWindow.deadline : null;
  historyTargetEnd = end;
  frameLoader.cancel();
  historyLoading = true;
  pending = null;
  $('archive-show').disabled = true;
  $('archive-feedback').textContent = 'Loading the selected window…';
  $('playback-window-note').textContent = `Loading ${hours} hours…`;
  try {
    const response = await fetch(`/api/archive?map=${mapIdentity}&end=${encodeURIComponent(end)}&hours=${hours}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    const window = await response.json();
    const next = await decodeFrames(window.frames, epoch);
    if (epoch !== generation) return;
    if (!next?.length) throw new Error('No readable history');
    attachWindow(next,window,hours);
    weatherReplay=createWeatherReplay(window.weatherHistory);
    historyWindow = { hours, start: window.start, end: window.end, complete: window.complete, counts: window.counts, collectionPeriods:window.collectionPeriods,weatherHistory:window.weatherHistory,cloudHistory:window.cloudHistory,cameraHistory:window.cameraHistory??{records:[],counts:{metadata:0,acquisition:0}}, deadline: deadline ?? Date.now() + 600000 };
    archiveHours=hours;archiveRevision=status?.archiveRevision;
    returningLive = false;
    if (!preserve) playing = true;
    adopt(next, preserve);
    clearTimeout(historyTimer);
    historyTimer = setTimeout(checkHistoryDeadline, Math.max(0, historyWindow.deadline - Date.now()));
    paintHistory();
    historyLoading = false;
    $('playback-window-note').textContent = '';
    if(!preserve)historyDialog.close();
  } catch {
    if (epoch === generation) {
      const message = 'Could not load that window.';
      $('archive-feedback').textContent = message;
      $('playback-window-note').textContent = message;
    }
  } finally {
    if (epoch === generation) { historyLoading = false; $('archive-show').disabled = !archiveTimes.length; }
  }
}
historyDialog.addEventListener('close', () => {
  pendingArchiveSelection={day:$('archive-day').value,time:$('archive-time').value,hours:$('archive-hours').value};
  if (historyLoading) { generation++; frameLoader.cancel(); historyLoading = false; }
});

// Follow the whole pill, including date widths and responsive font changes.
new ResizeObserver(() => {
  const { width, height } = $('history-toggle').getBoundingClientRect();
  if (!width || !height) return;
  const r = (height - 2) / 2, right = width - 1, bottom = height - 1, mid = width / 2;
  const path = `M${mid} 1H${right-r}A${r} ${r} 0 0 1 ${right} ${1+r}V${bottom-r}A${r} ${r} 0 0 1 ${right-r} ${bottom}H${1+r}A${r} ${r} 0 0 1 1 ${bottom-r}V${1+r}A${r} ${r} 0 0 1 ${1+r} 1H${mid}`;
  $('history-countdown').setAttribute('viewBox', `0 0 ${width} ${height}`);
  for (const id of ['history-track', 'history-progress']) $(id).setAttribute('d', path);
}).observe($('history-toggle'));

window.addEventListener("radar-gust-cache-change", paintStatus);
window.addEventListener('radar-weather-preferences', paintStatus);

window.addEventListener('radar-camera-update',paintStatus);
