export function reviewHelp(text){
 text=text.replace('export const helpText = {',`export const helpText = {
 reviewSource:'Choose the primary source for weather readings. Home Assistant can supply the four mapped readings; other readings use OpenWeather when available. Optional OpenWeather fallback appears amber when a mapped HA reading is unavailable. Configure the HA connection under System > API > HA. Collection is managed separately in Collection. Source, mappings and units apply to every screen; layout stays on this browser.',
 reviewMap:'Return to the exact previous coordinates and both zoom values to use matching history while it remains retained. Name and time-zone changes preserve history.',
 reviewHA:'Use the Home Assistant address reachable from the appliance. This shared connection is used by camera and weather. Configure collection separately for each feature.',
 reviewOWM:'Disabling collection also stops rain forecast updates. Existing fresh data remains usable until normal expiry; history and the saved key are retained.',
 reviewCollect:'Configure the shared connection under System > API > HA. Collect mapped weather readings every five minutes, independently of the selected display source. Connection health is checked separately.',
 reviewRadar:'Enable collection when this provider is selected for Main or Overview. Disabled providers make no background requests. Saved configuration and retained history remain available.',`);
 text=text.replace("dialog.querySelector('#map-settings-intro').textContent = `${helpText[1]} ${helpText[7]}`;","dialog.querySelector('#map-settings-intro').hidden = true;");
 text=text.replace('const targets = [',`const targets = [
 ['label[for="review-weather-source"]','reviewSource'],
 ['#review-map-warning','reviewMap'],['label[for="review-ha-url"]','reviewHA'],
 ['label[for="review-owm-collect"]','reviewOWM'],['label[for="review-ha-collect"]','reviewCollect'],
 ['label[for="review-rainviewer-collect"]','reviewRadar'],['label[for="review-rainbow-collect"]','reviewRadar'],`);
 text=text.replace('bubble.textContent = helpText[key];',`bubble.textContent = helpText[key]; if(key==='reviewMap'||key==='reviewSource'){const link=document.createElement('a');link.href='https://github.com/alex-soul/pi-rain-radar/blob/main/docs/manual.md#'+(key==='reviewMap'?'map-choose-your-area':'weather-readings-and-units');link.target='_blank';link.rel='noopener';link.textContent=key==='reviewMap'?'Read the map and archive guide':'Read the weather guide';bubble.append(document.createElement('br'),link);}`);
 return text.replace('on this display. Wind units','on every screen. Archive uses historical units. Wind units').replace('on this display. Temperature units','on every screen. HA readings must match. Temperature units');
}
