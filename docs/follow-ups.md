# Release follow-ups

Open work to pick up after 0.4.0. These items do not block this release.

- [ ] **One-time Rainbow key prompt.** Immediately after a successful key save, show “Configured. Please now Save and Apply”. Later normal status shows only “Configured.” Keep key saving separate from source application; do not silently apply the sources.
- [ ] **Prolonged Pi soak.** Run continuously for several hours or overnight with split RainViewer/Rainbow maps and the six-hour playback window at full speed. Record actual elapsed time, memory growth, active swapping, freezes, provider updates/recovery, history and request-counter persistence. Six-hour playback selection alone is not a six-hour soak.
- [ ] **Confirm snapshot billing.** Check whether Rainbow excludes snapshot checks from the advertised free tile allowance. Adjust estimate notes in the next release if needed; 0.4.0 explicitly assumes they are free.
- [ ] **Explore more Rainbow capabilities.** Investigate minute-by-minute forecasts extending up to four hours, the separate radar-tile layer versus the precipitation tiles currently used, cloud-cover tiles/animation, and other useful API features. Verify actual resolution, coverage, update cadence, subscription access, costs and data terms before proposing UI or backend changes. Consider how longer forecasts would fit MinuteCast and how alternative layers affect playback/history and Pi resource use. This is exploration for future releases, not committed release scope. Start with the [Rainbow API documentation](https://doc.rainbow.ai/).

See [validation](validation.md) for wider test limitations and [development](development.md) before starting work.
