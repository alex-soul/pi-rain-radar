# User manual

Controls, settings and status meanings for Pi Rain Radar. For installation, use [Quick Start](quick-start.md) or the [Raspberry Pi build guide](raspberry-pi.md).

## One installation, multiple screens

| Shared by every screen | Remembered by each browser |
| --- | --- |
| Location, both map zooms, time zone | Widget positions/sizes and open/closed state |
| OpenWeather key and settings PIN | Button visibility/order, theme and dock preferences |
| Radar acquisition, settling preference and retained history | Map scale, units, readings, UI lock, playback speed/window and gust cache |

Use the same browser profile and address each time. Hostname, IP address and localhost are different browser storage locations; switching between them starts a separate layout. Clearing site data also resets that layout. One Pi collects the data for all screens; more screens do not each make their own provider requests. Simultaneous-screen capacity has not been measured.

## Fresh-browser defaults

Dark theme; clock expanded; Overview and MinuteCast closed; all five buttons visible; map scale on; both dock auto-hide switches off; gust cache 60 minutes; Celsius/mph; temperature, feels-like, wind and gusts shown; 2-hour playback at 1×; UI lock off. Existing saved preferences take priority.

## Settings

The app starts on Coventry. Overview and MinuteCast start closed; all buttons are shown in this order: Clock, Overview, MinuteCast, History, Light/dark. Previously saved browser preferences keep their own order and visibility.

Tap the screen to reveal the **settings cog at the bottom right**. It disappears after 15 seconds of inactivity. Tap the cog to open settings. Display preferences apply immediately; Map, key and PIN changes use their own Preview/Apply or Save actions. No PIN is required by default.

Choose a section from the Settings selector:

- **Map**
- **Interface:** Display, Buttons, Weather, Readings
- **System:** API, PIN, Status, Log
- **About**

Small information icons beside setting titles explain their purpose without leaving the page.

### PIN: optional settings protection

In **System → PIN**, turn on **Enable PIN protection**, enter a six-digit PIN in each row of boxes and tap **Save**. Each box accepts one digit (0–9) and advances automatically. Completing the first row moves to confirmation; completing the second moves to Save. Digits are masked. Use Backspace or the arrow keys to correct a digit, or paste all six digits into the first box. Settings close; the next visit asks for that PIN on the keypad. Protected settings also lock when closed, when you switch away from the page, or after five minutes.

To change the PIN, unlock settings and enter the replacement twice in **System → PIN**, then Save. To remove protection, turn the switch off and Save. Settings then open freely. Existing PINs stay enabled after an update. Closing without saving leaves protection unchanged. The PIN entry screen dismisses after 30 seconds without input.

If you forget an enabled PIN, follow [PIN recovery](troubleshooting.md#pin-recovery) below. No saved data needs to be deleted.

### Map: choose your area

Coventry is pre-set, so you can leave everything alone to try it first.

| Setting | What to enter |
| --- | --- |
| Location name | The label beside the centre dot. Leave blank to hide this label; the dot and other place names stay. |
| Latitude / Longitude | Your chosen centre in decimal degrees. A map service can show coordinates for a selected point. Copy latitude first, longitude second, including any minus sign. Coventry is `52.40801`, `-1.51041`. Typing a name alone does not move the map. |
| Time zone | Type a city/region name to find a suggestion, such as `Europe/Paris` or `America/New_York`. Defaults to `Europe/London`; select your own zone separately from the map coordinates. |
| Main map zoom | Larger numbers show a smaller area. Start at `8`; allowed range is `6–10`. |
| Overview zoom | Controls the small map independently. Larger numbers show less area. Start with the supplied value, `5`; allowed range is `2–7`, no greater than the main zoom. |

Tap **Preview** to see the proposed Main map and Overview before changing anything. Use **Back** to adjust the fields, or **Apply** in the preview when satisfied. Preview shows maps without rain or a distance scale and makes no radar requests.

The dashed rectangle in Overview follows the proposed centre and zooms. It outlines the full 1280 × 720 main map, both in Preview and during normal use. A differently shaped screen may crop that main map, so the rectangle can show more area than is visible on screen. Landscape 1280 × 720 remains the recommended target; configurable render resolutions are a future consideration.

**Preview and Apply validate your entries.** Missing required fields, invalid coordinates or time zones, unsupported zoom combinations and views crossing the map's polar boundary produce an error. The existing map stays unchanged. A blank location name is valid.

Tap **Apply**. Once accepted, Settings closes and the startup-style popup shows **Preparing map**, then **Preparing radar history** with completed/total frames. The count is acquisition progress, not a promise of exactly 13 displayed frames; extra candidates can be considered while preparing a view. You can leave this running without keeping Settings open. The backend uses the same coordinates and zooms to prepare matching radar for both maps; you do not configure the radar separately. The existing map remains visible until the new maps and radar are ready, then the page reloads. If preparation fails, your previous setup remains in use. After a coordinate change, old weather readings are cleared and the next eligible request supplies the new location. **Awaiting first OpenWeather response — allow 10–15 min** is normal during this wait. Current weather and MinuteCast follow the selected coordinates; zoom does not affect those point forecasts/readings.

Changing coordinates or either zoom selects a different history; it **does not delete the previous history**. Old images remain subject to the normal seven-day retention. Returning to the exact previous coordinates and both zoom values can restore that matching history while it is retained. Changing only the name or time zone preserves radar history. A time-zone change reloads the display and changes how timestamps are shown, without fetching new radar.

### Interface → Buttons: arrange your controls

Drag rows up or down to change the order of the five left-side controls. Turn a row off to hide that button. **Hiding a button does not close its widget:** to leave Overview permanently visible, open it first, then hide its button here. To close it later, show the button again.

The two dock handles remain available for API status; screen interaction reveals the settings cog independently. Button order, theme and widget layout are remembered in this browser; another browser may have a different layout. Map settings and the weather key belong to the installation and are shared.

### System → API: add current weather and MinuteCast (optional)

The app uses **OpenWeather One Call 4.0** for both features. An API key is a private access code from your OpenWeather account. It must have access to this specific service; another OpenWeather subscription may not include it. Check the [provider's current access and pricing information](https://openweathermap.org/api/one-call-4) and your account's request limit before enabling it. One Call 4.0 requires its own subscription, including for existing 3.0 users. As checked on 16 September 2026, the first 1,000 calls/day are free; the default 2,000-call daily limit allows chargeable usage. Set the limit to 1,000 to stay within the free allowance. Normal operation uses approximately 288 calls/day per installation (two requests every ten minutes), plus explicit key checks. Other applications and installations sharing the subscription also consume its allowance.

Paste the key into **Settings → System → API**, then tap **Save key**. The status underneath reports connection errors or **Last fetched at…** after success. Newly created keys may need activation time; do not repeatedly resave them. The app retries automatically.

Two requests supply current conditions and the minute forecast, normally every 10–15 minutes, shared by all displays. Saving a key triggers an additional check, subject to a short cooldown. Opening widgets or moving the radar slider does not make extra provider requests. Other apps using your OpenWeather account share its allowance.

The key stays on the computer running the app and is not displayed again. **Remove key** disables these features; radar continues working.

### Interface → Display: playback, scale, docks and UI lock

**Playback speed** has five positions: 0.5×, 0.75×, 1× (default), 1.5× and 2×. Changes preview immediately behind Settings. Speed does not affect acquisition.

**Playback window** selects 2, 4 or 6 hours for both live playback and History on this browser. The timeline has 13, 25 or 37 fixed ten-minute positions. Longer history builds while the appliance runs; this adds no provider requests or archive retention, but uses more browser memory. Changing the window in History retains the selected end time and existing return-to-live deadline.

**Lock screen controls** freezes dashboard buttons, widgets and playback controls while animation and updates continue. Settings stays reachable, with the PIN if enabled. A tap still reveals auto-hidden docks; a dock manually hidden with auto-hide off remains tucked away. Provider credits remain visible and their links remain active through an external-page warning. UI lock is a per-browser interaction guard, not a security boundary or an operating-system kiosk lock.

**Show map scale** controls the distance scale (on by default). Maps always face north; Preview omits the scale.

**Auto-hide footer dock** is off by default. Enable it to hide the footer after 15 seconds of inactivity; tap the screen to bring it back. It stays visible while you interact with controls or have a dialog open. The scale moves down when the footer hides. With auto-hide enabled, widgets can use the full screen and retain their saved positions after refresh; the returning footer may temporarily cover their lower edge. With auto-hide off, widgets fit above the visible footer; manually hiding it allows placement further down. These preferences are remembered on this browser, like button layout. Refreshing briefly shows the footer again and starts a new 15-second idle period.

**Auto-hide header dock** independently tucks away weather readings after the same 15-second idle period. Tap elsewhere on the screen to reveal them again. It is off by default. Both handles stay visible, and can be tapped to manually show or hide their dock when UI lock is off. Opening a dialog or holding a touch pauses idle hiding.

### Interface → Weather: units and gust cache

Choose temperature units independently from wind units: Celsius/Fahrenheit and mph, km/h, m/s or knots. Temperatures always show one decimal, including .0; wind speed and gusts round to whole numbers.

**Cache wind gust (min)** defaults to **60**. Enter a whole number from 1 to 1440; it saves automatically in this browser. The latest reported gust remains visible through missing samples or OpenWeather errors until that many minutes after its observation time, then becomes a dash. A muted amber gust number means a retained value is being used; the icon and unit keep their usual colours. Hover over the gust for its timestamp. The backend keeps one gust reading across restarts, clears it when the coordinates change or the key is removed, and makes no extra API calls. Temperature, feels-like and wind allow one failed poll: retained numbers turn muted amber. After two consecutive failed polls, or once their observation is 30 minutes old, they become dashes. A successful poll restores normal colours and resets the failure count; the API handle remains amber during errors.

### Interface → Readings

Toggle and drag rows to choose and order Temperature, Feels like, Wind, Wind gusts, Humidity, Dew point and Wind direction. The first four remain defaults. These use the same current-conditions request; unavailable optional fields show dashes. The direction icon has eight orientations indicating where wind comes from, with a finer compass abbreviation beside it. It does not predict radar movement.

The top dock sizes to the selected readings, wrapping on narrow screens. Hiding every reading removes the numbers while keeping the health handle. Controls move below an expanded dock when they would collide and move back up when it tucks away.

### System → API: radar settling

**Wait for radar to settle** is on by default and affects every connected display. It waits about five extra minutes before downloading new radar images. Turning it off allows earlier acquisition, but some radar tiles may be missing. Changes take effect on subsequent acquisition; they do not repair already cached imagery or increase polling frequency.

### System → Status and Log

**Status** links to RainViewer's status page and an independent OpenWeather monitor. External links show a short warning because leaving the page can disrupt kiosk viewing; the independent monitor may not cover the service used here.

**Log** shows the last 25 important events since the app started. Capture continues while Settings is closed; LIVE means the viewer refreshes while open. Repeated events are grouped. This is a bounded in-memory troubleshooting aid, cleared on restart, with safe messages rather than raw provider responses or credentials. Full Docker logs remain available separately. The panel follows the selected theme.

## Using the screen

![Example radar display in dark mode](images/radar-preview-20260916-2147.png)

*Recorded v0.3.0 display, 16 September 2026, with Overview and MinuteCast open. Historical example, not live conditions.*

| Control | What it does |
| --- | --- |
| Clock, top left | Tap to show or tuck away the current clock, including seconds. |
| Sun / moon | Switches theme. The icon shows what pressing it will do: sun for light, moon for dark. |
| Folded map | Shows or hides **Overview**, a wider map with matching radar. The dot marks your centre; the dashed box marks the main map's area. |
| Rain cloud | Shows or hides **MinuteCast**, the forecast for approximately the next hour at your chosen coordinates. |
| Clock with backward arrow | Opens stored radar **History**. See below. |
| Footer handle | Shows or hides the footer. Its colour reports RainViewer health, even while the footer is hidden. Small Latest/Next messages sit above playback when expanded. |
| Settings cog, bottom right | Appears on screen interaction for 15 seconds. Opens settings; asks for a PIN only when protection is enabled. |
| Weather drawer handle | Shows/hides the selected readings in their saved order and units. The handle indicates weather health even when all readings are hidden. |
| Play / pause, bottom | Starts or pauses the radar animation. Pausing does not stop new data being collected. |
| Slider | Drag to inspect a radar image and pause playback. Its 13, 25 or 37 ten-minute positions cover the selected 2/4/6-hour window. Missing positions stay amber, including behind the playback thumb. Playback skips gaps; dragging selects the nearest available frame. |

Drag **Overview** or **MinuteCast** from anywhere on its map or chart to move it. Drag its bottom-right triangle to resize it. A small movement threshold separates taps from dragging. Tab to a widget and use arrow keys to move it; the resize corner has its own keyboard control. Overlapping widgets work like windows: click, drag, resize or focus a widget to bring it forward. Opening a widget also brings it forward. Dashboard controls remain above both widgets. A greenish button outline means that control is expanded or its widget is shown; it is not an API-health indicator.

The **large time and date at bottom left belong to the radar image currently playing**, not the present moment. The top-left clock shows the current time. All dates and clocks follow **Settings → Map → Time zone**, defaulting to Europe/London. Daylight-saving changes are automatic. Changing the map coordinates does not automatically choose a time zone.

### Colours and status messages

| Signal | Meaning |
| --- | --- |
| Footer handle: greenish | Latest radar is under 30 minutes old, with no reported acquisition/connection error. |
| Footer handle: amber | Radar is at least 30 minutes old, or acquisition/the connection has a problem. Cached images can still play. |
| `Latest 12 min` | The newest available radar is 12 minutes old, regardless of which image you are playing. From one hour onward this uses decimal hours: `1.5 hours` means 1 hour 30 minutes. |
| `Next in 2 min` | A discovered radar frame is pending; this estimates when acquisition can start. It is not a guarantee of completion. The message disappears when nothing is pending. |
| `Fetching…` | New radar is being acquired. |
| Frame counter, e.g. `7 / 13` | You are viewing image 7 of 13. The total is greenish for a full selected window (13, 25 or 37 frames), amber when fewer are available. This applies in History too. |
| Weather drawer's small handle line | Greenish when weather/forecast data is usable, amber from the first failed poll or when data expires, white when no key is configured. Missing optional gusts alone do not make it amber. This remains visible with the drawer collapsed. |
| Weather numbers: normal colour | Fresh readings from the latest successful weather response. |
| Weather numbers: muted amber | Retained readings. Temperature/feels-like/wind allow one failed poll and expire after 30 minutes; gusts use the Weather cache duration (60 minutes by default). |
| Weather value: `—` | No usable reading: absent, expired, or two consecutive failed polls for temperature/feels-like/wind. |

Radar checks run every five minutes. With radar settling enabled, newly discovered frames wait at least another five minutes before download, to allow the provider time to complete them. The estimate includes the polling schedule, so **Next can occasionally exceed five minutes**. “Latest” includes the provider's own delay as well; this is not an instantaneous view of rain.

Radar colours run from lighter rain to heavier rain, as shown by the footer colour strip. The colour is rain intensity, not connection status. A clear patch does not prove it is dry: provider coverage or missing tiles can leave gaps even in a green, 13-frame sequence.

MinuteCast is a **forecast**, separate from the past radar animation. Taller bars mean more predicted precipitation; faint baseline bars represent zero predicted precipitation. Missing samples are gaps, not zero rain. A valid dry forecast shows “No rain expected” with its last-check time; partial coverage is described as the available forecast. Missing or failed data shows an availability/retry message instead of claiming dry weather. Unavailable readings use dashes/messages rather than invented values.

### Look back with History

Tap History, choose an available **Date** and **Time**, then **Show**. The chosen time is the end of the selected 2/4/6-hour window. Only locally stored choices are offered; history builds as the app runs and is kept for seven days. It cannot recover data from before installation or while the machine was off.

The History dock expands to show the selected window. Use the same play/pause and slider controls. Tap the **History icon** to return to Now; tap the **date/time range** to reopen the picker. The outer edge of the expanded History dock shows the ten-minute countdown to an automatic return. Selecting another window restarts it; opening and cancelling the picker does not. Hiding History in Buttons hides both touch targets, but automatic return still works.

Background collection continues. The footer freshness messages still describe the latest acquired radar. **Current weather and MinuteCast remain current even while historical radar plays**—they do not yet have historical playback.


## About

The About tab identifies the app version and links to the project and provider information. Use this version when reporting a problem. See [upgrades](upgrading.md) and [troubleshooting/PIN recovery](troubleshooting.md).
