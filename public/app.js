import { formatTime } from './time.js';
import { paintWeather, weatherDescription } from './weather.js';
const $ = (id) => document.getElementById(id);
const timeZone = document.querySelector('meta[name="time-zone"]').content;
const assetIdentity = document.querySelector('meta[name="map-assets"]').content;
const mapIdentity = document.querySelector('meta[name="map-id"]').content;
function paintThemeToggle() {
  const dark = document.documentElement.dataset.theme === "dark";
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
function setWeatherExpanded(expanded) {
  const shape = weatherDock.querySelector('.weather-shape');
  shape.setAttribute('viewBox', expanded ? '0 0 540 62' : '0 0 76 18');
  $('weather-outline').setAttribute('d', expanded
    ? 'M0 0H540Q532 0 526 6L498 34Q488 44 476 44H308Q303 44 299 48L291 56Q285 62 279 62H261Q255 62 249 56L241 48Q237 44 232 44H64Q52 44 42 34L14 6Q8 0 0 0Z'
    : 'M0 0H76Q71 0 67 4L59 12Q53 18 47 18H29Q23 18 17 12L9 4Q5 0 0 0Z');
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
let historyWindow = null, historyLoading = false, returningLive = false, generation = 0;
let historyTimer;
let displayed = null,
  status = null,
  serverReachable = true;
let sequence = [],
  pending = null,
  index = 0,
  playing = true;
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
function timelineWindow(frames, end = frames.at(-1)?.time) {
  const start = end - 7200;
  const occupied = new Set(frames.map(frame => Math.round((frame.time - start) / 600)));
  const missing = Array.from({ length: 13 }, (_, slot) => slot).filter(slot => !occupied.has(slot));
  const stops = ['transparent 0%'];
  for (const slot of missing) {
    const left = Math.max(0, (slot - 0.5) / 12 * 100), right = Math.min(100, (slot + 0.5) / 12 * 100);
    stops.push(`transparent ${left}%`, `var(--timeline-gap) ${left}%`, `var(--timeline-gap) ${right}%`, `transparent ${right}%`);
  }
  stops.push('transparent 100%');
  return { start, end, missing, gradient: `linear-gradient(to right, ${stops.join(', ')})` };
}
function nearestTimelineFrame(frames, start, slot) {
  const time = start + slot * 600;
  return frames.reduce((nearest, frame, i) => Math.abs(frame.time - time) < Math.abs(frames[nearest].time - time) ? i : nearest, 0);
}
let timelineFrames, timelineEnd, timelineModel;
function paintTimeline() {
  const end = historyWindow?.end ?? sequence.at(-1).time;
  if (timelineFrames !== sequence || timelineEnd !== end) {
    timelineFrames = sequence; timelineEnd = end;
    timelineModel = timelineWindow(sequence, end);
    $('timeline').style.setProperty('--timeline-gaps', timelineModel.gradient);
  }
  const slot = Math.max(0, Math.min(12, Math.round((displayed.time - timelineModel.start) / 600)));
  $('history-start').textContent = clock(timelineModel.start);
  $('history-end').textContent = clock(end);
  $('timeline').max = 12;
  $('timeline').value = slot;
  $('timeline').style.setProperty('--timeline-progress', `${slot / 12 * 100}%`);
  $('timeline').title = timelineModel.missing.length ? `Missing: ${timelineModel.missing.map(slot => clock(timelineModel.start + slot * 600)).join(', ')}` : 'Complete two-hour window';
}
function paintRadarHandle(health, ready = false) {
  const handle = $('footer-toggle');
  handle.dataset.health = ready ? 'ready' : 'warning';
  handle.setAttribute('aria-label', `Radar controls: ${health}`);
  handle.title = `${$('age').textContent}${$('next-update').textContent ? ` · ${$('next-update').textContent}` : ''}. ${health}`;
}
function paintStatus() {
  paintWeather(serverReachable ? status?.weather : null);
  const next = serverReachable ? status?.nextUpdate : null;
  $("next-update").textContent = next?.state === "fetching" ? "Fetching…" : next?.state === "waiting" ? `Next in ${Math.max(1, Math.ceil((next.expectedAt - Date.now()) / 60000))} min` : "";
  $("next-update").hidden = !next;
  if (!displayed) { paintRadarHandle('Waiting for radar data'); return; }
  // Playback position and acquisition health are separate signals.
  const latest = sequence.at(-1).time;
  const newestAvailable = Math.max(latest, status?.frame?.time || 0);
  const minutes = Math.max(
    0,
    Math.floor((Date.now() / 1000 - newestAvailable) / 60),
  );
  const stale = minutes >= 30 || !serverReachable || !!status?.error;
  document.body.classList.toggle('stale', stale);
  document.body.classList.toggle('ready', !stale);
  $("age").textContent = `Latest ${minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} hours`}`;
  const health = stale
    ? "Radar data is stale or acquisition is unavailable"
    : "Latest radar data is fresh";
  paintRadarHandle(health, !stale);
  $("time").textContent = clock(displayed.time);
  $("date").textContent = `${format(displayed.time, { weekday: "short" })}, ${format(displayed.time, { day: "numeric" })} ${format(displayed.time, { month: "short" }).slice(0, 3)}`;
  paintTimeline();
  $("timeline").disabled = sequence.length < 2;
  $("timeline").setAttribute(
    "aria-valuetext",
    `${clock(displayed.time)}, frame ${index + 1} of ${sequence.length}`,
  );
  $("play").disabled = sequence.length < 2;
  $("play").dataset.paused = String(!playing);
  $("play").setAttribute(
    "aria-label",
    playing ? "Pause radar animation" : "Play radar animation",
  );
  $("frame-position").textContent = String(index + 1);
  $("frame-total").textContent = String(sequence.length);
  $("frame-total").classList.toggle("incomplete", sequence.length < 13);
  $("frame-count").setAttribute("aria-label", `Frame ${index + 1} of ${sequence.length}. Expected 13 frames in a complete two-hour window.`);
}
function showFrame() {
  displayed = sequence[index];
  if (!displayed) return;
  $("radar").setAttribute("href", displayed.url);
  $("overview-radar").setAttribute("href", displayed.overviewUrl);
  $("empty").hidden = !mapUpdateVisible;
  paintStatus();
}
function adopt(next) {
  sequence = next;
  index = 0;
  showFrame();
}
function tick() {
  if (playing && sequence.length) {
    if (index === sequence.length - 1 && pending) {
      adopt(pending);
      pending = null;
    } else {
      index = (index + 1) % sequence.length;
      showFrame();
    }
  }
  setTimeout(tick, index === sequence.length - 1 ? 1600 : 650);
}
$("play").addEventListener("click", () => {
  playing = !playing;
  if (playing && pending) {
    adopt(pending);
    pending = null;
  }
  paintStatus();
});
$("timeline").addEventListener("input", (event) => {
  playing = false;
  const value = Number(event.target.value);
  if (!sequence.length) return;
  index = nearestTimelineFrame(sequence, (historyWindow?.end ?? sequence.at(-1).time) - 7200, value);
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
async function decodeFrames(offered) {
  return await Promise.all(
        offered.map(async (frame) => {
          const existing = sequence.find((old) => old.url === frame.url && old.overviewUrl === frame.overviewUrl);
          if (existing) return existing;
          const image = new Image();
          image.src = frame.url;
          await image.decode();
          const overviewImage = new Image();
          overviewImage.src = frame.overviewUrl;
          await overviewImage.decode();
          return { ...frame, image, overviewImage };
        }),
      );
}
let mapUpdateVisible = false;
let dismissedMapError = null;
function paintMapUpdate(update) {
  const error = update?.error;
  mapUpdateVisible = !!update?.applying || !!(error && error !== dismissedMapError);
  $('map-update-dismiss').hidden = !mapUpdateVisible || !!update?.applying;
  if (!mapUpdateVisible) { $('empty').hidden = !!displayed; return; }
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
let pollRunning = false;
async function poll() {
  if (pollRunning) return;
  pollRunning = true;
  const epoch = generation;
  try {
    const response = await fetch("/api/status", {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Status unavailable");
    status = await response.json();
    if (status.mapId && status.mapId !== mapIdentity) { location.reload(); return; }
    paintMapUpdate(status.mapUpdate);
    if (status.mapUpdate?.busy || status.mapUpdate?.error) {
      $('map-note').textContent=status.mapUpdate.busy?'Preparing map…':status.mapUpdate.error;
      $('map-apply').disabled=!!status.mapUpdate.busy;
    }
    serverReachable = true;
    const offered = status.frames || (status.frame ? [status.frame] : []);
    const signature = (frames) => frames.map((frame) => `${frame.url}:${frame.overviewUrl}`).join("|");
    if (
      !historyWindow && !historyLoading && epoch === generation && offered.length &&
      signature(offered) !== signature(pending || sequence)
    ) {
      const next = await decodeFrames(offered);
      if (epoch !== generation || historyWindow || historyLoading) return;
      if (returningLive || !sequence.length || sequence.length === 1) { adopt(next); returningLive = false; paintHistory(); }
      else pending = next;
    }
    if (returningLive && offered.length && !historyWindow && !historyLoading && epoch === generation) { returningLive = false; paintHistory(); }
    if (!displayed && !mapUpdateVisible) {
      $("empty").querySelector("h2").textContent = status.error
        ? "No radar data available"
        : "Preparing radar history";
      $("empty").querySelector("p").textContent = status.progress
        ? `Caching complete frames · ${status.progress.completed} of ${status.progress.total}`
        : "The map is ready. We will retry automatically.";
    }
  } catch {
    serverReachable = false;
    if (mapUpdateVisible) {
      $('empty').querySelector('p').textContent = 'Connection interrupted. Checking map progress again automatically.';
    } else if (!displayed) {
      $("empty").querySelector("h2").textContent = "Waiting for the local app";
      $("empty").querySelector("p").textContent =
        "The connection will be retried automatically.";
    }
  } finally {
    pollRunning = false;
    paintStatus();
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
setTimeout(tick, 650);
setInterval(paintStatus, 10000);

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
  $('history-action').setAttribute('aria-label', active ? 'Return to Now' : 'Open radar history');
  $('history-action').title = returningLive ? 'Returning to Now…' : active ? 'Return to Now' : 'Open radar history';
  $('history-range').inert = !active;
  $('history-toggle').setAttribute('data-expanded', String(active));
  $('history-selection').setAttribute('aria-hidden', String(!active));
  if (historyWindow) {
    const selected = historyLabel(historyWindow.start, historyWindow.end);
    $('history-selection').textContent = selected;
    $('history-selection').dateTime = new Date(historyWindow.end * 1000).toISOString();
    $('history-range').setAttribute('aria-label', `Choose radar history. Selected window ${selected}`);
  }
}
async function returnToNow() {
  generation++;
  historyWindow = null;
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
const dayKey = time => format(time, { year: 'numeric', month: '2-digit', day: '2-digit' });
function populateTimes() {
  const selected = archiveTimes.filter(time => dayKey(time) === $('archive-day').value);
  $('archive-time').replaceChildren(...selected.map(time => new Option(format(time, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }), String(time))));
  $('archive-time').value = String(selected.at(-1));
}
$('archive-day').addEventListener('change', populateTimes);
async function openHistoryPicker() {
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
  } catch { $('archive-feedback').textContent = 'History unavailable. Please try again.'; }
}
$('archive-close').addEventListener('click', () => historyDialog.close());
$('archive-show').addEventListener('click', async () => {
  const epoch = ++generation;
  historyLoading = true;
  pending = null;
  $('archive-show').disabled = true;
  $('archive-feedback').textContent = 'Loading the selected window…';
  try {
    const response = await fetch(`/api/archive?map=${mapIdentity}&end=${encodeURIComponent($('archive-time').value)}`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    const window = await response.json();
    const next = await decodeFrames(window.frames);
    if (epoch !== generation) return;
    historyWindow = { start: window.start, end: window.end, complete: window.complete, deadline: Date.now() + 600000 };
    returningLive = false;
    playing = true;
    adopt(next);
    clearTimeout(historyTimer);
    historyTimer = setTimeout(checkHistoryDeadline, 600000);
    paintHistory();
    historyDialog.close();
  } catch { if (epoch === generation) $('archive-feedback').textContent = 'Could not load that window. Your current map is unchanged.'; }
  finally { if (epoch === generation) historyLoading = false; $('archive-show').disabled = !archiveTimes.length; }
});
historyDialog.addEventListener('close', () => {
  if (historyLoading) { generation++; historyLoading = false; }
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
