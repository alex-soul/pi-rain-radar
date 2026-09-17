import test from 'node:test';
import assert from 'node:assert/strict';
import { temperatureText, windText, directionText, visibilityText, pressureText, windBearing, windDirectionText } from '../public/weather-format.js';
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

test('optional visibility pressure and UV validate independently including zero and provider caps',()=>{
  const now=Date.now(),base={dt:Math.floor(now/1000),temp:10,feels_like:8,wind_speed:0};
  const value=extra=>normalizeCurrent({data:[{...base,...extra}]},now);
  assert.equal(value({visibility:0,uvi:0,pressure:1013}).visibility,0);
  assert.equal(value({visibility:0,uvi:0,pressure:1013}).uvi,0);
  for(const extra of [{visibility:-1,pressure:0,uvi:-1},{visibility:'100',pressure:'1013',uvi:'0'},{visibility:10001,pressure:Infinity,uvi:NaN},{}]){
    const data=value(extra);assert.equal(data.visibility,null);assert.equal(data.pressure,null);assert.equal(data.uvi,null);assert.equal(data.temperature,10);
  }
  assert.equal(visibilityText(0),'0');assert.equal(visibilityText(10000),'10+');assert.equal(visibilityText(10000,'mi'),'6.2+');assert.equal(visibilityText(null),'—');
  assert.equal(visibilityText(1609.344,'mi'),'1');
  assert.equal(pressureText(1013),'1013');assert.equal(pressureText(1013,'inHg'),'29.91');assert.equal(pressureText(1013,'mmHg'),'759.8');assert.equal(pressureText(null),'—');
  assert.equal(windBearing(359.9),179.89999999999998);assert.equal(windBearing(null),null);
  assert.equal(windDirectionText(179.9,'degrees'),'0°');assert.equal(windDirectionText(359.9,'degrees','meteorological'),'0°');
});
