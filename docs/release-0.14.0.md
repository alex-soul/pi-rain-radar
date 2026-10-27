# Pi Rain Radar 0.14.0

This pre-release adds Grass wetness, Archive GIF export and a simpler rainfall comparison. I tested all four DEV batches and accepted RC2 on my existing Pi 4 / 2 GB. The defaults remain at 1× while I compare Grass with conditions outside.

- **Grass wetness:** an optional, uncalibrated 0–5 estimate using HA accumulated rain and solar irradiance plus temperature, dew point and wind. A five-blade icon stays useful with the widget closed; choose the full widget or five-bar minimal mode. Dock/trend readings, standard appearance controls, setup guidance and seven tuning controls are included. [Setup, formula and tuning guide](grass-wetness.md).
- **Archive GIF:** export the current layout or a clean main/overview map in your browser, inheriting playback and map settings. Choose size, colour detail, looping and separate button/handle hiding. Full 24-hour windows at 1280 × 720 retain all frames; progressive assets and chunked encoding avoid the old whole-window/output cap. [Export guide](archive-gif.md) and [Austen/Boelo showcase](gallery.md#storm-replays).
- **Actual rainfall:** a single Archive switch overlays observed interval-average mm/h with midpoint dots and a smooth line. Forecast bars, chronological axis and scale remain unchanged when toggled. Live and Archive both show a labelled mm/h Y axis. Gaps and counter/source changes remain visible. [Observed-rain guide](observed-rain.md).
- **Setup and layout:** optional native touch in the guided installer defaults Yes; HA irradiance uses fresh successful acquisitions while retaining original report time. A compact sun/waves dock icon follows standard spacing. Archive gets Window/Options/Other tabs and remembered position; overflowing side buttons use another column without covering expanded clock/Archive controls.

Settings and compatible history are preserved. Irradiance and Grass calculation are opt-in. No host changes or archive reset are required for the application upgrade. See [upgrade notes](upgrading.md#0140).

## Validation and limits

RC2 passed **474 tests locally and on native ARM64**, plus fresh startup/restart checks. A real retained full-day export completed with 145 frames at 1280 × 720 / 256 colours, including the overview, clouds, camera and trends. Chunked encoding also passed a 183,866,993-byte synthetic-output check. Live HA zero irradiance was acquired correctly. These are bounded checks, not an extended soak or proof of Grass accuracy. Published build and handover results are recorded in [validation](validation.md).

The exported playback slider can show its thumb without the track. I accepted that cosmetic issue for this release; it is deferred for a future update. The new installer native-touch path still needs a fresh-card physical walkthrough, explicitly deferred while the installer remains experimental. Existing saved installer snapshots retain their original release.
