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

This section describes 0.4.0. The agreed [Live / Archive terminology and next-release behaviour](playback-conventions.md) supersede its screen-capture model as the target design; implementation is tracked in [follow-ups](follow-ups.md#live-and-archive-playback).

src/captured-archive.js records the displayed map frame references and their providers in ten-minute slots. The current slot can update as individual views publish. On cold startup the fast map can appear early; the initial historical window is seeded after both workers finish. Provider switching preserves older captures. Geometry determines archive identity; retention is seven days. Cleanup protects images referenced by retained captures.

History replays captured combinations without requesting old provider frames on demand. Current weather/Rain forecast stay current. A chosen historical window automatically returns to live after ten minutes. Longer 2/4/6-hour windows use accumulated local captures, not additional provider calls. A selected six-hour window does not guarantee six hours of data are available.

The frontend polls local status and uses bounded decoding, cancellation and reuse for incoming image sequences. Playback speed scales the existing animation cadence; pausing/scrubbing does not pause acquisition. The old Latest/Next debug display has been removed. Status reports current source health regardless of the image being played.

## Weather

OpenWeather One Call 4.0 current and minute-forecast endpoints update independently on the existing schedule. weather.json retains normalized data, request budgets, errors and one last valid gust with its original observation time. Credentials are stored separately. Failed responses do not renew data age. Ten optional readings share these responses; adding visibility, pressure or UV adds no request.

Browser formatting handles temperature, wind, visibility and pressure units, compass/degrees, and Flow/Meteorological wind convention. Current weather can retain one failed poll within its age limit; gust lifetime is independently configurable. Rain forecast clears on forecast failure/expiry rather than presenting stale data as a successful response. Rendering details and all signal meanings belong in [indicators](indicators.md).

## Settings, security and optional power

Settings changes use same-origin/CSRF checks and the optional six-digit PIN/session boundary. New installations do not require a PIN. Browser UI lock is a separate convenience feature, not an operating-system security boundary. Provider credits stay active through the kiosk navigation confirmation. All HTTP(S) anchors receive destination tooltips, including dynamically inserted/changed links.

System opens on Status; API has Radar and Weather sub-tabs. Reopening a section resets its nested tab to the first. Keys are validated before replacement and never returned to the browser. Saving the Rainbow key does not apply source selection.

The optional [Device Power helper](device-power.md) uses a root-owned systemd service, Unix socket, fixed restart/shutdown operations, signed short-lived requests, persistent replay protection and a cooldown. The unprivileged container receives only read-only token/socket-directory mounts and the supplementary group. It receives no Docker socket or privileged mode. Power operations require UI confirmation and inherit optional PIN protection.

## Layout and diagnostics

Playback remains centred; compact layouts place date and intensity below. Attribution is right-aligned at the bottom edge, independently of the sliding dock, without adding a footer row. Settings stays above it. Overview and Rain forecast remain draggable/resizable with per-browser positions, keyboard support and click-to-front stacking.

System Status reports each map and weather separately. The bounded in-memory Log groups repeated events and resets at restart; full container logs are separate. No credentials or raw provider response bodies are included in user-facing errors.

## Limits

Coverage gaps, delayed provider data, network loss and cold starts remain possible. Cached playback is not evidence of fresh acquisition. Native Pi checks are distinct from emulated CI, and short resource samples are not a soak. Some Pi kernels do not enforce Docker memory limits; measure available RAM, process memory and swap directly. See [validation](validation.md) and tracked [follow-ups](follow-ups.md).
