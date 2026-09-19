import {radarSourceHealth} from '../public/health.js';

// Record transitions, not polls. Routine missing history/minutes are deliberately quiet.
export function createHealthEvents(record, now = Date.now) {
  const previous = new Map();
  return (sources, weather) => {
    const time = now();
    const states = Object.fromEntries(['main','overview'].map(role=>[role,radarSourceHealth(sources?.[role],true,time)[0]]));
    const current = weather?.data?.current;
    const currentUsable = current?.time*1000 > time-1800000 && current.time*1000 <= time+300000
      && [current.temperature,current.feelsLike,current.windMph].every(Number.isFinite) && (weather.failures ?? 0)<2;
    states.weather = !weather?.configured ? 'unconfigured' : currentUsable ? (weather.error || weather.failures ? 'warning' : 'ready')
      : weather.fetching && !weather.fetchedAt && !weather.error ? 'warning' : 'error';
    const fetched = weather?.forecastFetchedAt ?? weather?.fetchedAt;
    const minute = Math.floor(time/60000)*60;
    const forecastUsable = fetched > time-1800000 && fetched <= time+300000 && !weather?.forecastError
      && weather?.data?.minutely?.some(m=>Number.isSafeInteger(m.time) && m.time>=minute && m.time<minute+3600 && (m.time-minute)%60===0 && Number.isFinite(m.precipitation) && m.precipitation>=0 && m.precipitation<=1000);
    states.forecast = !weather?.configured ? 'unconfigured' : forecastUsable ? 'ready'
      : weather.fetching && !fetched && !weather.forecastError ? 'warning' : 'error';
    for (const [component,state] of Object.entries(states)) {
      const old = previous.get(component);
      if (state==='error' && old!=='error') record(`${component}-unavailable`);
      else if (old==='error' && state==='ready') record(`${component}-available`);
      previous.set(component,state);
    }
  };
}
