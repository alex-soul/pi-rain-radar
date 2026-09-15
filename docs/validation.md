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

## Next validation

- Observe sustained playback CPU/memory, temperatures and storage growth, including a retained seven-day archive.
- Exercise browser exit/relaunch and controlled network loss/recovery on the Pi.
- Check automatic browser refresh during the next version upgrade while preserving display preferences.
- Review beginner guide feedback from another fresh installation, ideally by someone unfamiliar with Linux.

The complete flash-to-kiosk route was rehearsed manually; the later published-image route was tested through CI fresh starts and a real-Pi migration. It has not been independently repeated from a newly flashed card end to end. A full reinstall is optional validation, not a prerequisite for using or updating the working appliance.

## Scope for the next iteration

Keep rain as the focus. Optional future ideas live in [design](design.md#future-enhancements); they are not commitments for this baseline. Private host preferences, power-saving experiments and other personal stack integrations belong outside the public product repo. The beginner baseline keeps the screen on continuously.

Docs-only edits do not need an image release. App releases should bump the package version, pass the release workflow and update this evidence when new hardware results are available.
