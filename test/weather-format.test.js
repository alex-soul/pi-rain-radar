import test from 'node:test';
import assert from 'node:assert/strict';
import { temperatureText, windText, directionText } from '../public/weather-format.js';
import { normalizeCurrent } from '../src/weather.js';

test('display conversions preserve zero and decimal temperature precision, rounding only after conversion', () => {
  assert.equal(temperatureText(0),'0.0°');
  assert.equal(temperatureText(17.5),'17.5°');
  assert.equal(temperatureText(17.5,'F'),'63.5°');
  assert.equal(temperatureText(-0.01),'0.0°');
  assert.equal(temperatureText(null),'—');
  assert.equal(windText(10,'km/h'),'16');
  assert.equal(windText(10,'m/s'),'4');
  assert.equal(windText(10,'kn'),'9');
  assert.equal(windText(0),'0');
  assert.equal(windText(null),'—');
  assert.equal(directionText(0),'N');
  assert.equal(directionText(359),'N');
  assert.equal(directionText(245),'WSW');
});
test('optional current fields preserve valid zero and never invalidate core readings', () => {
  const now=Date.now();
  const raw={dt:Math.floor(now/1000),temp:17.5,feels_like:16.2,wind_speed:4};
  const normalize = extra => normalizeCurrent({data:[{...raw,...extra}]}, now);
  const missing=normalize({humidity:101,dew_point:'2',wind_deg:-1});
  assert.equal(missing.temperature,17.5);
  assert.equal(missing.humidity,null); assert.equal(missing.dewPoint,null); assert.equal(missing.windDirection,null);
  const zero=normalize({humidity:0,dew_point:0,wind_deg:360});
  assert.equal(zero.humidity,0); assert.equal(zero.dewPoint,0); assert.equal(zero.windDirection,0);
});
