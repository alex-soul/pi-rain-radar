# Run and develop

Requires Docker with Linux container support and Docker Compose: Docker Desktop on Windows/macOS, or Docker Engine with Compose on Linux. No host Node installation is needed to run the app. Commands below assume a terminal in the repository root. Pi/ARM64 installation and kiosk operation have been user-confirmed.

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Open [localhost:3080](http://localhost:3080). Current Compose source publishes port 3080 on all host IPv4 interfaces for home-LAN access. Set RADAR_BIND_ADDRESS=127.0.0.1 in .env for loopback-only development. The v0.1.0 tag remains loopback-only. Initial radar acquisition needs Internet access; a cold two-hour history takes roughly 2–3 minutes to acquire at the bounded request pace. The bundled map appears immediately; any previous complete paired cache stays visible during acquisition. The container runs as the unprivileged Node user.

For development with mounted source and public assets:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

The backend restarts when source changes. Refresh the browser for frontend changes. Dependencies are installed inside the image; rebuild after dependency updates.

```powershell
docker compose logs --tail 50 radar
docker compose restart radar
docker compose stop
```

The `pi-rain-radar_radar-data` named volume preserves cached state across restarts and container recreation. Do not use `down -v` unless deliberately deleting the cache. `/healthz` reports process readiness and whether a frame exists; `/api/status` exposes acquisition status. A healthy process does not imply fresh provider data.

## Tests

With Node 24 installed:

```powershell
npm ci
npm test
```

Or use the development container's installed dependencies:

```powershell
docker compose run --rm --no-deps -v "${PWD}/test:/app/test:ro" radar node --test
```

Tests use synthetic tiles, never the external provider. They cover projection, paired-frame publication/recovery, settling and archive boundaries, PIN authorization, weather acquisition/expiry, retained gusts, one-poll fallback and recovery, map preview/apply, time zones and display preferences. External provider requests are mocked.

## Changing the location

Use the **Map** tab (unlock first if PIN protection is enabled); no source edits or container rebuild are needed. Settings are shared by all browsers on that server and stored atomically in `settings/map.json` in the data volume. Fresh installs use the defaults below. Startup saves their initial configuration so later default changes do not move an existing installation. Older installations with implicit defaults retain their original map and radar cache namespace; saved map settings are never overwritten by new defaults.

| Field | Supported values | Default |
| --- | --- | --- |
| Time zone | Valid IANA name, with searchable suggestions | Europe/London |
| Location name | Optional, up to 60 characters; blank hides the centre label | Coventry |
| Latitude | -80 to 80 | 52.40801 |
| Longitude | -180 to 180 | -1.51041 |
| Main map zoom | 6 to 10, fractional allowed | 8 |
| Overview zoom | 2 to 7, no greater than main zoom | 5 |

The form displays overview zoom rounded to two decimals but preserves its exact saved value when left unchanged. Views crossing the polar Mercator boundary are rejected. Tile columns wrap across the date line. Natural Earth is generalized geography, not street mapping; radar detail and coverage still depend on RainViewer. Zooms above 7 enlarge source radar pixels rather than adding detail. All clocks, radar dates, history choices and weather timestamps use the selected time zone, independently of coordinates. Daylight saving follows that zone automatically. Older installations without this field default to Europe/London.

Apply validates the whole configuration, prepares local SVG assets in a temporary worker and acquires a complete paired radar sequence for the new view. Only one update runs at a time. The old display remains usable throughout; normal scheduled radar work pauses while a new view is being prepared. Preparation/downloads may take several minutes. A failed preparation keeps the existing configuration. Successful publication persists the settings and the existing browser status poll triggers a reload into the prepared view, returning historical playback to Now.

The location name, centre marker, place labels, scale and overview rectangle are rendered from configuration. OpenWeather discards conditions from the previous location and refreshes at the next eligible acquisition attempt; its normal request budget is retained. Changing zoom alone does not invalidate current point weather.

Radar PNG identities include their viewport geometry; archive lookups expose only matching main/overview pairs. Old images remain subject to the normal seven-day retention plus buffer and may be reused when returning to the same geometry. Basemap assets live under `maps/<configuration-id>/` and are reused on restart. These small per-configuration asset directories remain on disk for reuse; frequent experimental changes add storage. The original default history manifest stays compatible; other geometries have separately keyed history/settling manifests. Do not delete the volume to change location.

## Regenerate the bundled map

The image includes `assets/geography.json.gz`: approximately 9 MB of compressed, public-domain Natural Earth geography. Normal startup and Map Apply do not download geographic data. The renderer loads it only in a short-lived worker while preparing a new view; the HTTP server and browser do not keep it in memory during playback.

Run `node scripts/prepare-geography.js` with Internet access to rebuild this source bundle from its pinned revision. Then `npm run prepare:map` regenerates both default map palettes, both overview palettes and place labels locally. `npm run prepare:overview` is an alias for the same operation. Review/commit the results; do not run these commands as a normal installation step.

If changing the renderer or bundled assets incompatibly, increment the `mapAssetId` version in `src/map.js` so cached immutable asset URLs change, and keep the page identity in `src/map-settings.js` consistent for all time zones. Changing defaults alone must not invalidate existing installed settings. Pi/ARM64 rendering time, peak memory and SD performance still need hardware validation.

A time-zone-only Apply reuses prepared assets, radar frames and history, without rendering or acquisition. It persists the zone and triggers the normal browser reload. Map asset identity excludes the time zone; page identity includes it so existing browsers adopt the change. History choices retain epoch timestamps, distinguishing repeated local times by their displayed zone abbreviation/offset. Relative ages, retention and countdowns are unchanged.

## Preview proposed map settings

Preview uses the same validated fields and optional-PIN authorization via POST `/api/settings/map/preview`. One map preparation job runs at a time, shared with Apply; the existing scheduled radar refresh skips a cycle if preparation is busy. Preview uses the offline geometry worker and returns two annotated SVG images for the selected theme. It never creates a radar instance, fetches radar/weather or persists settings. Existing playback and history stay active.

Only one temporary `map-preview/` asset set is kept on disk, overwritten for the next proposal. Matching active assets are reused directly; matching preview assets are copied into the normal map cache on Apply before radar acquisition. Browser previews are image blobs, released on close or PIN lock; late responses cannot reopen a locked settings session. No GIS library, new dependency, timer or polling endpoint is added.

Preview browser checks must use the running server's Content-Security-Policy, including `blob:` in `img-src`. Verify that both preview images decode and check the browser console; a fixture without the production headers can conceal image-policy failures. Script and connection sources remain restricted to the app itself.

## UI validation

Use a disposable data directory and synthetic provider responses when testing PIN-protected settings. Do not reset a deployed PIN, inspect credential files, or change an active installation just to unlock UI testing. Keep the real Content-Security-Policy in fixtures. Verify rendered SVG visibility in the browser: assigning an HTML-style property to an SVG can appear correct in a permissive mock without changing the rendered element. For stacking tests, overlap both widgets and check controls remain accessible. Test saved placement through refresh with auto-hide on and off. Clean up only the disposable fixture and its own data afterward.

## Weather cache and failure checks

`weather.json` retains normalized current/minutely data, the last valid gust with its own provider observation timestamp, request budgets, and a consecutive-failure count capped at two with a safe error message. Credentials stay separately in `settings/openweather.json`. Current readings permit one failed poll until the 30-minute age limit, then become unavailable on the second failure; recovery resets the count. Gust lifetime is a browser-local Misc preference, default 60 minutes. Location changes/key removal clear retained values. The browser uses muted amber only on cached numbers, leaving icons/units untouched.

For a visual failure test, inject synthetic responses into `createWeather` with a disposable data directory and clock. Exercise fresh, one failure, two failures, expired current data, missing gust only, and recovery in both themes. Keep the test server on a separate loopback port and out of production routes; do not cause real provider failures or read/change the active PIN/key. Tests must preserve observation timestamps rather than refreshing cache age on every request. Remove the temporary test server, script and generated data after review.

## Optional PIN validation

New data volumes allow all settings without a PIN. Settings → PIN enables, changes or disables protection. Existing pin.json hashes stay enabled; no migration or credential reset is needed. Browser settings tests should cover unrestricted Map/Preview/API/Buttons/Misc, enable and confirm, close/reopen, PIN change, disable and restart. Use disposable data; keep the deployed PIN/key untouched. The terminal setup command remains available for host recovery, not required onboarding. Its no-argument form and --set/--reset/--enable choose a PIN interactively; --disable removes the hash and --status reports protection. Follow the [recovery guide](quick-start.md#pin-recovery). Tests exercise recovery against disposable data, including invalid records, without reading deployed credentials.

PIN-entry tests cover digit-only keyboard/input handling, multi-digit paste, leading zeroes, automatic focus movement, correction and disabled fields. `public/pin-entry.js` is a locally served module; include it when adding or updating an isolated UI fixture. Validate the two aligned six-box rows in both themes and compact layouts.

## Image releases

Publishing a GitHub release runs .github/workflows/release-image.yml. The workflow checks that its tag matches package.json, runs tests, builds ARM64 and AMD64 images, verifies fresh offline startup and data persistence on both architectures, then promotes the versioned image to latest. latest includes published pre-releases while the product remains pre-release. Fixed v-prefixed image tags support explicit version selection. Publish releases in ascending version order; rerunning an older release also moves latest. GHCR package visibility must be public for anonymous pulls. The source label links images to this repository. Registry publishing uses the workflow GITHUB_TOKEN, with no personal publishing secret.
