# Release follow-ups

## Known fixes for a future release

- **About: Buy me a coffee link.** In 0.5.0 the button incorrectly opens the GitHub repository. Change its destination to [buymeacoffee.com/alexsoul](https://buymeacoffee.com/alexsoul), preserving the separate View on GitHub link and kiosk-only external-link warning. Confirmed in `public/index.html`; tracked only, not fixed in the running release.
## Remaining validation

- **Prolonged Pi soak:** deferred until after 0.5.0. Observe several-hour/overnight split-provider playback, memory growth, swap, recovery, retained history and request counters. Short successful checks are not a soak.
- **Rainbow billing:** revisit no earlier than November 2026 after a full billing cycle. Snapshot billing and estimates remain conditional until confirmed.
- **Tailscale reboot persistence:** Pi-hosted HTTPS and Android Wi-Fi/mobile-data/background-return checks passed. A Pi reboot after Serve setup remains untested; the service is enabled and Serve uses its persistent background configuration.
- **Reference hardware and wider installation feedback:** retained seven-day fixture startup was tested, but full long-running collection and independent fresh-install walkthroughs remain useful. Narrow phones receive best-effort layout support; minor attribution overlap may remain.

## Delivered in 0.5.0

Observation-time Live/Archive, per-map gaps and late arrivals, bounded Live borrowing, auto-pause/recovery, 1–24-hour Archive, optional provider names, touch gust choices, widget placement, dock layering, reference-screen Settings layout and inactivity, conditional Rainbow Apply prompt, PIN controls, experimental Stats for nerds, optional PWA metadata, kiosk-specific link warnings and bounded startup validation.

See [playback rules](playback-conventions.md), [validation](validation.md) and the [changelog](../CHANGELOG.md). Speculative Rainbow capabilities and personal screen-sleep work are outside the release backlog.
