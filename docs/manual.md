# User manual

Controls, settings and status meanings for Pi Rain Radar. For installation, use [Quick Start](quick-start.md) or the [Raspberry Pi build guide](raspberry-pi.md).

## One installation, multiple screens

| Shared by every screen | Remembered by each browser |
| --- | --- |
| Location, both map zooms, time zone | Widget positions/sizes and open/closed state |
| OpenWeather key and settings PIN | Button visibility/order, theme and dock preferences |
| Radar acquisition and retained history | Map scale and gust display-cache duration |

Use the same browser profile and address each time. Hostname, IP address and localhost are different browser storage locations; switching between them starts a separate layout. Clearing site data also resets that layout. One Pi collects the data for all screens; more screens do not each make their own provider requests. Simultaneous-screen capacity has not been measured.

## Fresh-browser defaults

Dark theme; clock expanded; Overview and MinuteCast closed; all five buttons visible; map scale on; both dock auto-hide switches off; gust cache 60 minutes. Existing saved preferences take priority.

## Settings

The app starts on Coventry. Overview and MinuteCast start closed; all buttons are shown in this order: Clock, Overview, MinuteCast, History, Light/dark. Previously saved browser preferences keep their own order and visibility.

Tap the screen to reveal the **settings cog at the bottom right**. It disappears after 15 seconds of inactivity. Tap the cog to open settings. All settings work immediately; no PIN is required by default.

### PIN: optional settings protection

In **PIN**, turn on **Enable PIN protection**, enter a six-digit PIN in each row of boxes and tap **Save**. Each box accepts one digit (0–9) and advances automatically. Completing the first row moves to confirmation; completing the second moves to Save. Digits are masked. Use Backspace or the arrow keys to correct a digit, or paste all six digits into the first box. Settings close; the next visit asks for that PIN on the keypad. Protected settings also lock when closed, when you switch away from the page, or after five minutes.

To change the PIN, unlock settings and enter the replacement twice in **PIN**, then Save. To remove protection, turn the switch off and Save. Settings then open freely. Existing PINs stay enabled after an update. Closing without saving leaves protection unchanged.

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

### Buttons: arrange your controls

Drag rows up or down to change the order of the five left-side controls. Turn a row off to hide that button. **Hiding a button does not close its widget:** to leave Overview permanently visible, open it first, then hide its button here. To close it later, show the button again.

The two dock handles remain available for API status; screen interaction reveals the settings cog independently. Button order, theme and widget layout are remembered in this browser; another browser may have a different layout. Map settings and the weather key belong to the installation and are shared.

### API Keys: add current weather and MinuteCast (optional)

The app uses **OpenWeather One Call 3.0** for both features. An API key is a private access code from your OpenWeather account. It must have access to this specific service; another OpenWeather subscription may not include it. Check the [provider's current access and pricing information](https://openweathermap.org/api/one-call-3) and your account's request limit before enabling it.

Paste the key into **Settings → API Keys**, then tap **Save key**. The status underneath reports connection errors or **Last fetched at…** after success. Newly created keys may need activation time; do not repeatedly resave them. The app retries automatically.

One request supplies both widgets, normally every 10–15 minutes. Saving a key triggers an additional check, subject to a short cooldown. Opening widgets or moving the radar slider does not make extra provider requests. Other apps using your OpenWeather account share its allowance.

The key stays on the computer running the app and is not displayed again. **Remove key** disables these features; radar continues working.

### Misc: scale, docks and gust cache

**Show map scale** controls the distance scale (on by default). Maps always face north; Preview omits the scale.

**Auto-hide footer dock** is off by default. Enable it to hide the footer after 15 seconds of inactivity; tap the screen to bring it back. It stays visible while you interact with controls or have a dialog open. The scale moves down when the footer hides. With auto-hide enabled, widgets can use the full screen and retain their saved positions after refresh; the returning footer may temporarily cover their lower edge. With auto-hide off, widgets fit above the visible footer; manually hiding it allows placement further down. These preferences are remembered on this browser, like button layout. Refreshing briefly shows the footer again and starts a new 15-second idle period.

**Auto-hide header dock** independently tucks away weather readings after the same 15-second idle period. Tap elsewhere on the screen to reveal them again. It is off by default. Both handles stay visible, and can always be tapped to manually show or hide their dock. Opening a dialog or holding a touch pauses idle hiding.

**Cache wind gust (min)** defaults to **60**. Enter a whole number from 1 to 1440; it saves automatically in this browser. The latest reported gust remains visible through missing samples or OpenWeather errors until that many minutes after its observation time, then becomes a dash. A muted amber gust number means a retained value is being used; the icon and mph keep their usual colours. Hover over the gust for its timestamp. The backend keeps one gust reading across restarts, clears it when the coordinates change or the key is removed, and makes no extra API calls. Temperature, feels-like and wind allow one failed poll: retained numbers turn muted amber. After two consecutive failed polls, or once their observation is 30 minutes old, they become dashes. A successful poll restores normal colours and resets the failure count; the API handle remains amber during errors.

## Using the screen

![Example radar display in dark mode](images/radar-preview.png)

*Recorded v0.1.2 display, 15 September 2026, with Overview and MinuteCast open. Historical example, not live conditions.*

| Control | What it does |
| --- | --- |
| Clock, top left | Tap to show or tuck away the current clock, including seconds. |
| Sun / moon | Switches theme. The icon shows what pressing it will do: sun for light, moon for dark. |
| Folded map | Shows or hides **Overview**, a wider map with matching radar. The dot marks your centre; the dashed box marks the main map's area. |
| Rain cloud | Shows or hides **MinuteCast**, the forecast for approximately the next hour at your chosen coordinates. |
| Clock with backward arrow | Opens stored radar **History**. See below. |
| Footer handle | Shows or hides the footer. Its colour reports RainViewer health, even while the footer is hidden. Small Latest/Next messages sit above playback when expanded. |
| Settings cog, bottom right | Appears on screen interaction for 15 seconds. Opens settings; asks for a PIN only when protection is enabled. |
| Weather drawer handle | Tap to expand or collapse current temperature, feels-like temperature, wind and wind gusts, in that order. Gusts use the latest available reading within the configured cache duration, otherwise a dash. Values are °C and mph. The drawer stays at the top on all screens; toolbar buttons remain above it if they overlap. |
| Play / pause, bottom | Starts or pauses the radar animation. Pausing does not stop new data being collected. |
| Slider | Drag to inspect a radar image. This pauses playback; tap Play to resume. The times at either end describe the two-hour window, with 13 fixed ten-minute slots. Muted amber sections on the unplayed track mark missing frames; the filled track covers them as playback passes. Playback skips gaps and dragging snaps to the nearest available frame. |

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
| Frame counter, e.g. `7 / 13` | You are viewing image 7 of 13. The total is greenish for a full 13-frame window, amber when fewer are available. This applies in History too. |
| Weather drawer's small handle line | Greenish when weather/forecast data is usable, amber from the first failed poll or when data expires, white when no key is configured. Missing optional gusts alone do not make it amber. This remains visible with the drawer collapsed. |
| Weather numbers: normal colour | Fresh readings from the latest successful weather response. |
| Weather numbers: muted amber | Retained readings. Temperature/feels-like/wind allow one failed poll and expire after 30 minutes; gusts use the Misc cache duration (60 minutes by default). |
| Weather value: `—` | No usable reading: absent, expired, or two consecutive failed polls for temperature/feels-like/wind. |

Radar checks run every five minutes. Newly discovered frames wait at least another five minutes before download, to allow the provider time to complete them. The estimate includes the polling schedule, so **Next can occasionally exceed five minutes**. “Latest” includes the provider's own delay as well; this is not an instantaneous view of rain.

Radar colours run from lighter rain to heavier rain, as shown by the footer colour strip. The colour is rain intensity, not connection status. A clear patch does not prove it is dry: provider coverage or missing tiles can leave gaps even in a green, 13-frame sequence.

MinuteCast is a **forecast**, separate from the past radar animation. Taller bars mean more predicted precipitation; faint baseline bars represent zero predicted precipitation. Missing samples are gaps, not zero rain. A quiet chart with a greenish weather drawer handle can simply mean no rain is forecast. Unavailable readings use dashes/messages rather than invented values.

### Look back with History

Tap History, choose an available **Date** and **Time**, then **Show**. The chosen time is the end of a two-hour window. Only locally stored choices are offered; history builds as the app runs and is kept for seven days. It cannot recover data from before installation or while the machine was off.

The History dock expands to show the selected window. Use the same play/pause and slider controls. Tap the **History icon** to return to Now; tap the **date/time range** to reopen the picker. The outer edge of the expanded History dock shows the ten-minute countdown to an automatic return. Selecting another window restarts it; opening and cancelling the picker does not. Hiding History in Buttons hides both touch targets, but automatic return still works.

Background collection continues. The footer freshness messages still describe the latest acquired radar. **Current weather and MinuteCast remain current even while historical radar plays**—they do not yet have historical playback.


## About

The About tab identifies the app version and links to the project and provider information. Use this version when reporting a problem. See [upgrades](upgrading.md) and [troubleshooting/PIN recovery](troubleshooting.md).
