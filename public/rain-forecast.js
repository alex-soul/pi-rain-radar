import { widgetBottom, setupWidgetLayer } from "./display.js";
const panel = document.getElementById("rain-forecast");
const raise = setupWidgetLayer(panel);
const toggle = document.getElementById("rain-forecast-toggle");
const handle = panel;
let position = null;
let visible = false;
let preferredWidth = 410, preferredHeight = 138;
const resizeHandle = document.getElementById("rain-forecast-resize");
try {
  const saved = JSON.parse(localStorage.getItem("radar-rain-forecast"));
  if (Number.isFinite(saved?.width)) preferredWidth = Math.max(300, Math.min(640, saved.width));
  if (Number.isFinite(saved?.height)) preferredHeight = Math.max(108, Math.min(420, saved.height));
  if (saved && typeof saved.visible === "boolean") visible = saved.visible;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;
} catch { /* Defaults remain usable without storage. */ }
function save() {
  try { localStorage.setItem("radar-rain-forecast", JSON.stringify({ ...position, visible, width: preferredWidth, height: preferredHeight })); } catch { /* Optional preference. */ }
}
function place(x, y) {
  const maxX = Math.max(8, innerWidth - panel.offsetWidth - 8);
  const footerTop = widgetBottom();
  const maxY = Math.max(8, footerTop - panel.offsetHeight - 8);
  position = { x: Math.max(8, Math.min(x, maxX)), y: Math.max(8, Math.min(y, maxY)) };
  panel.style.left = `${position.x}px`;
  panel.style.top = `${position.y}px`;
}
function layout() {
  if (!visible) return;
  const footerTop = widgetBottom();
  panel.style.width = `${Math.max(20, Math.min(preferredWidth, innerWidth - 16))}px`;
  panel.style.height = `${Math.max(20, Math.min(preferredHeight, footerTop - 16))}px`;
  place(position?.x ?? 18, position?.y ?? 230);
}
function paint() {
  panel.hidden = !visible;
  toggle.setAttribute("aria-pressed", String(visible));
  toggle.setAttribute("aria-label", visible ? "Hide Rain forecast" : "Show Rain forecast");
  layout();
}
toggle.addEventListener("click", () => { visible = !visible; paint(); if (visible) raise(); save(); });
let drag = null;
handle.addEventListener("pointerdown", event => {
  if (event.button !== 0 || !event.isPrimary) return;
  if (event.target.closest("button")) return;
  panel.focus({ preventScroll: true });
  const rect = panel.getBoundingClientRect();
  drag = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top, x: event.clientX, y: event.clientY, moved: false };
  handle.setPointerCapture(event.pointerId);
});
handle.addEventListener("pointermove", event => {
  if (drag?.id !== event.pointerId) return;
  if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
  drag.moved = true;
  place(event.clientX - drag.dx, event.clientY - drag.dy);
});
function finish() { if (drag) { if (drag.moved) save(); drag = null; } }
handle.addEventListener("pointerup", finish);
handle.addEventListener("pointercancel", finish);
handle.addEventListener("lostpointercapture", finish);
handle.addEventListener("dragstart", event => event.preventDefault());
handle.addEventListener("keydown", event => {
  if (event.target !== panel) return;
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  const step = event.shiftKey ? 40 : 10;
  place(position.x + delta[0] * step, position.y + delta[1] * step);
  save();
});
new ResizeObserver(layout).observe(document.querySelector("footer"));
window.addEventListener("resize", layout);
window.addEventListener("radar-display-change", layout);

let resizing = null;
resizeHandle.addEventListener("pointerdown", event => {
  if (event.button !== 0 || !event.isPrimary) return;
  resizing = { id: event.pointerId, x: event.clientX, y: event.clientY, width: panel.offsetWidth, height: panel.offsetHeight };
  resizeHandle.setPointerCapture(event.pointerId);
  event.preventDefault();
});
function resizeTo(width, height) {
  preferredWidth = Math.max(300, Math.min(640, width));
  preferredHeight = Math.max(108, Math.min(420, height));
  layout();
}
resizeHandle.addEventListener("pointermove", event => {
  if (resizing?.id !== event.pointerId) return;
  resizeTo(resizing.width + event.clientX - resizing.x, resizing.height + event.clientY - resizing.y);
});
function finishResize() { if (resizing) { resizing = null; save(); } }
resizeHandle.addEventListener("pointerup", finishResize);
resizeHandle.addEventListener("pointercancel", finishResize);
resizeHandle.addEventListener("lostpointercapture", finishResize);
resizeHandle.addEventListener("keydown", event => {
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  const step = event.shiftKey ? 40 : 10;
  resizeTo(panel.offsetWidth + delta[0] * step, panel.offsetHeight + delta[1] * step);
  save();
});

paint();

window.addEventListener("radar-screen-lock", () => {
  finish(); finishResize();
  for (const element of [handle, resizeHandle]) {
    // Lost capture clears gesture state before any subsequent movement.
    element.dispatchEvent(new Event("lostpointercapture"));
  }
});
