# 0.15.0-rc.6

Grass Lab gains the reviewed compact layout, whole-chart panning, a resizable history navigator and 24-hour/3-day/7-day presets. It opens at the latest seven days and navigates only the loaded 30-day history. Temperature and dew are separate readings; heatmap overlays and the compact clear action remain aligned with the chart.

Observation and settings-change markers use click-toggle popups that stay open for text selection. Observation popups offer Edit; the table also supports editing and confirmed deletion. Production writes use the installation PIN and SQLite worker, preserve observation identity/import metadata, and invalidate cached Lab data. Future observation times are rejected. The lightweight phone form has cleaned copy, a Lab link, and explicit now/past time selection.

The Grass Lab menu link sits beside Calculate grass wetness, retaining the kiosk warning. Reset and Apply are themed buttons beneath the sliders. Existing live tuning, recorded estimates, history and model arithmetic are unchanged by upgrading. There is no storage schema migration.

Validation: 506 local and CI tests passed, including authenticated observation editing/deletion, restart persistence, location boundaries, cache invalidation, strict time validation and unchanged weather history. Production browser checks used an isolated copied dataset and test PIN, not live writes. [Candidate CI](https://github.com/alex-soul/pi-rain-radar/actions/runs/42901106902) passed both image architectures and fresh startup/restart, including observation edit persistence and deletion. Another 36 focused tests passed natively on ARM64. Live checks preserved all 18 observations, settings and retained Grass snapshots; 6,271 estimates replayed exactly. Deployment evidence belongs to the appliance operations record. Physical touch and normal-use acceptance remain pending.

This is an RC; final release/latest and installer promotion are separate. The installer remains pinned to the accepted 0.14.0 release; this app-only update does not change installation or saved installer resume contracts.
