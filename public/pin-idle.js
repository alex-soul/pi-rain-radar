// Only the locked PIN prompt expires; authenticated Settings never use this timer.
export function setupPinIdle(dialog, panel, timeout = 30_000) {
  let timer;
  const clear = () => { clearTimeout(timer); timer = undefined; };
  const arm = () => {
    clear();
    if (dialog.open && !panel.hidden) timer = setTimeout(() => {
      if (dialog.open && !panel.hidden) dialog.close();
    }, timeout);
  };
  for (const name of ['pointerdown','keydown','input']) dialog.addEventListener(name, arm, true);
  dialog.addEventListener('close', clear);
  return {arm, clear};
}
