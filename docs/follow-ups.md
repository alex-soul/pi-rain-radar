# Release follow-ups

## Next release — weather status

- **OpenWeather reports “Some readings unavailable” when solar irradiance comes from Home Assistant.** I saw this on 0.15.0 while the weather dock LED was green and my Tempest station was supplying irradiance through Home Assistant. The OpenWeather status check incorrectly counts the Home Assistant reading as an expected OpenWeather field. Scope provider health to the readings assigned to that provider. Verify that the warning clears when OpenWeather supplies all its required readings, and still appears when a required OpenWeather reading is missing.
- **Show which weather readings need attention.** Add a tappable information icon next to weather status warnings. Open a bubble that names each affected reading and explains why it is unavailable or degraded, such as a reading the source did not report, stale data or a retained value after a failed refresh. Include affected readings hidden from the top dock. Use the same reading health results for the summary and the bubble so they agree, and verify that provider-specific details reflect the corrected provider scope.

## 0.15.0 — published and accepted

I accepted the published 0.15.0 image on 16 November 2026. There are no outstanding implementation or acceptance items in this release; the validation and exploratory work below belongs to future work. The GIF playback track fix, Aviation/Grass integration status, official Aviation provider status link and concise current-only Stats are delivered. [Grass Lab](grass-lab.md) adds direct observations, editing, 30-day experimental replay, heatmaps and chart navigation. Forecast gradients show absolute rain intensity while retaining automatic axes. The earlier deferred descriptions below are historical context, superseded for these selected items. See [release notes](release-0.15.0.md) and [published-image validation](validation.md).

## After 0.14.0

- **GIF playback slider track:** resolved in 0.15.0.
- **Grass observation and tuning:** continue comparing the 0–5 estimate with conditions outside using the Lab. New installations use my tuned starting profile; upgrades preserve saved factors. Follow the [tuning guide](grass-wetness.md#how-to-tune-it). General accuracy across locations and automatic fitting remain unverified/deferred.
- **Native-touch fresh installation:** the default-Yes/No installer choice has automated coverage, but its fresh-card physical walkthrough is explicitly deferred. Verify both choices, touch alignment, reboot/resume and preservation on supported hardware before calling that path accepted. Existing-appliance native touch acceptance is separate evidence.

## Aviation status and diagnostics — delivered in 0.15.0

The original proposal is complete: current Aviation status in the menu, the official provider status link, and compact current-only METAR/TAF diagnostics. Grass status and numerical stats are also delivered. See [Stats for nerds](stats-for-nerds.md) and [release details](release-0.15.0.md). No extra diagnostics subsystem is committed.

## After 0.12.0 (historical)

I accepted RC2 on my Pi. Aviation, per-screen unit inheritance, one-hour dock trends, compact chart legends, cloud 40/60-minute freshness and cloud-only borrowing below 40 minutes are delivered. See [release notes](release-0.12.0.md). The observed-rain/forecast comparison was subsequently delivered and accepted in 0.14.0; real rainy-interval source validation remains separate. Retain the dock and chart-value playgrounds for later reuse.

## After 0.11.0 (historical)

I accepted the published 0.11.0 image on my Pi and phone. Consolidated screen settings, consistent dock spacing, optional rain readings/units, compact trend min/max legends and the transient connection-warning recovery fix are delivered. See [release notes](release-0.11.0.md).

These follow-ups inform future release planning; no next version or implementation is assigned. The comparison UI is delivered; source validation and reusable development tooling remain separate.

- **Observed-rain validation during rainfall:** verify the corrected daily accumulation helper against consecutive source rainfall amounts over a real rainy interval. Acquisition and restart persistence passed; wet-weather accuracy remains unproven. A manual-reset day is partial, and inherited totals from the earlier helper are unsuitable for evaluation. See [observed rain](observed-rain.md) for the source and reset requirements.
- **Archive forecast reliability:** The accepted 0.14.0 release replaced forecast-versus-forecast comparison with a stable forward-forecast view and an observed interval-average overlay. Original snapshots, raw totals, acquisition/report times and unknown boundaries remain intact. See [observed rain](observed-rain.md). The comparison UI is accepted; real rainy-interval helper validation remains pending; no accuracy score, calibration or automated source selection is implemented. The old advanced lead-time comparison is not retained.
- **Development studio review:** retain the dock tuning tool for specific future needs. Keep the studio lean; no routine playground build/deployment or ongoing expansion is required. Review the accumulated reusable material separately when needed.
- Fresh portable installer/reboot validation and longer soak/cloud/storage/hardware observations remain open below. This app release does not close those gaps.

## After 0.10.0 (historical)

I accepted the published 0.10.0 image with all functions working and full MQTT synchronization. Astronomy motion, flexible widget resizing/font controls, direct dock/button ordering, map-label density, local Screen controls and the agreed UI refinements are delivered. See [release notes](release-0.10.0.md).

- **Fresh portable installer and reboot validation:** explicitly deferred for 0.10.0. The changed local-controller/Screen bridge route remains experimental. On a spare supported card/device, verify orientation/touch, saved-stage resume, kiosk/controller/bridge startup after reboot, brightness/sleep/wake without MQTT, optional MQTT synchronization and persistence. Preserve the existing working card. Earlier Pi 5 walkthrough and private-controller upgrade acceptance do not validate this combination.
- Longer soak, cloud-delay observations, wider hardware coverage and the remaining validation below stay open. No additional UI implementation is currently scoped.

## After 0.9.0 (historical)

The published 0.9.0 image was accepted; its subsequent UI refinements were delivered in 0.10.0. Longer validation items continue below.

## Delivered in 0.9.0

- **First-launch layout:** fresh browsers start with the clock first and open, the agreed button order and dark theme. Existing saved layouts are preserved.
- **Cold-start loading feedback:** initial acquisition progress is shown and covered by cold-start checks; cached startup/restart and map-change handling were reviewed. The original Pi 5 observation prompted this work but does not establish independent Pi 5 acceptance of this release.
- **Stats for nerds:** the six-group layout, Clouds/Camera detail, resize range and opacity editor were delivered and accepted. Further redesign is not currently scoped.

See [release notes](release-0.9.0.md) and [validation](validation.md).

## After 0.8.0

I accepted RC3 after Pi skim tests: no obvious issues and all new features behaved as expected. Future UI refinements are non-blocking and will be recorded once supplied.

- Cloud publication-delay review informed the delivered 0.12.0 thresholds: amber at 40 minutes, red at 60, and cloud-only Live borrowing below 40. Continue ordinary observation; gaps and original image timestamps remain honest. Further threshold tuning needs new evidence.
- Continue longer Pi soak, including memory/swap, recovery and retained history. Short successful checks are not prolonged soak.

The RC2 camera-label alignment, 24-hour counter spacing and shared Rainbow API limit placement were addressed in 0.8.0. No threshold change was included in 0.8.0; the later adjustment is recorded above.

## After 0.7.0

I tested RC3 on my Pi: no major problems found, and everything is working. A few non-blocking UI tweaks will be recorded here once the observations have been fully reviewed and assessed. No individual changes are scoped yet.

- Multiple-camera collection remains a future decision; this release supports one camera.
- Direct Tempest integration remains deferred pending provider clarification. OAuth, including callbacks for independently hosted installations, belongs to that future work. Generic HA sensor mapping is available now; it does not override upstream terms.

## Delivered in 0.7.0

Rolling SQLite archive, shared retention and storage status; historical weather/forecast/camera replay; one camera with direct/HA onboarding; shared HA and generic sensor mappings; source/unit/fallback provenance; collection controls; reorganized Settings and dynamic attribution. The earlier embed address example, RainViewer credit wording and displayed-frame time items are implemented.

## Long-term possible improvements

- **Complete remote appliance management over MQTT — important future direction:** investigate replacing the current custom Device Power helper installation/interface with a properly secured MQTT adapter. Restart and shutdown are only the starting point: the intended direction is a coherent management interface for brightness, screen wake, backup creation and restore, app update checks and installation, status/diagnostics, and other appliance controls as needs emerge. Aim for routine operation and maintenance through Home Assistant or the kiosk app without a keyboard, mouse or SSH terminal. The 0.10.0 Screen bridge already shares display settings with optional MQTT; broader power/update/backup management remains separate. Consider one optional installation with MQTT discovery and shared host-control logic behind both interfaces. Keep recovery access available for failures; the goal of remote management does not assume every recovery can be performed remotely.

  MQTT carries requests; a narrowly privileged local executor is still required, even if packaged with the adapter. Preserve or strengthen action allowlists, authorization, request expiry, replay protection and cooldowns; design dedicated broker identities/topic permissions, verified encrypted transport, non-retained action commands and explicit confirmation/automation policy. Do not silently bypass the app's PIN or give the adapter unrestricted shell access. Design progress/results, errors and retry behaviour for longer operations, and an appropriate secure transfer/storage path for backup artifacts rather than assuming they belong in MQTT messages. Keep standalone operation available while evaluating expected Home Assistant adoption. Research architecture, migration from existing installations and failure/recovery behaviour before implementation; this is a product direction, not a change to current controls or a commitment to a release.
- **Appliance management from kiosk Settings:** local brightness and automatic sleep settings are delivered in 0.10.0 with optional MQTT synchronization. User-initiated backup/restore and checking for/installing app updates without leaving the app remain exploratory. Build on the existing About release checks where appropriate. Research supported hardware and host-helper permissions, backup contents (including settings, credentials and optional history), restore compatibility, and update verification/recovery before scoping implementation. Keep controls touch-friendly and distinguish application updates from host OS maintenance. These are exploratory product ideas, not committed release scope.

## Remaining validation

- **Prolonged Pi soak:** remains deferred after 0.6.0. Observe several-hour/overnight split-provider playback, memory growth, swap, recovery, retained history and request counters. Short successful checks are not a soak.
- **Rainbow billing:** revisit no earlier than November 2026 after a full billing cycle. Snapshot billing and estimates remain conditional until confirmed.
- **Reference hardware and wider installation feedback:** retained seven-day fixture startup was tested, but full long-running collection and independent fresh-install walkthroughs remain useful. Narrow phones receive best-effort layout support; minor attribution overlap may remain.
- **Host memory-limit enforcement:** verify that the host exposes the required cgroup memory controller and Docker actually enforces configured limits before relying on them. Review any host boot changes separately, preserve the working appliance and choose limits from measured application, browser and host needs. Short release checks do not establish sustained memory behaviour.

## Delivered in 0.5.0

Observation-time Live/Archive, per-map gaps and late arrivals, bounded Live borrowing, auto-pause/recovery, 1–24-hour Archive, optional provider names, touch gust choices, widget placement, dock layering, reference-screen Settings layout and inactivity, conditional Rainbow Apply prompt, PIN controls, experimental Stats for nerds, optional PWA metadata, kiosk-specific link warnings and bounded startup validation.

See [playback rules](playback-conventions.md), [validation](validation.md) and the [changelog](../CHANGELOG.md). Speculative Rainbow capabilities and personal screen-sleep work are outside the release backlog.

## Delivered in 0.6.0

Optional Embedded Radar with LAN and Pi-hosted Tailscale/Nabu Casa acceptance, independent weather/forecast and radar health, persistent gap/late counters, compact Stats for nerds, power acknowledgements, daily About release checks, Map API information and reusable development scenarios. The About coffee link now opens the intended destination with the existing kiosk warning.
