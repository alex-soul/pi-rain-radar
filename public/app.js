import { updateStats } from "./stats.js";
import { liveDueThrough, ageLiveCoverage } from './live-window.js';
import { formatTime } from './time.js';
import { paintWeather, weatherDescription } from './weather.js';
import { playbackSpeed, playbackHours } from './display.js';
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
  $("weather-details").setAttribute("aria-hidden", String(!expanded));
}
window.addEventListener('radar-weather-expanded', event => setWeatherExpanded(event.detail));
try { setWeatherExpanded(localStorage.getItem("radar-weather-expanded") !== "false"); }
catch { setWeatherExpanded(true); }
weatherDock.addEventListener("click", () => {
  const expanded = weatherDock.getAttribute("aria-expanded") !== "true";
  setWeatherExpanded(expanded);
  try { localStorage.setItem("radar-weather-expanded", String(expanded)); } catch { /* Optional preference. */ }
});
let statsReceivedAt = null;
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
const frameLoader = createFrameLoader();
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
    const missing = frames.coverage ? frames.coverage.filter(c=>!c[role]&&!c.pending).map(c=>(c.time-start)/600) : Array.from({length:steps+1},(_,i)=>i).filter(i=>!occupied.has(i));
    const stops = ['transparent 0%'];
    for (const slot of missing) {
      const left=Math.max(0,(slot-.5)/steps*100),right=Math.min(100,(slot+.5)/steps*100);
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
    $('timeline').style.setProperty('--timeline-main-gaps', timelineModel.main.gradient);
    $('timeline').style.setProperty('--timeline-overview-gaps', timelineModel.overview.gradient);
  }
  const slot = Math.max(0, Math.min(timelineModel.steps, ((displayed?.time ?? timelineModel.start) - timelineModel.start) / 600));
  $('history-start').textContent = clock(timelineModel.start);
  $('history-end').textContent = clock(end);
  $('timeline').max = timelineModel.steps;
  $('timeline').value = slot;
  $('timeline').style.setProperty('--timeline-progress', `${slot / timelineModel.steps * 100}%`);
  $('timeline').title = timelineModel.missing.length ? `Missing: ${timelineModel.missing.map(slot => clock(timelineModel.start + slot * 600)).join(', ')}` : `Complete ${hours}-hour window`;
}
function paintRadarHandle(health, ready = false) {
  const handle = $('footer-toggle');
  handle.dataset.health = ready ? 'ready' : 'warning';
  handle.setAttribute('aria-label', `Radar controls: ${health}`);
  handle.title = health;
  for (const id of ['settings-main-status','settings-overview-status']) {
    const row = $(id);
    const source=status?.sources?.[id==='settings-main-status'?'main':'overview'];
    const label=!serverReachable?'Appliance unreachable':source?.error||(!source?health:source.state==='ready'?'Connected':source.state==='stale'?'Data is stale':'Waiting for data');
    if (row) { row.textContent = `${source?.source==='rainbow'?'Rainbow':'RainViewer'} · ${label}`; row.dataset.health = serverReachable&&(source?source.state==='ready':ready) ? 'ready' : 'warning'; }
  }
}
function paintStatus() {
  updateStats({status, reachable:serverReachable, receivedAt:statsReceivedAt, selected:historyWindow, hours:playbackHours(), loading:historyLoading});
  paintWeather(serverReachable ? status?.weather : null);

  // Playback position and acquisition health are separate signals.
  const latest = sequence.at(-1)?.time ?? Math.floor(Date.now()/600000)*600;
  const newestAvailable = Math.max(latest, status?.frame?.time || 0);
  const minutes = Math.max(
    0,
    Math.floor((Date.now() / 1000 - newestAvailable) / 60),
  );
  const stale = !sequence.length || minutes >= 30 || !serverReachable || !!status?.error || Object.values(status?.sources??{}).some(source=>source.state!=='ready');
  document.body.classList.toggle('stale', stale);
  document.body.classList.toggle('ready', !stale);
  const health = !serverReachable ? 'Appliance unreachable' : status?.error ? 'Update failed — check Log'
    : stale ? 'Data is stale — waiting for an update' : 'Connected';
  paintRadarHandle(health, !stale);
  $("time").textContent = displayed ? clock(displayed.time) : '—';
  $("date").textContent = displayed ? `${format(displayed.time, { weekday: "short" })}, ${format(displayed.time, { day: "numeric" })} ${format(displayed.time, { month: "short" }).slice(0, 3)}` : '';
  paintTimeline();
  $("timeline").disabled = sequence.length < 2;
  $("timeline").setAttribute(
    "aria-valuetext",
    `${displayed ? clock(displayed.time) : "No captures"}, frame ${displayed ? index + 1 : 0} of ${sequence.length}`,
  );
  const state = playbackState(playing, sequence.length, !!historyWindow);
  $("play").disabled = !!historyWindow && sequence.length < 2;
  $("play").dataset.state = state;
  $("play").dataset.paused = String(state !== "playing");
  $("play").setAttribute(
    "aria-label",
    state === "waiting" ? "Automatically paused; waiting for captures. Click to pause manually" : state === "playing" ? "Pause playback" : "Play playback",
  );
  $("frame-position").textContent = String(displayed ? index + 1 : 0);
  $("frame-total").textContent = String(sequence.length);
  const expected = sequenceHours * 6 + 1;
  $("frame-total").classList.toggle("incomplete", sequence.complete === false || timelineModel.missing.length > 0);
  $("frame-count").setAttribute("aria-label", `Frame ${displayed ? index + 1 : 0} of ${sequence.length}. Expected ${expected} frames in a complete ${sequenceHours}-hour window.`);
}
function paintProviderLabels(frame) {
  for (const [i,id] of ['main-provider','overview-provider'].entries()) {
    const label=$(id),source=frameProvider(frame,i===0?'main':'overview');
    label.hidden=!(historyWindow && providerOverlay && source);
    label.textContent=source === 'rainbow' ? 'Rainbow' : source === 'rainviewer' ? 'RainViewer' : '';
  }
}
function showFrame() {
  displayed = sequence[index] ?? null;
  const epoch=++renderRevision;
  const observations=['main','overview'].map(role=>mapObservation(sequence,index,role,!!historyWindow));
  paintProviderLabels(displayed);
  for (const [i,id] of ['radar','overview-radar'].entries()) {
    const node=$(id),observation=observations[i];
    if (!observation) { node.style.visibility='hidden'; node.removeAttribute('href'); continue; }
    // Never leave a different timestamp visible while its replacement is loading.
    if(node.getAttribute('href')!==observation.url)node.style.visibility='hidden';
    void frameLoader.prepare(observation.url).then(image=>{
      if(epoch!==renderRevision)return;
      node.style.visibility=image?'visible':'hidden';
      if(image)node.setAttribute('href',observation.url);else node.removeAttribute('href');
      node.dataset.loading=image?'ready':'failed';
    });
  }
  for(let offset=1;offset<=2;offset++) {
    const ahead=sequence[(index+offset)%sequence.length];
    if(ahead)for(const url of [ahead.url,ahead.overviewUrl])if(url)void frameLoader.prepare(url,false);
  }
  const sources=sequence.providers??windowProviders(sequence);
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
  $("empty").hidden = !mapUpdateVisible;
  paintStatus();
}
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
  playbackTimer = setTimeout(tick, (index === sequence.length - 1 ? 1600 : 650) / playbackSpeed());
}
window.addEventListener('radar-playback-speed', schedulePlayback);
function tick() {
  if (playing && sequence.length >= 2) {
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
  const value = Number(event.target.value);
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
  if(historyWindow || historyLoading || !serverClock)return;
  const now=serverClock.time+(performance.now()-serverClock.receivedAt);
  const dueThrough=liveDueThrough(now/1000);
  const end=Math.max(dueThrough,sequenceEnd??0),start=end-sequenceHours*3600;
  if(end===sequenceEnd&&sequence.dueThrough===dueThrough)return;
  const borrowFrames=[...(sequence.borrowFrames??[]),...sequence].filter(f=>f.time>=start-1800&&f.time<start);
  const next=attachWindow(sequence.filter(f=>f.time>=start&&f.time<=end),{end,dueThrough,...ageLiveCoverage(sequence.coverage,start,end,dueThrough),borrowFrames},sequenceHours);
  pending=null;adopt(next,true);
}
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
    serverReachable = true;
    serverClock={time:status.serverTime??Date.now(),receivedAt:performance.now()};
    if(historyWindow && !historyLoading && archiveRevision!==status.archiveRevision) {
      archiveRevision=status.archiveRevision;
      void loadHistory(historyWindow.end,true);
    }
    const offered=status.frames??[],hours=playbackHours();
    const requestKey=`${hours}:${status.end}:${status.dueThrough}:${status.archiveRevision}:${offered.map(f=>`${f.time}:${f.url}:${f.overviewUrl}`).join('|')}`;
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
  historyWindow = null;
  archiveHours=null;providerOverlay=false;archiveRevision=null;
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
let archiveTimes = [];
let historyTargetEnd = null;
const dayKey = time => format(time, { year: 'numeric', month: '2-digit', day: '2-digit' });
function populateTimes() {
  const selected = archiveTimes.filter(time => dayKey(time) === $('archive-day').value);
  $('archive-time').replaceChildren(...selected.map(time => new Option(format(time, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }), String(time))));
  $('archive-time').value = String(selected.at(-1));
}
$('archive-day').addEventListener('change', populateTimes);
async function openHistoryPicker() {
  if(!historyWindow&&!historyLoading){archiveHours=playbackHours();providerOverlay=false;}
  $('archive-hours').value=String(archiveHours??playbackHours());
  $('archive-hours-value').textContent=`${$('archive-hours').value} h`;
  $('archive-provider').checked=providerOverlay;
  historyDialog.showModal();
  $('archive-feedback').textContent = 'Loading available history…';
  $('archive-show').disabled = true;
  try {
    const response = await fetch(`/api/archive?map=${mapIdentity}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    archiveTimes = (await response.json()).times;
    const days = [...new Set(archiveTimes.map(dayKey))];
    $('archive-day').replaceChildren(...days.map(day => new Option(day, day)));
    const selectedEnd = archiveTimes.includes(historyWindow?.end) ? historyWindow.end : archiveTimes.at(-1);
    $('archive-day').value = selectedEnd ? dayKey(selectedEnd) : '';
    populateTimes();
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
    historyWindow = { hours, start: window.start, end: window.end, complete: window.complete, counts: window.counts, deadline: deadline ?? Date.now() + 600000 };
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
      const message = 'Could not load that window. Your current map is unchanged.';
      $('archive-feedback').textContent = message;
      $('playback-window-note').textContent = message;
    }
  } finally {
    if (epoch === generation) { historyLoading = false; $('archive-show').disabled = !archiveTimes.length; }
  }
}
historyDialog.addEventListener('close', () => {
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

window.addEventListener("radar-gust-cache-change", () => paintWeather(serverReachable ? status?.weather : null));
window.addEventListener('radar-weather-preferences', () => paintWeather(serverReachable ? status?.weather : null));
