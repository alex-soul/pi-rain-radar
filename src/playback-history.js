import {collectionPeriods} from './collection-history.js';
import {loadWeatherHistory} from './weather-history.js';
import {cameraHistory} from './camera.js';

// Availability describes the displayed radar window, which can lag wall time.
// Camera history adds its own ten-minute predecessor allowance to this window.
export async function playbackHistory(store,location,window,hours,now=Date.now()){
 const end=Number.isSafeInteger(window?.end)?window.end:Math.floor(now/1000);
 const [periods,weather,camera]=await Promise.all([
  collectionPeriods(store,end,hours),loadWeatherHistory(store,location,end,hours),cameraHistory(store,end*1000,hours),
 ]);
 return {collectionPeriods:periods,weatherHistory:weather,cameraHistory:camera};
}
