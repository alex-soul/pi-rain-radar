# Pi Rain Radar 0.8.0

- Cloud layers on both maps, local Layers visibility/opacity controls and a shared Rainbow request budget in API settings.
- All ten HA weather readings, independent weather/forecast collection, optional-gust health and mixed-source T−Td (dew point depression).
- Recorded OWM forecast comparison, honest Live/Archive gaps, and camera history aligned to the displayed window without future captures. Camera intervals are configurable from one to ten minutes; new history keeps one representative per ten-minute slot.
- Nine configurable weather trend charts, adaptive scales, source-aware trend arrows and independently movable/resizable detached charts.
- Local Sun/Moon calculations, a phase-aware Moon widget, event times revealed by resizing, and optional Dock readings.
- Responsive settings, stable playback counters, synchronized optional auto-hide and Archive controls that load playback without closing.

360 automated tests passed on Windows and native ARM64, along with fresh startup/restart and copied-data upgrade/restart checks. I tested RC3 on my Pi and found no obvious issues; all new features behaved as expected. Longer soak remains ongoing.

The cloud stale threshold remains 30 minutes. This may be too aggressive for normal provider publication delays; a red Dock indicator can coexist with amber reused-image slots. Longer observations will inform any later adjustment. Existing compatible archives and settings are preserved; the older archive migration warning still applies when upgrading from 0.6.0 or earlier.

Back up application data and browser preferences before upgrading. Camera retention changes apply prospectively; existing captures are not cleaned up. See [upgrade instructions](https://github.com/alex-soul/pi-rain-radar/blob/v0.8.0/docs/upgrading.md), [user manual](https://github.com/alex-soul/pi-rain-radar/blob/v0.8.0/docs/manual.md) and [indicator meanings](https://github.com/alex-soul/pi-rain-radar/blob/v0.8.0/docs/indicators.md).

Published-image handover is complete: both-architecture CI passed, and I confirmed About 0.8.0 with smooth playback and green status LEDs. One expected cloud gap remained. See [validation](https://github.com/alex-soul/pi-rain-radar/blob/main/docs/validation.md#080-published-image-acceptance--24-september-2026) for the recorded evidence. Longer observation is still separate.
