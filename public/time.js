// Epoch seconds remain unchanged; the selected IANA zone only affects presentation.
export const formatTime = (time, options, timeZone) =>
  new Intl.DateTimeFormat('en-GB', {...options, timeZone}).format(new Date(time * 1000));
