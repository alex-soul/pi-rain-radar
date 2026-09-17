# Validation and remaining work

This is the public handover point for the working appliance baseline. Runtime source is authoritative; the user-facing behaviour is described in the [manual](manual.md), with implementation detail in [design](design.md).

## Baseline: v0.1.2

| Area | Evidence | Limit |
| --- | --- | --- |
| Automated regression suite | 66 tests passed on Windows and Linux release CI | Synthetic providers and lightweight DOM adapters do not replace full browser checks |
| Published images | ARM64 and AMD64 images built; anonymous registry access verified | ARM64 CI smoke runs under emulation |
| Fresh image startup | Offline startup, rendered page/version and data persistence over restart checked on both architectures | First live-provider acquisition covered separately by the Pi walkthrough |
| Raspberry Pi install | Pi 4 2 GB, 7-inch Touch Display 2; 64-bit Trixie/labwc; SSH, updates, landscape and touch confirmed | Other hardware/OS combinations not established by this walkthrough |
| Kiosk | Automatic reboot startup, saved preferences and removal of keyring prompt confirmed | Forced browser-crash recovery and prolonged idle operation not yet measured |
| LAN / multiple screens | Laptop access, shared configuration and independent buttons/layouts confirmed | Maximum concurrent clients not measured |
| Map change | Another location and return to Coventry; preparation/frame-count popup confirmed; user compared visible radar with RainViewer | Visual agreement at those times is not a coverage/completeness guarantee |
| OpenWeather | Key setup from laptop and readings after location-change cooldown confirmed; waiting hint visible | Requires each user's own eligible key and local provider coverage |
| Upgrade | Source build migrated to published ARM64 v0.1.2; reboot and retained configuration confirmed | Future version-to-version browser auto-reload is logic-tested, not yet checked through a later Pi release |

## v0.2.0 release validation

Development candidate (16 September 2026): One Call 4.0-only integration has 72 passing Windows/Linux tests, including independent endpoint failures, legacy normalized-cache migration, request budgets, stale in-flight responses and safe errors. Isolated browser checks passed at 1280 × 720 in both themes and at 390 × 844 with synthetic current/forecast data and the application CSP. A saved key with a 4.0 subscription returned HTTP 200 for both live endpoints (one current record and 60 minute records). All 72 tests also passed natively on ARM64 with networking disabled. The candidate application completed its scheduled 4.0 refresh on a Pi 4 2 GB: both endpoints succeeded, 60 forecast minutes rendered, and saved key/PIN/map configuration and radar history were retained. I confirmed the visible changes and working OpenWeather integration on 16 September. I also removed the API settings subtitle to keep the panel compact. Published-image CI and installation checks are recorded separately below.

Published v0.2.0 at source 8b2bdee passed [release CI](https://github.com/alex-soul/pi-rain-radar/actions/runs/35093528794), including tests and fresh startup/data persistence checks on AMD64 and ARM64, then promoted to latest. The Pi was returned to the published ARM64 image with its development override removed. Verified version 0.2.0, healthy process, 13 radar frames, retained current/minute data and unchanged saved key/PIN/map files. Served HTML includes the new version and omits the removed subtitle. I subsequently confirmed About showed 0.2.0 on the published image.

## v0.3.0 candidate validation — 16 September 2026

All 97 tests passed on Windows and natively on ARM64. The native candidate passed isolated fresh-start and restart/persistence smoke checks. Synthetic browser review covered settings, both themes, compact layouts, UI lock, diagnostics, and missing-frame playback. I accepted the RC after running the six-hour window at full speed with no noticeable performance penalty.

On the reference Pi 4 / 2 GB, a 20-second sample during that playback showed 7–13% aggregate CPU use, about 876 MiB available RAM, no swap-in/out, 53.5°C and no throttling. Chromium proportional resident memory was about 515 MiB; backend processes about 156 MiB. The container was healthy with zero restarts/OOM events and successful scheduled radar/weather updates. Existing key/PIN/map files were unchanged, and the archive supplied complete 13/25/37-frame windows.

These are short observations, not a completed multi-hour soak or proof of leak-free operation. The host kernel does not enforce Docker memory limits; resource assessment uses host/process measurements. [Release CI 35146632588](https://github.com/alex-soul/pi-rain-radar/actions/runs/35146632588) passed both architecture builds and startup/restart checks, then promoted v0.3.0 to latest. The reference Pi returned to that published image using base Compose only; key/PIN/map/radar settings and history were retained. I confirmed About showed 0.3.0 after handover.

## Next validation

### 0.4.0 candidate

116 tests passed on Windows and natively on ARM64, with four additional native Python helper tests. Network-isolated ARM64 startup/restart checks passed. I accepted the candidate UI on my Pi 4 / 2 GB, with RainViewer on Main map and Rainbow on Overview, and tested both Restart and Shutdown followed by power restoration. Keys, PIN, map settings and provider selection survived; both providers, weather and helper recovered.

I also selected six-hour playback at full speed and found it smooth. A short resource sample showed 8–14% CPU, about 779 MiB available RAM, no active swapping, 56°C and no throttling. This was not six elapsed hours of soak. Prolonged soak is deferred to the next release in [follow-ups](follow-ups.md). [Release CI 35244771382](https://github.com/alex-soul/pi-rain-radar/actions/runs/35244771382) passed both architecture builds and startup/restart checks, then promoted v0.4.0 to latest. The reference Pi is healthy on the published image with both providers, weather and the power helper connected; settings checksums match before and after the update. I confirmed About shows 0.4.0 on the Pi after the published-image update. User-facing status meanings are maintained in [indicators](indicators.md).

- Observe sustained playback CPU/memory, temperatures and storage growth, including a retained seven-day archive.
- Exercise browser exit/relaunch and controlled network loss/recovery on the Pi.
- Check automatic browser refresh during the next version upgrade while preserving display preferences.
- Review beginner guide feedback from another fresh installation, ideally by someone unfamiliar with Linux.

The complete flash-to-kiosk route was rehearsed manually; the later published-image route was tested through CI fresh starts and a real-Pi migration. It has not been independently repeated from a newly flashed card end to end. A full reinstall is optional validation, not a prerequisite for using or updating the working appliance.

## Scope for the next iteration

Keep rain as the focus. This repository documents implemented behaviour and known validation gaps; speculative enhancements are not a public release commitment. Private host preferences, power-saving experiments and other personal stack integrations belong outside the public product repo. The beginner baseline keeps the screen on continuously.

Docs-only edits do not need an image release. App releases should bump the package version, pass the release workflow and update this evidence when new hardware results are available.
