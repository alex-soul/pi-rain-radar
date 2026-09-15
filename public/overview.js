import { widgetBottom, setupWidgetLayer } from "./display.js";
const panel = document.getElementById("overview");
const raise = setupWidgetLayer(panel);
const toggle = document.getElementById("overview-toggle");
const handle = panel;
const resizeHandle = document.getElementById("overview-resize");
let position = null;
let preferredWidth = 390;
let visible = false;
try {
  const saved = JSON.parse(localStorage.getItem("radar-overview"));
  if (saved && typeof saved.visible === "boolean") visible = saved.visible;
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved;
  if (saved && Number.isFinite(saved.width)) preferredWidth = Math.max(200, Math.min(480, saved.width));
} catch { /* Defaults remain usable without storage. */ }
function save() {
  try { localStorage.setItem("radar-overview", JSON.stringify({ ...position, visible, width: preferredWidth })); } catch { /* Session still works. */ }
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
  const available = Math.max(50, widgetBottom() - 16);
  panel.style.width = `${Math.max(20, Math.min(preferredWidth, innerWidth - 16, (available - 2) * 390 / 280 + 2))}px`;
  place(position?.x ?? innerWidth - panel.offsetWidth - 18, position?.y ?? 64);
}
function paint() {
  panel.hidden = !visible;
  toggle.setAttribute("aria-pressed", String(visible));
  toggle.setAttribute("aria-label", visible ? "Hide map overview" : "Show map overview");
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
  resizing = { id: event.pointerId, x: event.clientX, y: event.clientY, width: panel.offsetWidth };
  resizeHandle.setPointerCapture(event.pointerId);
  event.preventDefault();
});
function resizeTo(width) {
  preferredWidth = Math.max(200, Math.min(480, width));
  layout();
}
resizeHandle.addEventListener("pointermove", event => {
  if (resizing?.id !== event.pointerId) return;
  const dx = event.clientX - resizing.x, dy = (event.clientY - resizing.y) * 390 / 280;
  resizeTo(resizing.width + (Math.abs(dx) >= Math.abs(dy) ? dx : dy));
});
function finishResize() { if (resizing) { resizing = null; save(); } }
resizeHandle.addEventListener("pointerup", finishResize);
resizeHandle.addEventListener("pointercancel", finishResize);
resizeHandle.addEventListener("lostpointercapture", finishResize);
resizeHandle.addEventListener("keydown", event => {
  const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!direction) return;
  event.preventDefault();
  resizeTo(panel.offsetWidth + direction * (event.shiftKey ? 40 : 10));
  save();
});
paint();
