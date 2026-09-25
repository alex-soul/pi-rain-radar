# Release follow-ups

## After 0.8.0

I accepted RC3 after Pi skim tests: no obvious issues and all new features behaved as expected. Future UI refinements are non-blocking and will be recorded once supplied.

- Observe cloud publication delays for several days or weeks before changing thresholds. The current 30-minute stale threshold may be too aggressive; retain honest gaps and total colour independently of any later health allowance.
- Continue longer Pi soak, including memory/swap, recovery and retained history. Short successful checks are not prolonged soak.
- Keep the broader Stats for nerds redesign for a later release.

The RC2 camera-label alignment, 24-hour counter spacing and shared Rainbow API limit placement were addressed in 0.8.0. No threshold change is included.

## After 0.7.0

I tested RC3 on my Pi: no major problems found, and everything is working. A few non-blocking UI tweaks will be recorded here once the observations have been fully reviewed and assessed. No individual changes are scoped yet.

- Multiple-camera collection remains a future decision; this release supports one camera.
- Direct Tempest integration remains deferred pending provider clarification. OAuth, including callbacks for independently hosted installations, belongs to that future work. Generic HA sensor mapping is available now; it does not override upstream terms.

## Delivered in 0.7.0

Rolling SQLite archive, shared retention and storage status; historical weather/forecast/camera replay; one camera with direct/HA onboarding; shared HA and generic sensor mappings; source/unit/fallback provenance; collection controls; reorganized Settings and dynamic attribution. The earlier embed address example, RainViewer credit wording and displayed-frame time items are implemented.

## Long-term possible improvements

- **Complete remote appliance management over MQTT — important future direction:** investigate replacing the current custom Device Power helper installation/interface with a properly secured MQTT adapter. Restart and shutdown are only the starting point: the intended direction is a coherent management interface for brightness, screen wake, backup creation and restore, app update checks and installation, status/diagnostics, and other appliance controls as needs emerge. Aim for routine operation and maintenance through Home Assistant or the kiosk app without a keyboard, mouse or SSH terminal. Consider one optional installation with MQTT discovery and shared host-control logic behind both interfaces. Keep recovery access available for failures; the goal of remote management does not assume every recovery can be performed remotely.

  MQTT carries requests; a narrowly privileged local executor is still required, even if packaged with the adapter. Preserve or strengthen action allowlists, authorization, request expiry, replay protection and cooldowns; design dedicated broker identities/topic permissions, verified encrypted transport, non-retained action commands and explicit confirmation/automation policy. Do not silently bypass the app's PIN or give the adapter unrestricted shell access. Design progress/results, errors and retry behaviour for longer operations, and an appropriate secure transfer/storage path for backup artifacts rather than assuming they belong in MQTT messages. Keep standalone operation available while evaluating expected Home Assistant adoption. Research architecture, migration from existing installations and failure/recovery behaviour before implementation; this is a product direction, not a change to current controls or a commitment to a release.
- **Appliance management from kiosk Settings:** investigate physical screen brightness, user-initiated backup/restore, and checking for and installing app updates without leaving the app. Build on the existing About release checks where appropriate. Research supported hardware and host-helper permissions, backup contents (including settings, credentials and optional history), restore compatibility, and update verification/recovery before scoping implementation. Keep controls touch-friendly and distinguish application updates from host OS maintenance. These are exploratory product ideas, not committed release scope.

## Remaining validation

- **Prolonged Pi soak:** remains deferred after 0.6.0. Observe several-hour/overnight split-provider playback, memory growth, swap, recovery, retained history and request counters. Short successful checks are not a soak.
- **Rainbow billing:** revisit no earlier than November 2026 after a full billing cycle. Snapshot billing and estimates remain conditional until confirmed.
- **Reference hardware and wider installation feedback:** retained seven-day fixture startup was tested, but full long-running collection and independent fresh-install walkthroughs remain useful. Narrow phones receive best-effort layout support; minor attribution overlap may remain.

## Delivered in 0.5.0

Observation-time Live/Archive, per-map gaps and late arrivals, bounded Live borrowing, auto-pause/recovery, 1–24-hour Archive, optional provider names, touch gust choices, widget placement, dock layering, reference-screen Settings layout and inactivity, conditional Rainbow Apply prompt, PIN controls, experimental Stats for nerds, optional PWA metadata, kiosk-specific link warnings and bounded startup validation.

See [playback rules](playback-conventions.md), [validation](validation.md) and the [changelog](../CHANGELOG.md). Speculative Rainbow capabilities and personal screen-sleep work are outside the release backlog.

## Delivered in 0.6.0

Optional Embedded Radar with LAN and Pi-hosted Tailscale/Nabu Casa acceptance, independent weather/forecast and radar health, persistent gap/late counters, compact Stats for nerds, power acknowledgements, daily About release checks, Map API information and reusable development scenarios. The About coffee link now opens the intended destination with the existing kiosk warning.
