# Release follow-ups

## After 0.7.0

I tested RC3 on my Pi: no major problems found, and everything is working. A few non-blocking UI tweaks will be recorded here once the observations have been fully reviewed and assessed. No individual changes are scoped yet.

- Multiple-camera collection remains a future decision; this release supports one camera.
- Direct Tempest integration remains deferred pending provider clarification. OAuth, including callbacks for independently hosted installations, belongs to that future work. Generic HA sensor mapping is available now; it does not override upstream terms.

## Delivered in 0.7.0

Rolling SQLite archive, shared retention and storage status; historical weather/forecast/camera replay; one camera with direct/HA onboarding; shared HA and generic sensor mappings; source/unit/fallback provenance; collection controls; reorganized Settings and dynamic attribution. The earlier embed address example, RainViewer credit wording and displayed-frame time items are implemented.

## Remaining validation

- **Prolonged Pi soak:** remains deferred after 0.6.0. Observe several-hour/overnight split-provider playback, memory growth, swap, recovery, retained history and request counters. Short successful checks are not a soak.
- **Rainbow billing:** revisit no earlier than November 2026 after a full billing cycle. Snapshot billing and estimates remain conditional until confirmed.
- **Reference hardware and wider installation feedback:** retained seven-day fixture startup was tested, but full long-running collection and independent fresh-install walkthroughs remain useful. Narrow phones receive best-effort layout support; minor attribution overlap may remain.

## Delivered in 0.5.0

Observation-time Live/Archive, per-map gaps and late arrivals, bounded Live borrowing, auto-pause/recovery, 1–24-hour Archive, optional provider names, touch gust choices, widget placement, dock layering, reference-screen Settings layout and inactivity, conditional Rainbow Apply prompt, PIN controls, experimental Stats for nerds, optional PWA metadata, kiosk-specific link warnings and bounded startup validation.

See [playback rules](playback-conventions.md), [validation](validation.md) and the [changelog](../CHANGELOG.md). Speculative Rainbow capabilities and personal screen-sleep work are outside the release backlog.

## Delivered in 0.6.0

Optional Embedded Radar with LAN and Pi-hosted Tailscale/Nabu Casa acceptance, independent weather/forecast and radar health, persistent gap/late counters, compact Stats for nerds, power acknowledgements, daily About release checks, Map API information and reusable development scenarios. The About coffee link now opens the intended destination with the existing kiosk warning.
