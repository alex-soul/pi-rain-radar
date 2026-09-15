# Contributing

Start with the [development guide](docs/development.md) and [current design](docs/design.md). The application is a small local radar display built with Node.js, Sharp and browser JavaScript.

## Source layout

| Path | Purpose |
| --- | --- |
| `src/provider.js` | RainViewer metadata, tile requests and request pacing |
| `src/map.js` | Viewport, projection and tile coverage |
| `src/map-settings.js`, `src/map-assets.js`, `src/map-page.js` | Persistent map configuration, offline worker rendering and view-specific page assets |
| `assets/` | Pinned, compressed public-domain geography for map preparation |
| `src/radar.js` | Image composition, complete-history publication and persistent cache |
| `src/weather.js` | Shared OpenWeather acquisition, retained gusts, failure counts and request budgets |
| `src/archive.js` | Seven-day paired-frame index and historical windows |
| `src/settings-auth.js`, `src/setup-pin.js` | PIN setup, sessions and authorized settings routes |
| `src/server.js` | HTTP routes, static assets, health and polling startup |
| `public/` | Display UI and bundled map assets; `display.js` owns screen preferences and widget boundaries/stacking |
| `scripts/prepare-map.js` | Generate map palettes and place labels |
| `test/` | Synthetic-data tests for acquisition and cache behaviour |

## Making changes

1. Run the development Compose configuration described in the guide.
2. Keep changes focused and explain the resulting behaviour and relevant validation.
3. Run `npm test` for backend changes. Tests use synthetic data and do not contact RainViewer or OpenWeather.
4. For UI changes, check 1280 × 720 in both themes, playback, scrubbing and stale-data presentation. Exercise relevant compact layouts, saved preferences, refresh, overlapping widgets and footer auto-hide. See the development guide for isolated credential-safe UI checks.
5. Update the relevant documentation when behaviour or setup changes.

Preserve complete-frame publication and last-good cache recovery. Keep provider calls in the backend and respect request pacing. Commit regenerated map assets when geography changes; check their alignment with radar overlays. Never include credentials, private deployment settings or runtime caches in contributions.

Keep the browser image-based and lightweight. Before adding sustained rendering, substantial memory/network use or new infrastructure, explain the cost and consider a bounded, reversible experiment. Laptop results do not establish performance on a Raspberry Pi with 2 GB RAM. Prefer event-driven UI changes and shared backend responses over extra polling or browser-side map processing.

Radar coverage/no-data presentation and Pi validation are current gaps. See the design document for details. Contributions are made under the project MIT licence. Preserve applicable third-party notices.
