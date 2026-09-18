# Changelog

## 0.4.1 — Unreleased

- Rename the precipitation widget to **Rain forecast** throughout the interface, accessibility labels, diagnostics, current documentation and frontend assets.
- Preserve existing browser widget placement, size, visibility and control ordering through a compatibility migration.
- Forecast acquisition, rendering, radar playback and stored server settings are unchanged.

## 0.4.0 — 17 September 2026

- Optional Rainbow radar with independent Main/Overview choices, shared acquisition, total-call limits and clearer usage estimates. History retains captured frames across source changes.
- Optional Device Power helper with confirmed Restart/Shutdown actions and existing optional PIN protection.
- Visibility, pressure and UV index; additional unit pickers and continuously rotated wind direction with Flow/Meteorological conventions.
- Quiet Rain forecast zero/missing baselines, consistent weather tooltips, clearer Status, responsive attribution and simpler settings navigation.
- Numbered [indicator guide](docs/indicators.md), provider/power setup documentation and tracked [follow-ups](docs/follow-ups.md).

Existing settings, keys and browser preferences remain in place. The helper is optional; Rainbow needs its own key. I tested the candidate on my Pi 4 / 2 GB, including six-hour playback at full speed and restart/shutdown recovery. 116 tests passed locally and natively on ARM64, plus four helper tests. This is a short playback check, not an elapsed six-hour soak. See [validation](docs/validation.md) for release evidence and remaining checks.

## 0.3.0 — 16 September 2026

Pi Rain Radar gains per-display controls for readings and playback while keeping radar acquisition shared and lightweight.

### Added

- Independent Celsius/Fahrenheit and mph/km/h/m/s/kn units. Temperatures show one decimal; wind speed and gusts use whole numbers.
- Toggle and reorder seven readings, including optional humidity, dew point and wind direction. The original four remain defaults.
- Five playback speeds from 0.5× to 2× and matching 2/4/6-hour live and History windows. Missing ten-minute positions remain amber throughout playback.
- Per-display UI lock, independent of PIN protection; idle PIN entry dismisses after 30 seconds. Settings and provider credits remain accessible.
- Optional shared “Wait for radar to settle” setting, on by default. Disabling the extra wait can expose missing provider tiles.
- A theme-aware log of the last 25 important events since restart, with repeated messages grouped, plus external provider-status links.

### Improved

- Settings grouped into Map; Interface → Display, Buttons, Weather, Readings; System → API, PIN, Status, Log; and About. Small inline helpers explain relevant settings.
- Content-sized weather dock with curved shoulders, narrow-screen wrapping and toolbar collision avoidance.
- Clear Rain forecast dry/partial/unavailable messages and slightly larger time-axis labels.
- Auto-hidden docks wake on tap during UI lock. Provider credits remain visible when the footer hides.
- Bounded image decoding and cancellation/reuse during longer-window changes.

### Upgrade and limitations

Existing key, PIN, map, history and browser preferences are retained. Keep the same address and browser profile. Defaults remain Celsius/mph, four readings, two hours at 1×, settling on and UI lock off. Longer windows use collected local history and more browser memory; they do not add provider calls or increase archive retention. No new runtime dependency is required.

All provider credit links remain active during UI lock, with a kiosk navigation warning. No exception allowing RainViewer's link to be disabled has been obtained or is relied upon. The OpenWeather status monitor is independent. The small event log is temporary and clears on restart.

### Validation

97 tests passed on Windows and native ARM64; candidate fresh-start/restart smoke checks passed. I tested six-hour, full-speed playback on my Pi 4 / 2 GB and found it smooth. A short resource sample found no swap activity, throttling or backend errors. Sustained soak/recovery testing remains open; release CI passed both architectures and startup/restart checks. My Pi is healthy on the published image, with settings/history preserved, and I confirmed the version in About. See [validation](docs/validation.md).
