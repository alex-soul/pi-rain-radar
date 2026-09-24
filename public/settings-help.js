export const helpText = {
 dewPointDepression:'T−Td is called dew point depression: air temperature (T) minus dew point (Td). A smaller difference means the air is closer to saturation; zero means the two temperatures are equal. It is a temperature difference, not a rain measurement. It uses the sources selected under Readings for Temperature and Dew point, even when Dew point is hidden from the dock.',
 lastFrameHold:'Multiplies the final frame duration before playback loops. 1× adds no extra hold; the default is 2.4× (1560 ms at playback speed 1×). Playback speed scales both ordinary and final frame durations.',
 reviewFallback:'Use OpenWeather when a Home Assistant reading is unavailable. Requires OpenWeather current-weather collection. Borrowed readings show amber and identify OpenWeather as the fallback source.',
 reviewSource:'Choose the primary source for weather readings. Home Assistant can supply the four mapped readings; other readings use OpenWeather when available. Optional OpenWeather fallback appears amber when a mapped HA reading is unavailable. Configure the HA connection under System > API > HA. Collection is managed separately in Collection. Source, mappings and units apply to every screen; layout stays on this browser.',
 reviewMap:'Return to the exact previous coordinates and both zoom values to use matching history while it remains retained. Name and time-zone changes preserve history.',
 reviewHA:'Use the Home Assistant address reachable from the appliance. This shared connection is used by camera and weather. Configure collection separately for each feature.',
 reviewOWM:'All current weather metrics share one OpenWeather API call. Selecting fewer metrics does not reduce API calls; disabled metrics are discarded at runtime before storage. Disabling all readings stops current-weather polling. Forecast has its own switch. Existing values expire normally when collection is off; recorded history and the saved key are retained.',
 reviewCollect:'Collect assigned HA readings every five minutes. Switching off resets HA assignments to OpenWeather, preserving Disabled readings. Connection health and camera collection remain independent.',
 reviewRadar:'Enable collection when this provider is selected for Main or Overview. Disabled providers make no background requests. Saved configuration and retained history remain available.',
  "29": "Restart and shutdown require the optional Device Power helper on your host. Select either button for setup guidance if it is not configured. Settings PIN protection is optional.",
  30: 'Local counter; other apps using your account are not included.',
  "27": "Flow shows where the wind is going. Meteorological shows where it comes from. Both the arrow and the reading follow your choice.",
  "28": "OpenWeather gusts are optional: a missing gust is not an error. Cache duration is in Readings. Home Assistant gusts must stay current and never use this cache.",
  "1": "Changes here affect every display connected to this appliance.",
  "2": "A display label only. Set latitude and longitude to change the actual location.",
  "3": "Sets the centre of both maps and the location used for weather readings and Rain forecast. Defaults to Coventry: 52.40801, −1.51041.",
  "4": "Higher numbers show a smaller area. Zooming in enlarges the radar image without adding finer rain detail. A good starting point is 8.",
  "5": "Sets the area shown in the Overview widget. Use a lower zoom than the main map for a wider view. A good starting point is 5.",
  "6": "Sets the time zone for clocks and timestamps on all displays. It does not change the radar data.",
  "7": "Check the proposed maps before applying them. Preview does not change your current map or download new weather data.",
  "9": "The key stays on the appliance; collected data is stored centrally and shared with connected displays.",
  "10": "Hides the weather dock after 15 seconds without interaction. Tap to reveal it, including when screen controls are locked. Applies only to this display.",
  "11": "Hides the radar controls after 15 seconds without interaction. Tap to reveal them, including when screen controls are locked. Applies only to this display.",
  "12": "Wind gusts are not reported with every update. Keeps the last reported gust visible for this long after its observation time. Older retained readings appear amber; expired readings become a dash. Set to 0 (Off) to disable caching on this display; current gust readings still appear.",
  "13": "Requires a six-digit PIN to open Settings on any connected display. Dashboard controls remain usable unless UI lock is enabled separately.",
  "14": "Applies to temperature, feels-like and dew point on every screen. Archive uses historical units. Wind units are chosen separately.",
  "15": "Applies to wind speed and gusts on every screen. HA readings must match. Temperature units are chosen separately.",
  "16": "Choose which readings appear in this display’s top dock and drag to reorder them. Changes apply only to this display. Hiding a reading does not change weather collection.",
  "17": "An estimate of how warm or cold the air feels, accounting for conditions such as wind and humidity.",
  "18": "Shows relative humidity: how close the air is to saturation at its current temperature. It is not the chance of rain.",
  "19": "The temperature at which moisture in the air begins to condense. A dew point close to the air temperature means high relative humidity.",
  "20": "Uses the convention selected in Weather: Flow shows where the wind is going; Meteorological shows where it comes from.",
  "21": "Stops dashboard interaction on this display while playback and updates continue. Settings remains accessible, protected by your PIN if enabled. Taps reveal auto-hidden docks. Manually hidden docks stay tucked away. All provider credit links remain active.",
  "22": "Wait about 5 extra minutes before downloading new radar images. Turning this off shows images sooner, but some radar tiles may be missing. Applies to all displays.",
  "23": "Events are captured even when Settings is closed. Shows the latest 25 important events and updates while this tab is open. Repeated errors are grouped. History clears when the app restarts.",
  "24": "Opens an external status page. OpenWeather’s monitor is independent and may not reflect the services used here.",
  "25": "At 1×, each ordinary frame is shown for 650 ms, plus any time needed to settle the radar image. Changes playback speed on this display straight away. It does not change how often new radar data is downloaded.",
  "26": "Sets the same 2, 4 or 6-hour window for live playback and History on this display. Older history builds up as the appliance collects it. Longer windows use more browser memory, without extra provider requests. Missing ten-minute frames appear amber on the slider."
};

export function setupSettingsHelp(dialog) {
  dialog.querySelector('#map-settings-intro').hidden = true;
  const bubble = document.createElement('div');
  bubble.id = 'settings-help-bubble'; bubble.className = 'settings-help-bubble';
  bubble.setAttribute('role', 'note'); bubble.hidden = true; dialog.append(bubble);
  let active;
  function close() { active?.setAttribute('aria-expanded', 'false'); active?.removeAttribute('aria-describedby'); active = null; bubble.hidden = true; }
  const targets = [
 ['label[for="review-weather-source"]','reviewSource'],
 ['#review-map-warning','reviewMap'],['label[for="review-ha-url"]','reviewHA'],
 ['label[for="review-fallback"]','reviewFallback'],['label[for="review-owm-collect"]','reviewOWM'],['label[for="review-ha-collect"]','reviewCollect'],
 ['label[for="review-rainviewer-collect"]','reviewRadar'],['label[for="review-rainbow-collect"]','reviewRadar'],
    ['#device-power-title',29],
    ['label[for="rainbow-key"]',9], ['label[for="rainbow-cap"]',30],
    ['label[for="direction-convention"]',27], ['label[for="reading-gust"]',28],
    ['label[for="playback-hours"]',26], ['label[for="last-frame-multiplier"]','lastFrameHold'],
    ['label[for="radar-settling"]',22], ['#diagnostic-title',23],
    ['label[for="map-name"]',2], ['#map-lat',3], ['#map-lon',3], ['#map-zoom',4], ['#map-overviewZoom',5],
    ['label[for="map-timeZone"]',6], ['label[for="settings-api-key"]',9],
    ['label[for="auto-hide-weather"]',10], ['label[for="auto-hide-footer"]',11], ['label[for="gust-cache-minutes"]',12], ['label[for="settings-pin-enabled"]',13],
    ['label[for="screen-lock"]',21], ['#provider-status-title',24], ['label[for="temperature-unit"]',14], ['label[for="wind-unit"]',15], ['label[for="reading-feels"]',17],
    ['label[for="reading-depression"]','dewPointDepression'], ['label[for="reading-humidity"]',18], ['label[for="reading-dew"]',19], ['label[for="reading-direction"]',20], ['label[for="playback-speed"]',25],
  ];
  for (const [selector, key, title] of targets) {
    let target = dialog.querySelector(selector);
    if (!target) continue;
    if (target.tagName === 'INPUT') target = target.closest('label');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'settings-info'; button.textContent = 'i';
    const label = title || [...target.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join('').trim();
    button.setAttribute('aria-label', `About ${label}`); button.setAttribute('aria-expanded', 'false');
    const field = target.tagName === 'LABEL' ? (target.control || target.querySelector('input')) : null;
    if (field && !field.hasAttribute('aria-label')) field.setAttribute('aria-label', label);
    if (target.tagName === 'LABEL') {
      const caption = document.createElement('span'); caption.className = 'settings-label-title';
      for (const node of [...target.childNodes]) if (node.nodeType === 3) caption.append(node);
      caption.append(button);
      // Reading LEDs occupy their own column beside the two caption lines.
      if (field?.type === 'checkbox' && target.closest('.reading-choices')) target.append(caption);
      else target.prepend(caption);
    } else target.append(document.createTextNode(' '), button);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (active === button) { close(); return; }
      close(); active = button; button.setAttribute('aria-expanded','true'); button.setAttribute('aria-describedby', bubble.id);
      bubble.textContent = helpText[key]; if(key==='reviewMap'||key==='reviewSource'){const link=document.createElement('a');link.href='https://github.com/alex-soul/pi-rain-radar/blob/main/docs/manual.md#'+(key==='reviewMap'?'map-choose-your-area':'weather-readings-and-units');link.target='_blank';link.rel='noopener';link.textContent=key==='reviewMap'?'Read the map and archive guide':'Read the weather guide';bubble.append(document.createElement('br'),link);} bubble.hidden = false;
      const rect = button.getBoundingClientRect(), bounds = dialog.getBoundingClientRect();
      bubble.style.width = `${Math.min(320, bounds.width - 32)}px`;
      bubble.style.left = `${Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - bubble.offsetWidth - 8))}px`;
      bubble.style.top = `${Math.max(bounds.top + 8, Math.min(rect.bottom + 5, bounds.bottom - bubble.offsetHeight - 8))}px`;
    });
  }
  dialog.addEventListener('click', event => { if (!bubble.contains(event.target)) close(); });
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); close(); } });
  dialog.addEventListener('close', close);
  dialog.addEventListener('settings-tab-change', close);
  dialog.addEventListener('scroll', close, true);
  window.addEventListener('resize', close);
}
