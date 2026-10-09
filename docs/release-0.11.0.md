# Pi Rain Radar 0.11.0

This pre-release brings all screen settings together, more consistent dock readings and real accumulated-rain history. I accepted RC4 on my existing Pi 4 / 2 GB and phone, including the dock, trends, mobile Stats resizing and Screen/MQTT controls.

- The large bottom-left cog opens **Screen settings**. Choose Main map, Top dock, Bottom dock or Side buttons, then use the tabs across the top. The redundant area cogs and Side buttons shortcut are removed. The large cog follows the standard 15-second reveal timing.
- Dock values use equal compact reservations and consistent spacing. Existing reading visibility, order and formats remain. Wind direction and Sun/Moon altitude readings share their compact font size and white value colour.
- Widget cogs sit at the bottom left. Stats for nerds can shrink further on a phone, and side-button font scaling also applies to the clock.
- **Interface → Weather → Readings** can select an accumulated-rain Home Assistant sensor. It shares the existing five-minute collection cycle and archive retention. Raw totals, units, reset metadata and original HA timestamps are retained; successful acquisitions remain valid when a counter has not changed for hours. Missing or invalid acquisitions remain gaps.
- Rain accumulation is optional in the Top dock and Weather trends. Shared rain display units are mm, cm or in; conversion leaves raw history unchanged. The reading is the total since the sensor's reset, not intensity or a forecast. See [observed rain](observed-rain.md).
- Trend legends use `Temperature (11.0 · 16.8)` on the left and the current value on the right. Min/max come from valid points in the displayed chart window, have no repeated units and scale with the chart font. No extra legend row is needed.
- Brightness/sleep outlines and reading switches have cleaner labels. A transient connection warning clears after a successful retry even if the radar window has not changed.

All 392 application tests passed locally. The accepted RC3 had full native ARM64 and copied-production startup/restart checks; RC4's browser-only fix passed 19 affected native checks plus fresh image startup/restart. Live checks preserved keys, PIN, settings, compatible history and sampled media. Two ordinary five-minute unchanged rain totals and restart persistence were verified. These are bounded checks, not wet-weather accuracy or prolonged-soak evidence.

Release CI builds AMD64 and ARM64 and checks fresh startup/restart before promoting the image to `latest`. Use [upgrade guidance](upgrading.md), retaining the existing volume, browser origin/profile and both configured host-helper overrides. The portable fresh-install/reboot route retains its [experimental limitations](../host/installer/README.md); this app release does not establish new hardware acceptance.

Archive forecast comparisons are unchanged. Observed-rain collection starts the data foundation for a later forecast-reliability review; comparison logic and its UI will be designed in the next release.
