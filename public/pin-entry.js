// Six single-digit fields. PIN values stay in the form and are never persisted here.
export function setupPinEntry(group, onComplete = null) {
  const fields = [...group.querySelectorAll('input')];
  function focus(index) { fields[index].focus(); fields[index].select(); }
  function distribute(index, text) {
    const digits = text.replace(/[^0-9]/g, '').slice(0, fields.length - index);
    if (!digits) return;
    [...digits].forEach((digit, offset) => { fields[index + offset].value = digit; });
    group.removeAttribute('data-invalid');
    if (onComplete && index + digits.length === fields.length && fields.every(field => /^[0-9]$/.test(field.value))) onComplete();
    else focus(Math.min(index + digits.length, fields.length - 1));
  }
  fields.forEach((field, index) => {
    field.addEventListener('focus', () => field.select());
    field.addEventListener('beforeinput', event => {
      if (event.data && event.inputType.startsWith('insert') && !/^[0-9]+$/.test(event.data)) event.preventDefault();
    });
    field.addEventListener('input', () => {
      const digits = field.value.replace(/[^0-9]/g, '');
      field.value = '';
      distribute(index, digits);
    });
    field.addEventListener('paste', event => {
      event.preventDefault();
      distribute(index, event.clipboardData?.getData('text') || '');
    });
    field.addEventListener('keydown', event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length === 1 && !/^[0-9]$/.test(event.key)) { event.preventDefault(); return; }
      if (event.key === 'Backspace' && !field.value && index > 0) {
        event.preventDefault(); fields[index - 1].value = ''; focus(index - 1);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); focus(Math.max(0, Math.min(fields.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1))));
      }
    });
  });
  return {
    value: () => fields.map(field => field.value).join(''),
    focus: () => focus(0),
    clear() { fields.forEach(field => { field.value = ''; }); group.removeAttribute('data-invalid'); },
    setEnabled(enabled) { fields.forEach(field => { field.required = enabled; field.disabled = !enabled; }); },
    invalid() { group.setAttribute('data-invalid', 'true'); focus(0); },
  };
}
