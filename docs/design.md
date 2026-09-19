# Current design

Runtime source is authoritative. User-facing colour and symbol meanings are maintained only in [screen indicators](indicators.md). See [manual](manual.md) for controls and [validation](validation.md) for tested limits.

## Backend-prepared maps

Node.js 24 and Sharp prepare raster radar frames over locally bundled Natural Earth geography. The browser plays images; it does not render provider tiles or hold API keys. Map geometry, zoom and time zone are shared installation settings. Each browser stores its own layout, units, readings and playback preferences in localStorage. Different origins/profiles have separate preferences.

Geography is pinned in assets and rendered locally by a short-lived worker. Map Preview makes no provider requests; Apply prepares candidate maps and radar before committing. Location changes invalidate point weather. Name/time-zone changes preserve geometry and history. Keep the same data volume across upgrades.

## Provider acquisition

src/radar-sources.js coordinates Main and Overview workers. RainViewer is the default; optional Rainbow can serve either or both views. A five-minute acquisition cycle shares provider metadata and matching tile promises across views. Each healthy view may publish independently; a failed view retains its previous frame. Source changes are prepared before committing, and failure leaves the existing selection in place. There is no automatic provider substitution.

One persisted settling switch applies globally. New observations use per-provider first-seen times shared between both views and restored across restart. This avoids restarting the settling wait when a provider moves between views. Disabling settling removes the extra delay, not the provider's own publication delay or the polling interval.

src/rainbow.js confines outbound requests to the fixed provider host, uses header authentication, validates snapshots and PNG tiles, serializes request pacing and persists backoff and usage before dispatch. Monthly total-call and tile counts are separate from the lifetime development-test ceiling. The optional monthly limit includes snapshots and failed calls and resets on the UTC calendar month. See [setup, estimates and billing assumptions](radar-providers.md).

## Captures and playback

src/observation-archive.js indexes usable images by original observation time, provider and map geometry. Legacy capture indexes provide provenance where valid and are retained. Seven-day cleanup protects retained references. New or changed images are decoded; unchanged images reuse persisted validation only after matching content hashes and dimensions.

Live and Archive follow the [playback rules](playback-conventions.md), including per-map gaps, immediate late-data placement, Live endpoint grace and bounded borrowing. Archive offers 1–24 hours of locally retained data without extra acquisition requests. Current weather and Rain forecast stay current, and Archive returns to Live after ten minutes.

The frontend polls local status and uses bounded decoding, cancellation and reuse. Pausing and scrubbing do not pause acquisition. Experimental Stats for nerds reports current acquisition separately from selected playback coverage.

## Weather

OpenWeather One Call 4.0 current and minute-forecast endpoints update independently on the existing schedule. weather.json retains normalized data, request budgets, errors and one last valid gust with its original observation time. Credentials are stored separately. Failed responses do not renew data age. Ten optional readings share these responses; adding visibility, pressure or UV adds no request.

Browser formatting handles temperature, wind, visibility and pressure units, compass/degrees, and Flow/Meteorological wind convention. Current weather can retain one failed poll within its age limit; gust lifetime is independently configurable. Rain forecast shows a red baseline on forecast failure/expiry, independently of the current-weather dock handle. Rendering details and all signal meanings belong in [indicators](indicators.md).

## Settings, security and optional power

Settings changes use same-origin/CSRF checks and the optional six-digit PIN/session boundary. New installations do not require a PIN. Browser UI lock is a separate convenience feature, not an operating-system security boundary. Provider credits stay active; only explicit kiosk mode requests navigation confirmation. All HTTP(S) anchors receive destination tooltips, including dynamically inserted/changed links.

System opens on Status; API has Radar and Weather sub-tabs. Reopening a section resets its nested tab to the first. Keys are validated before replacement and never returned to the browser. Initial Rainbow key configuration with pending provider changes offers a Save and Apply confirmation; otherwise saving the key does not apply source selection.

The optional [Device Power helper](device-power.md) uses a root-owned systemd service, Unix socket, fixed restart/shutdown operations, signed short-lived requests, persistent replay protection and a cooldown. The unprivileged container receives only read-only token/socket-directory mounts and the supplementary group. It receives no Docker socket or privileged mode. Power operations require UI confirmation and inherit optional PIN protection.

## Layout and diagnostics

Playback remains centred; compact layouts keep date beside time and the intensity legend alongside. Attribution is right-aligned at the bottom edge, independently of the sliding dock, without adding a footer row. Settings stays above it. Overview and Rain forecast remain draggable/resizable with per-browser positions, keyboard support and click-to-front stacking.

System Status reports each map and weather separately. The bounded in-memory Log groups repeated events and resets at restart; full container logs are separate. No credentials or raw provider response bodies are included in user-facing errors.

## Limits

Coverage gaps, delayed provider data, network loss and cold starts remain possible. Cached playback is not evidence of fresh acquisition. Native Pi checks are distinct from emulated CI, and short resource samples are not a soak. Some Pi kernels do not enforce Docker memory limits; measure available RAM, process memory and swap directly. See [validation](validation.md) and tracked [follow-ups](follow-ups.md).

## Optional embedding and release awareness

The dedicated `/embed` page imports only lightweight playback/health helpers. It contains Main radar, an LED and credits. Embed settings are shared server-side, disabled by default, atomically persisted and protected by the normal Settings flow. Only exact configured origins may frame it; normal pages remain non-frameable. No profiles or UI/admin controls are initialized. See [Embed](embed.md).

The backend checks fixed public release metadata at most once per 24-hour cycle (bounded pagination), storing the last attempt and successful result. About reads the local cache only. Semantic version ordering uses the existing semver package as a direct backend dependency. Failures do not affect acquisition health; there is no automatic update. See [release checks](release-checks.md).
