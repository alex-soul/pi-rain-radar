# Validation and remaining work

## 0.8.0 release candidate acceptance — 24 September 2026

360 tests passed on Windows and native ARM64. Fresh startup/restart and backup restore checks passed. A copied-data upgrade/restart preserved 6,657 records and 2,433 assets, archive generation and settings. Responsive DEV review covered the accepted controls. I tested RC3 on my Pi and accepted the new features with no obvious issues. These results precede final release CI and published-image handover.

Short Pi checks found no throttling or active swap-in/out during the sample. Docker memory limits are not enforced by this Pi kernel. Neither fact establishes prolonged soak. Cloud freshness remains unchanged pending longer publication-delay observations; see [follow-ups](follow-ups.md).

## 0.7.0 published-image acceptance — 21 September 2026

[Release CI 35634068431](https://github.com/alex-soul/pi-rain-radar/actions/runs/35634068431) passed 275 tests, AMD64/ARM64 builds and fresh-start/restart checks for both architectures. The Pi runs the published image from the normal Compose configuration, preserving settings and archive generation. I confirmed About 0.7.0 and healthy operation after handover. The camera interruption during handover was a local issue, unrelated to the Pi.

Published index: `sha256:956d951ddc589f6a2fa965eeb7bc3a67cf6e80455c581426be3ec07fafe7644f`. Runtime source matches accepted RC3 apart from version metadata. Non-blocking UI observations remain for later review; no new fixes are implied by this acceptance.

## 0.7.0 candidate acceptance — 21 September 2026

I tested RC3 on my Pi 4 / 2 GB and accepted it for release: no major problems found, and everything is working. Non-blocking UI observations will be assessed separately. Prolonged soak remains outstanding.

275 local tests passed. Native ARM64 ran the same suite: 274 passed and one existing cleanup test assumed immediate deletion despite the maintenance time budget. After correcting it to allow bounded maintenance turns, all 24 archive-store tests passed natively; no runtime change was required. Native fresh start/restart, consistent RC2 backup restore and isolated RC3 upgrade/restart passed. Live upgrade retained archive generation, camera identity, credentials and settings.

A synthetic five-year metadata fixture (262,801 records) completed 100 indexed queries in 505 ms with caller event-loop progress; this is not a media-scale benchmark. A short deployed health sample took 4.44–7.78 ms, with 926 MiB available RAM, 61.3°C and no throttling. One sample showed 40 KiB/s swap-in; no swap-out was observed. These are bounded observations, not a no-performance-impact guarantee. Image CI separately verifies AMD64/ARM64 startup and persistence.


## v0.6.0 candidate acceptance — 20 September 2026

- 188 tests passed locally and on native ARM64, plus isolated fresh startup/restart checks. A protected data/browser/host backup was restored into isolated copies; candidate → 0.5.0 → candidate opened retained history with 1,337 protected settings/capture/history files unchanged. Older writers may discard new incident counters; retain the backup for rollback.
- I accepted the new UI on my Pi 4 / 2 GB, including Stats for nerds, About and the Map API tab. I tested the Pi-hosted HA embed on LAN and through Nabu Casa outside the LAN with Tailscale connected. HTTPS worked; the HTTP embed through HTTPS Home Assistant failed as expected. See the [embed guide](embed.md).
- I tested reboot and shutdown followed by power-up, including popups, offline/red indicators and automatic kiosk/remote recovery. Remote playback continued with loaded captures while the Pi was offline. Settings and incident counters survived; both radar providers and weather recovered without errors.
- Short resource samples showed approximately 845–968 MB available RAM, 56–58.4 C and no throttling; a ten-second sample after the HA test showed 83–97% CPU idle and no swap traffic. Node RSS samples were approximately 157–237 MiB. These samples do not establish per-viewer cost or prolonged stability. Docker memory accounting/limits remain unavailable on this host, so host/process measurements were used.
- Retained-copy readiness with one CPU allocated was 28.8 seconds for the candidate, 20.7 for 0.5.0 and 23.0 for the candidate again. These are application startup samples, not whole-Pi boot timings or guarantees.

[Release CI 35477330205](https://github.com/alex-soul/pi-rain-radar/actions/runs/35477330205) passed tests, AMD64/ARM64 builds and startup/restart persistence on both architectures. Published v0.6.0 and latest resolve to index `sha256:930b8aa5fb8a50626e56ed9fb3aabbf77a3506e12be8a8d0ba061f0e094dad3b`; anonymous manifest access passed. The Pi returned to this published image using ordinary Compose plus its power helper, preserving settings, history, counters and HTTPS embed origins. I confirmed About 0.6.0 and normal Pi/HA appearance after handover.

## v0.5.0 candidate acceptance — 18 September 2026

- RC.6 passed all 160 tests locally and on native ARM64, plus network-isolated fresh startup/restart checks. Coverage includes observation migration, late arrivals, one/two-provider gaps, Live grace, offline aging, Archive truth and PIN sessions.
- I accepted the final Live behaviour and reviewed the UI on my Pi 4 / 2 GB: delays are visible and understandable. Archive was tested in an earlier candidate and its behaviour was unchanged by the final Live correction.
- I tested remote 24-hour Archive at full speed with all widgets maximized. A short Pi sample had 845–858 MiB available RAM, CPU usually 4–14% with an acquisition burst to 67%, negligible swap traffic, 56–59 C and no throttling. This does not establish Pi-local 24-hour rendering performance or prolonged soak.
- A seven-day synthetic history with 2,018 PNGs reached health in 71 seconds on initial conversion and 27 seconds on restart. It repeats real image content to test file count and validation work, not weather diversity. Existing migrated history also remained readable by 0.4.1.
- Settings and original capture indexes were preserved across candidate installs. Real split-provider acquisition, weather and optional power helper remained healthy. The final candidate was installed without a new backup at my request; earlier protected recovery assets were retained.
- Windows Chrome and Android Chrome installed the Tailscale-served development preview. Pi-hosted HTTPS was subsequently verified from Windows, and I confirmed the installed Android app over Wi-Fi and mobile data plus switching away and returning. I then rebooted the Pi remotely through Settings: the kiosk, backend, power helper and trusted Tailscale HTTPS recovered, while the remote app kept playing loaded images. Prolonged soak remains deferred. Narrow-screen layout is best effort.

[Release CI 35392991827](https://github.com/alex-soul/pi-rain-radar/actions/runs/35392991827) passed the suite, AMD64/ARM64 image builds and fresh startup/restart checks on both architectures, then promoted v0.5.0 to latest. Both tags resolve to index digest `sha256:b94397562e41da52d1769a76a043683bbb6e0dd4603f85cbbce56802103a908e`; anonymous manifest access passed. Published-image handover completed with settings/history preserved, and I confirmed About 0.5.0 and normal playback/UI on the Pi.

## v0.4.1 naming patch — 18 September 2026

- The 0.4.1-rc.1 candidate passed visual/touch review on my Pi, including Rain forecast toggle and retained widget placement, size and button order.
- 120 tests passed locally and on native ARM64. The parallel Pi run hit an existing two-second radar test timeout; all 120 passed sequentially. Offline image startup/restart passed on ARM64.
- Both radar sources and OpenWeather were healthy after installation. Keys, PIN, map and provider settings matched the pre-upgrade backup.
- This is a naming and browser-preference migration patch; acquisition and playback behaviour are unchanged. It adds no prolonged-soak claim.


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
