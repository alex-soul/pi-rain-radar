// Runs before UI modules. Old preference names are read only for upgrade compatibility.
// Keep the original values available for rollback; current preferences take precedence.
(() => {
  try {
    const key = 'radar-rain-forecast';
    if (localStorage.getItem(key) === null) {
      const old = localStorage.getItem('radar-minutecast');
      if (old !== null) {
        const value = JSON.parse(old);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          localStorage.setItem(key, old);
        }
      }
    }
  } catch { /* Optional storage must not prevent startup. Retry on a later load. */ }
  try {
    const key = 'radar-controls';
    const saved = JSON.parse(localStorage.getItem(key));
    if (!Array.isArray(saved)) return;
    const oldId = 'minutecast-toggle';
    const newId = 'rain-forecast-toggle';
    const hasCurrent = saved.some(item => item?.id === newId);
    if (!saved.some(item => item?.id === oldId)) return;
    const upgraded = saved.filter(item => !(hasCurrent && item?.id === oldId))
      .map(item => item?.id === oldId ? { ...item, id: newId } : item);
    localStorage.setItem(key, JSON.stringify(upgraded));
  } catch { /* Other preferences can still be restored independently. */ }
})();
