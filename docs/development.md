# Run and develop

Requires Docker with Linux container support and Docker Compose: Docker Desktop on Windows/macOS, or Docker Engine with Compose on Linux. No host Node installation is needed to run the app. Commands below assume a terminal in the repository root. Pi/ARM64 installation and kiosk operation have been user-confirmed.

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

## Laptop preview and review

### Reusable scenario studio

Exploratory Archive weather POC: after starting the studio, open `/__archive-weather`. This standalone local page reuses the 24-hour radar fixture and generates minute-forecast snapshots in memory. It has scrubbing, four speeds and an amber-gap toggle, including missing snapshot updates. It is not the production Archive implementation or a Pi benchmark; its displayed redraw timing covers synchronous DOM work only. No additional provider calls or live settings changes. Sources: `scripts/dev-archive-weather.html`, `.css` and `.js`.

Run `npm run dev:scenarios` from the repository root with dependencies installed. Wait for the printed ready message, then open [Scenario studio](http://127.0.0.1:3091/__dev) and its **Open radar preview** link. Keep both tabs open: selecting a case updates its explanation immediately and the radar follows on its normal poll within 15 seconds. Refresh the radar for an immediate check; leave it open when testing recovery. All preview windows share the selected case.

The library preserves playback, radar, weather and connection cases. Each explains the simulated condition, expected result and useful next comparison. It serves the real UI and production CSP against disposable generated data, with no provider acquisition. Both Main radar and Overview radar have animated synthetic rain, with motion scaled to each viewport so neither becomes accidentally blank. These illustrative patterns are not geographically matched provider imagery. It binds only to loopback and is not included in the production image. Do not enter real keys. Backend unavailable returns HTTP 503 for all application APIs (including Settings, Log and Archive) and health checks. The scenario console, UI and image files remain reachable so recovery can be selected; this is not a full offline/network/power test. The generated capture window is fixed at launch, while health responses simulate current conditions; restart for a fresh capture window during a long session.

Stop with Ctrl+C; retain the printed temporary data path and process identities when launching in the background. The temporary data remains available for inspection. Browser preferences persist on the local preview origin independently of the Pi.

To extend it, add a stable ID and explanatory copy to `scripts/dev-scenarios.mjs`, implement its synthetic response in `scripts/dev-playback.mjs`, and check entry, expected state and recovery. Keep earlier cases available; update their explanations when accepted product behaviour changes. `scripts/dev-controls.js` and `.css` own the console presentation. Add meaningful tests for new state logic; the console does not replace automated tests or Pi acceptance.

### Other isolated fixtures

Start UI iteration on a laptop before building a Pi candidate. A small temporary Node.js server can serve the real public assets with synthetic provider responses and the production Content-Security-Policy on a separate loopback port (for example 3091). Use disposable data and identify the preview as synthetic; do not copy a deployed PIN or API key. This needs no Docker image build. It is a UI fixture, not proof of full backend or ARM64 behaviour.

Share the preview URL and what changed with the reviewer, keep it running while they review, and iterate locally until the batch is accepted. Refresh frontend assets after edits. Full application tests and provider integration checks remain separate. Stop the fixture and remove its disposable files after review. Then build an identifiable Pi candidate, obtain device acceptance, publish the release and verify the published image on the device. Do not treat automated or agent-only visual checks as reviewer acceptance.

## Automated tests

With Node 24 installed:

```powershell
npm ci
npm test
```

Or use the development container's installed dependencies:

```powershell
docker compose -f compose.yaml -f compose.dev.yaml run --rm --no-deps -v "${PWD}/test:/app/test:ro" radar node --test
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

Radar PNG identities include their viewport geometry; archive lookups expose only matching main/overview pairs. Old images remain subject to shared configurable retention (seven days by default), without an Archive grace period and may be reused when returning to the same geometry. Basemap assets live under `maps/<configuration-id>/` and are reused on restart. These small per-configuration asset directories remain on disk for reuse; frequent experimental changes add storage. SQLite lookups isolate map geometry and retain source provenance. Legacy manifests are not the current archive contract. Do not delete the volume to change location.

## Regenerate the bundled map

The image includes `assets/geography.json.gz`: approximately 9 MB of compressed, public-domain Natural Earth geography. Normal startup and Map Apply do not download geographic data. The renderer loads it only in a short-lived worker while preparing a new view; the HTTP server and browser do not keep it in memory during playback.

Run `node scripts/prepare-geography.js` with Internet access to rebuild this source bundle from its pinned revision. Then `npm run prepare:map` regenerates both default map palettes, both overview palettes and place labels locally. `npm run prepare:overview` is an alias for the same operation. Review/commit the results; do not run these commands as a normal installation step.

If changing the renderer or bundled assets incompatibly, increment the `mapAssetId` version in `src/map.js` so cached immutable asset URLs change, and keep the page identity in `src/map-settings.js` consistent for all time zones. Changing defaults alone must not invalidate existing installed settings. Pi/ARM64 rendering time, peak memory and SD performance still need hardware validation.

A time-zone-only Apply reuses prepared assets, radar frames and history, without rendering or acquisition. It persists the zone and triggers the normal browser reload. Map asset identity excludes the time zone; page identity includes it so existing browsers adopt the change. Archive choices retain epoch timestamps, distinguishing repeated local times by their displayed zone abbreviation/offset. Relative ages, retention and countdowns are unchanged.

## Preview proposed map settings

Preview uses the same validated fields and optional-PIN authorization via POST `/api/settings/map/preview`. One map preparation job runs at a time, shared with Apply; the existing scheduled radar refresh skips a cycle if preparation is busy. Preview uses the offline geometry worker and returns two annotated SVG images for the selected theme. It never creates a radar instance, fetches radar/weather or persists settings. Existing playback and history stay active.

Only one temporary `map-preview/` asset set is kept on disk, overwritten for the next proposal. Matching active assets are reused directly; matching preview assets are copied into the normal map cache on Apply before radar acquisition. Browser previews are image blobs, released on close or PIN lock; late responses cannot reopen a locked settings session. No GIS library, new dependency, timer or polling endpoint is added.

Preview browser checks must use the running server's Content-Security-Policy, including `blob:` in `img-src`. Verify that both preview images decode and check the browser console; a fixture without the production headers can conceal image-policy failures. Script and connection sources remain restricted to the app itself.

## UI validation

Use a disposable data directory and synthetic provider responses when testing PIN-protected settings. Do not reset a deployed PIN, inspect credential files, or change an active installation just to unlock UI testing. Keep the real Content-Security-Policy in fixtures. Verify rendered SVG visibility in the browser: assigning an HTML-style property to an SVG can appear correct in a permissive mock without changing the rendered element. For stacking tests, overlap both widgets and check controls remain accessible. Test saved placement through refresh with auto-hide on and off. Clean up only the disposable fixture and its own data afterward.

## Weather cache and failure checks

SQLite weather state and historical records retain normalized current/minutely data, the last valid gust with its own provider observation timestamp, request budgets, and a current-conditions failure count capped at two with a safe error message. One Call 4.0 uses two requests per eligible refresh (`current` and `timeline/1min`); each endpoint updates independently. `fetchedAt`/`error` describe current conditions, while `forecastFetchedAt`/`forecastError` describe Rain forecast. The first upgrade from pre-0.7.0 resets historical content while preserving operational cooldowns; compatible 0.7.0 upgrades retain the new archive. Credentials stay separately in `settings/openweather.json`. Current readings permit one failed poll until the 30-minute age limit, then become unavailable on the second failure; recovery resets the count. Gust lifetime is a browser-local Interface → Weather preference, default 60 minutes. Location changes/key removal clear retained values. The browser presentation is specified in [indicators](indicators.md).

For a visual failure test, inject synthetic responses into `createWeather` with a disposable data directory and clock. Exercise fresh, one failure, two failures, expired current data, missing gust only, and recovery in both themes. Keep the test server on a separate loopback port and out of production routes; do not cause real provider failures or read/change the active PIN/key. Tests must preserve observation timestamps rather than refreshing cache age on every request. Remove the temporary test server, script and generated data after review.

## Optional PIN validation

New data volumes allow all settings without a PIN. Settings → System → PIN enables, changes or disables protection. Existing pin.json hashes stay enabled; no migration or credential reset is needed. Browser settings tests should cover unrestricted Map/Preview/System/Interface, enable and confirm, close/reopen, PIN change, disable and restart. Use disposable data; keep the deployed PIN/key untouched. The terminal setup command remains available for host recovery, not required onboarding. Its no-argument form and --set/--reset/--enable choose a PIN interactively; --disable removes the hash and --status reports protection. Follow the [recovery guide](troubleshooting.md#pin-recovery). Tests exercise recovery against disposable data, including invalid records, without reading deployed credentials.

PIN-entry tests cover digit-only keyboard/input handling, multi-digit paste, leading zeroes, automatic focus movement, correction and disabled fields. `public/pin-entry.js` is a locally served module; include it when adding or updating an isolated UI fixture. Validate the two aligned six-box rows in both themes and compact layouts.

## Image releases

### Documentation maintenance

Quick Start owns the installation walkthrough; the Pi guide links to it and the README keeps a short entry point. Fresh-install downloads use the maintained `main/compose.yaml`, whose default image follows the successfully published `latest` channel, including pre-releases. Keep this file compatible with the currently published image: stage incompatible future Compose changes separately until release and document explicit migrations. Never silently replace customised installation files during upgrades.

During release review, check README, Quick Start, the manual and troubleshooting against the actual menu, defaults and upgrade behaviour. Installation commands and pinning examples should not require a version-number edit on every release. Keep dated versions in changelog/validation evidence and genuine migration boundaries; those are historical facts. Update the README status when the release status changes. Documentation-only fixes need no image release.

### Publication

Publishing a GitHub release runs .github/workflows/release-image.yml. The workflow checks that its tag matches package.json, runs tests, builds ARM64 and AMD64 images, verifies fresh offline startup and data persistence on both architectures, then promotes the versioned image to latest. latest includes published pre-releases while the product remains pre-release. Fixed v-prefixed image tags support explicit version selection. Publish releases in ascending version order; rerunning an older release also moves latest. GHCR package visibility must be public for anonymous pulls. The source label links images to this repository. Registry publishing uses the workflow GITHUB_TOKEN, with no personal publishing secret.

## Source map and handover

| Location | Responsibility |
| --- | --- |
| `src/server.js` | HTTP routes, provider scheduling, active map and version status |
| `src/radar.js`, `src/radar-history.js`, `src/history-store.js`, `src/provider.js` | Acquisition, indexed archive, playback and provider boundaries |
| `src/map*.js` | Projection, offline assets, preview, atomic map configuration and HTML |
| `src/weather.js` | Shared OpenWeather response, request budgets and retained readings |
| `src/settings-auth.js`, `src/setup-pin.js` | Optional PIN, settings routes and host recovery |
| `public/` | Browser playback, settings, controls and per-browser preferences |
| `test/` | Synthetic provider and browser-logic regression coverage |
| `.github/workflows/release-image.yml` | Multi-platform release tests/build/publish |
| `docs/` | Public installation, manual, upgrades and technical reference |

The runnable app is authoritative when prose drifts. Keep personal machine details and credentials out of this public repository. Do not change saved installation defaults as a side effect of changing fresh defaults. Changes to public release behaviour need a package version bump so browser update detection can work; docs-only changes need no image release.

See [validation and remaining work](validation.md) before describing a behaviour as tested on hardware. Full browser visual checks remain separate from VM-based logic tests. The older private development repository is not an active development target.
## Development-to-release workflow

The scenario studio also serves `/__embed`, with small and tall cards running the real optional embed page. The disposable fixture enables embedding for its loopback review origin; add your own HA test origins through Settings; production still defaults to disabled. Edit its presentation through normal Settings → Map → Embed, then reload the cards. Main radar and backend-loss scenarios affect the LED; Overview and weather failures do not.

Device Power in this studio is also synthetic: Settings → Power → Restart/Shutdown returns an accepted response and displays the normal acknowledgement without executing any host action. Backend unavailable still blocks these requests. Use the UI tests for rejected/interrupted responses. This fixture never forwards power actions to the backend helper.

For an explicit LAN review, run `node scripts/dev-embed-lan.mjs <local-LAN-IP>` alongside the studio. It serves the synthetic embed at `http://<local-LAN-IP>:3092/embed`, forwarding only embed assets, frames and status to loopback port 3091. Settings and the scenario console are not exposed through this transport. Set exact trusted HA origins in the fixture's normal Embed settings. This is an experimental HTTP/LAN review: an HTTPS HA dashboard cannot frame the HTTP URL. Stop this optional process after review. Never use this development proxy against a production backend.

Use one simple development stream:

1. Implement product changes in this repository, with appropriate tests and documentation. Commit and push reviewable checkpoints to `main`; a push does not publish an image. Temporary branches are optional for isolated work, not a required release process.
2. Build the candidate source and validate it on a test device when hardware or visual behaviour needs checking. Record the exact commit and distinguish development builds from published images. `main` can contain changes that have not yet passed device validation; source builders can opt into testing them using the development Compose override.
3. Once the candidate is accepted, set the release version, commit it and create an annotated tag matching `v` plus the package version. Do not move existing release tags.
4. Publish a GitHub Release for that tag, with changes, validation and any migration instructions. The existing workflow builds/tests the images and promotes the successful release to Docker `latest`.
5. Upgrade test devices back to the published image, remove temporary development overrides and verify their version and retained settings.

Tags identify exact source; Releases provide the notes and trigger image publication. Together they form one release checkpoint. Images are published less frequently than source changes. Normal users choose when to pull a published image; developers can build newer `main` themselves. Do not push an unvalidated development image to `latest`.

Development builds should use identifiable local tags (for example `dev-<commit>`) and an explicit override. Repeated builds with the same application version do not trigger browser version reload; refresh browsers manually during those iterations. Preserve the installation's data volume, and back it up before testing changes to stored formats. A code rollback does not roll back data migrations.

See the [screen indicator guide](indicators.md) for status meanings, [radar provider guide](radar-providers.md) for setup and estimates, and [Device Power guide](device-power.md) for the optional host helper.

The Archive weather playground includes **Forecast vs now** in the existing chart: select 10, 20, 30, 40, 50 or 60 minutes earlier to overlay one prediction line on historical now-estimate bars (rolling two hours, ten-minute samples). None restores the saved next-hour forecast. All choices reuse the same synthetic snapshots and match valid timestamps exactly; missing samples remain amber without interpolating across gaps. These are provider-estimate comparisons, not measured rainfall accuracy. The POC loads four six-hour archive windows once, deduplicates boundaries, and then scrubs locally.

## 0.7.0 integration testing and temporary data

The shipped implementation is `src/` plus `public/`. `scripts/rc3-review/` is a historical synthetic design adapter, not a current backend contract; its review states do not prove collection, credentials or persistence. Prefer the ordinary scenario studio for new UI work and real product-module tests for backend changes. The Archive weather POC is retained as an explicitly exploratory fixture.

`src/home-assistant.js` owns shared credentials and health; `src/ha-weather.js` polls mapped sensor states; `src/weather-settings.js` owns durable shared policy and SQLite transition history. Camera transport and decode use `src/camera-http.js` and the image worker. Provider collection gates are independent of API credential storage. Tests use fake provider responses; do not mix real secrets into synthetic scenarios.

Stop the specific DEV supervisor and its backend child after review, plus any optional review/fixture server. Disposable session data uses `pi-rain-radar-next-release-preview-*`, `pi-rain-radar-rc3-ui-review` and `pi-rain-radar-rc3-integration-preview` beneath the OS temporary directory. Verify exact paths and stopped processes before deleting a session's data. Keep source, release evidence and real deployment backups. The optional LAN embed adapter and historical RC3 review both use3092 and cannot run together.
