# Pi Rain Radar 0.9.0

This release focuses on making the display easier to use and personalise, especially by touch.

- Screen-local editors for docks, side buttons and widgets, independent of the shared Settings PIN. Consistent cogs, resize corners, ordering and adjustable background opacity keep controls available when needed.
- Compact, stable top-dock readings, clearer hover states and larger chart/time labels. Fresh browsers start in dark mode with the clock open and Temperature, Humidity, Dew point, Wind speed and Wind direction in the top dock.
- One-tap Archive replay, a movable date/time panel without screen dimming, and a clickable LIVE/ARCHIVE indicator. Archive stays open until dismissed; there is no return countdown.
- Previous/Next capture buttons while paused, a predictable gaps-popup toggle, and playback controls that remain usable on locked screens. Locked playback resumes and closes gaps after 15 seconds idle; local edit controls use a separate one-second timeout.
- Weather trends lookback choices, a brighter capture cursor and shared opacity for grouped/detached charts. Stats for nerds now groups Main, Overview, Clouds, OpenWeather, Camera and Rainbow information.
- Tidier shared Settings, a Rainbow status link and clearer startup feedback. Radar acquisition no longer waits for the removed settling option; normal polling, complete-frame publication and Live timeline grace remain unchanged.

I tested RC1 on my Pi and accepted the UI and touch experience. All 370 final-version tests passed locally. Copied-data startup/restart checks preserved settings, history and assets. Native ARM64 checks covered all 370 test cases successfully: 369 passed in the full run, and the remaining clock-dependent test passed after its fixture was corrected. Bounded health/resource checks passed; extended soak is separate.

Existing compatible archives and saved browser preferences are preserved. Fresh defaults do not overwrite your layout. Back up application data and browser preferences before upgrading, and retain the optional Device Power override. The older archive migration warning still applies to upgrades from 0.6.0 or earlier. Cloud freshness thresholds are unchanged.

See the [user manual](https://github.com/alex-soul/pi-rain-radar/blob/v0.9.0/docs/manual.md), [upgrade guide](https://github.com/alex-soul/pi-rain-radar/blob/v0.9.0/docs/upgrading.md) and [Stats for nerds reference](https://github.com/alex-soul/pi-rain-radar/blob/v0.9.0/docs/stats-for-nerds.md).
