export const readingNames = { temperature: 'Temperature', feels: 'Feels like', wind: 'Wind', gust: 'Wind gusts', humidity: 'Humidity', dew: 'Dew point', direction: 'Wind direction', visibility: 'Visibility', pressure: 'Pressure', uv: 'UV index' };
export const defaultReadings = ['temperature', 'feels', 'wind', 'gust'];
export const windUnits = { mph: 1, 'km/h': 1.609344, 'm/s': 0.44704, kn: 0.8689762419 };
export const playbackSpeeds = [0.5, 0.75, 1, 1.5, 2];
export function dockOutline(width, height) {
  const centre = width / 2, body = Math.max(0, height - 18);
  // Longer, gentler shoulders stay inside the 68px content padding at any width.
  // During collapse, reserve the whole 76px grip before allocating side depth.
  const depth = Math.min(56, Math.max(0, (width - 76) / 2));
  const grip = `H${centre+38}Q${centre+33} ${body} ${centre+29} ${body+4}L${centre+21} ${body+12}Q${centre+15} ${height} ${centre+9} ${height}H${centre-9}Q${centre-15} ${height} ${centre-21} ${body+12}L${centre-29} ${body+4}Q${centre-33} ${body} ${centre-38} ${body}`;
  return body < 1 ? `M0 0${grip}H0Z` : `M0 0H${width}C${width-depth*.45} 0 ${width-depth*.55} ${body} ${width-depth} ${body}${grip}H${depth}C${depth*.55} ${body} ${depth*.45} 0 0 0Z`;
}
export function temperatureText(value, unit = 'C') {
  if (!Number.isFinite(value)) return '—';
  const converted = unit === 'F' ? value * 1.8 + 32 : value;
  return `${(Math.abs(converted) < 0.05 ? 0 : converted).toFixed(1)}°`;
}
export function windText(value, unit = 'mph') {
  return Number.isFinite(value) ? String(Math.round(value * (windUnits[unit] ?? 1))) : '—';
}
export function directionText(value) {
  return Number.isFinite(value) ? ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(value / 22.5) % 16] : '—';
}

export const weatherOptions = {
  visibilityUnit: ['km', 'mi'], pressureUnit: ['hPa', 'inHg', 'mmHg'],
  directionFormat: ['compass', 'degrees'], directionConvention: ['flow', 'meteorological'],
};
export function windBearing(value, convention = 'flow') {
  return Number.isFinite(value) ? ((value + (convention === 'meteorological' ? 0 : 180)) % 360 + 360) % 360 : null;
}
export function windDirectionText(value, format = 'compass', convention = 'flow') {
  const bearing = windBearing(value, convention);
  return bearing === null ? '—' : format === 'degrees' ? `${Math.round(bearing) % 360}°` : directionText(bearing);
}
export function visibilityText(metres, unit = 'km') {
  if (!Number.isFinite(metres) || metres < 0) return '—';
  const capped = metres >= 10000;
  const value = Math.min(metres, 10000) / (unit === 'mi' ? 1609.344 : 1000);
  return `${Number(value.toFixed(1))}${capped ? '+' : ''}`;
}
export function pressureText(hPa, unit = 'hPa') {
  if (!Number.isFinite(hPa) || hPa <= 0) return '—';
  return unit === 'inHg' ? (hPa / 33.8638866667).toFixed(2) : unit === 'mmHg' ? (hPa / 1.33322387415).toFixed(1) : String(Math.round(hPa));
}
