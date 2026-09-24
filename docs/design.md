# Current design

Runtime source is authoritative. User-facing colour and symbol meanings are maintained only in [screen indicators](indicators.md). See [manual](manual.md) for controls and [validation](validation.md) for tested limits.

## Backend-prepared maps

Node.js 24 and Sharp prepare raster radar frames over locally bundled Natural Earth geography. The browser plays images; it does not render provider tiles or hold API keys. Map geometry, zoom and time zone are shared installation settings. Weather units/source/collection are shared appliance settings. Each browser stores its own layout, reading visibility and playback preferences in localStorage. Different origins/profiles have separate preferences.

Geography is pinned in assets and rendered locally by a short-lived worker. Map Preview makes no provider requests; Apply prepares candidate maps and radar before committing. Location changes invalidate point weather. Name/time-zone changes preserve geometry and history. Keep the same data volume across upgrades.

## Provider acquisition

src/radar-sources.js coordinates Main and Overview workers. RainViewer is the default; optional Rainbow can serve either or both views. A five-minute acquisition cycle shares provider metadata and matching tile promises across views. Each healthy view may publish independently; a failed view retains its previous frame. Source changes are prepared before committing, and failure leaves the existing selection in place. There is no automatic provider substitution.

One persisted settling switch applies globally. New observations use per-provider first-seen times shared between both views and restored across restart. This avoids restarting the settling wait when a provider moves between views. Disabling settling removes the extra delay, not the provider's own publication delay or the polling interval.

src/rainbow.js confines outbound requests to the fixed provider host, uses header authentication, validates snapshots and PNG tiles, serializes request pacing and persists backoff and usage before dispatch. Monthly total-call and tile counts are separate from the lifetime development-test ceiling. The optional monthly limit includes snapshots and failed calls and resets on the UTC calendar month. See [setup, estimates and billing assumptions](radar-providers.md).

## Captures and playback

`src/history-store.js` owns a dedicated SQLite worker with indexed, bounded queries and shared retention. Validated images live in immutable files referenced by SQLite. Seven days is the default, configurable up to available storage; pressure rolls history sooner. Cleanup yields in small batches and protects bounded last-good Live radar. Legacy history is reset once, not imported. Corruption preserves recovery evidence with space accounting and repeated-recovery guards.

Archive offers 1–24-hour windows with historical weather, forecast and camera content and returns to Live after ten minutes. Weather policy transitions preserve units/source/fallback. Operational policy also has an atomic settings file so archive recovery does not reset collection preferences. See [playback rules](playback-conventions.md).

The frontend polls local status and uses bounded decoding, cancellation and reuse. Pausing and scrubbing do not pause acquisition. Experimental Stats for nerds reports current acquisition separately from selected playback coverage.

## Weather

OpenWeather One Call 4.0 current and minute-forecast endpoints update independently on the existing schedule. SQLite retains normalized data, request budgets, errors and one last valid gust with its original observation time. Credentials are stored separately. Failed responses do not renew data age. Ten optional readings share these responses; adding visibility, pressure or UV adds no request.

Browser formatting handles temperature, wind, visibility and pressure units, compass/degrees, and Flow/Meteorological wind convention. Current weather can retain one failed poll within its age limit; gust lifetime is independently configurable. Rain forecast shows a red baseline on forecast failure/expiry, independently of the current-weather dock handle. Rendering details and all signal meanings belong in [indicators](indicators.md).

## Settings, security and optional power

Settings changes use same-origin/CSRF checks and the optional six-digit PIN/session boundary. New installations do not require a PIN. Browser UI lock is a separate convenience feature, not an operating-system security boundary. Provider credits stay active; only explicit kiosk mode requests navigation confirmation. All HTTP(S) anchors receive destination tooltips, including dynamically inserted/changed links.

System opens on Status; API stores OpenWeather, Rainbow and shared HA credentials. Interface separates Radar, Weather, Clouds and Camera. Weather has Dock, Readings, Units and Forecast tabs. Saving credentials does not silently enable new collectors; existing configured collectors remain enabled on upgrade. Keys are validated before replacement and never returned to the browser.

Shared HA transport uses bounded requests and address validation. Independent connection health and all ten mapped source readings poll every five minutes. HA report times do not prove a physical-device measurement; stale/unavailable/mismatched readings become gaps or explicit amber OWM fallback. No HA value conversion is performed. One direct or HA camera is polled at a configurable one-to-ten-minute interval and decoded in an image worker. A replaceable current image serves Live; new immutable Archive history keeps one representative per ten-minute slot, with no future-image selection. Existing history remains retained. Camera images are visible to app viewers: network access is the viewing boundary; the optional Settings PIN protects configuration, not dashboard content.

The optional [Device Power helper](device-power.md) uses a root-owned systemd service, Unix socket, fixed restart/shutdown operations, signed short-lived requests, persistent replay protection and a cooldown. The unprivileged container receives only read-only token/socket-directory mounts and the supplementary group. It receives no Docker socket or privileged mode. Power operations require UI confirmation and inherit optional PIN protection.

## Layout and diagnostics

Playback remains centred; compact layouts keep date beside time and the intensity legend alongside. Attribution is right-aligned at the bottom edge, independently of the sliding dock, without adding a footer row. Settings stays above it. Overview and Rain forecast remain draggable/resizable with per-browser positions, keyboard support and click-to-front stacking.

System Status reports each map and weather separately. The bounded in-memory Log groups repeated events and resets at restart; full container logs are separate. No credentials or raw provider response bodies are included in user-facing errors.

## Limits

Coverage gaps, delayed provider data, network loss and cold starts remain possible. Cached playback is not evidence of fresh acquisition. Native Pi checks are distinct from emulated CI, and short resource samples are not a soak. Some Pi kernels do not enforce Docker memory limits; measure available RAM, process memory and swap directly. See [validation](validation.md) and tracked [follow-ups](follow-ups.md).

## Optional embedding and release awareness

The dedicated `/embed` page imports only lightweight playback/health helpers. It contains Main radar, an LED and credits. Embed settings are shared server-side, disabled by default, atomically persisted and protected by the normal Settings flow. Only exact configured origins may frame it; normal pages remain non-frameable. No profiles or UI/admin controls are initialized. See [Embed](embed.md).

The backend checks fixed public release metadata at most once per 24-hour cycle (bounded pagination), storing the last attempt and successful result. About reads the local cache only. Semantic version ordering uses the existing semver package as a direct backend dependency. Failures do not affect acquisition health; there is no automatic update. See [release checks](release-checks.md).

## Weather charts and astronomy

Nine browser charts reuse retained readings with source/unit provenance, adaptive min/max ranges and bounded grid density. Per-browser visibility, ordering and detached widget geometry are saved locally. Sun/Moon uses bundled SunCalc 2.0.2 and its BSD-2-Clause notice; calculations use the configured location and time zone, current Live time or the selected Archive time. No new provider calls or CDN assets are required.
