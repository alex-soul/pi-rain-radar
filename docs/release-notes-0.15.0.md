Grass Lab is now part of Pi Rain Radar: record what the grass feels like, compare observations with retained weather, and explore how different settings would have changed the estimate.

## What changed

- **Grass Lab** at `/grass-lab`: up to 30 days of retained inputs, draggable/resizable chart windows, 24-hour/3-day/7-day presets, current-setting Reset, and PIN-protected Apply.
- **Observations on the go** at `/grass-obs`: a small mobile form with current or past time, optional notes, and PIN protection. Edit or delete mistakes from the Lab.
- **Contribution heatmaps and multiple overlays** show when rain, dew and drying factors influenced the calculation. Click observation and settings-change markers for details.
- **Grass recovery** preserves established wetness through compatible interruptions of up to 30 minutes. Cold starts and longer interruptions begin at zero with warm-up. Recorded estimates remain fixed.
- **Clearer rainfall intensity**: forecast bars run from blue towards yellow, orange and red according to absolute rain rate. Live and Archive retain automatic Y-axis scales; light rain stays blue even when bars look tall.
- **Radar refinements**: decimal Grass readings, five-bar full widget, concise help with a kiosk-aware Lab link, current Grass/Aviation status and numerical diagnostics, METAR parsing correction, aviation provider-status link, and the Archive GIF playback-track fix.

New installations start with my tuned Grass profile: rain 3×, dew 2×, sun 1×, wind 0.5×, air 0.5×, drainage 0.1× and sensitivity 1×. Calculation remains disabled until configured. **Upgrading preserves existing saved settings, history and observations.** Other gardens can be tuned from their own observations.

I accepted RC7 on my Pi 4 / 2 GB after using the candidates for observation and tuning. RC7 passed 508 automated tests and 49 focused native ARM64 checks; this release adds a regression test proving new-install defaults do not overwrite saved profiles. Published-image CI builds and checks both architectures before promoting `latest`.

See the [Grass Lab guide](https://github.com/alex-soul/pi-rain-radar/blob/main/docs/grass-lab.md), [release details](https://github.com/alex-soul/pi-rain-radar/blob/main/docs/release-0.15.0.md), [validation](https://github.com/alex-soul/pi-rain-radar/blob/main/docs/validation.md), and [upgrade instructions](https://github.com/alex-soul/pi-rain-radar/blob/main/docs/upgrading.md).

This remains a prerelease. The guided installer is experimental; existing saved installer snapshots retain their original selection. Grass is a weather-based estimate, and the rain-rate colour conversion is approximate.
