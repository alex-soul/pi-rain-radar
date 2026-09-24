# 0.8.0-rc.2 candidate

> Historical candidate record. Superseded by the [published and accepted 0.8.0 release](release-0.8.0.md); statuses below describe that candidate checkpoint, not the current deployment.

24 September 2026: DEV UI accepted; native build, isolated restore/upgrade proof and Pi installation passed. I confirmed About 0.8.0-rc.2 and the initial skim tests passed. Multi-day soak is in progress. This is not a published image.

## Changes

- Rain/cloud layers, per-layer availability and chronological forecast comparison. NOW bars use each saved OWM capture's first point, with earlier forecasts aligned to the same target time. Sampling gaps remain distinct from zero rain and missing expected data. Comparison ends at −50 minutes; this measures forecast changes, not observed rainfall.
- Ten HA source readings, compatible-unit validation, independent current-weather/forecast collection and mixed-source T−Td. Optional gust has its own status but cannot turn aggregate weather health amber.
- Centred playback and aligned gap cells, stable frame counters/date widths, phone layouts, clearer helper text and attribution. Playback controls do not dismiss an open gaps popup.
- Speeds 0.5×/0.75×/1× then half-steps to 10×. Ordinary timing is 650ms at 1×; final-frame multiplier defaults to 2.4× (1560ms), with 1×–5× choices in 0.2 steps. Both durations scale with speed. Existing preferences remain; absent hold settings get 2.4×.
- Archive Close keeps playback position/state and comparison choices; Replay applies the selected window. Historical weather always preserves recorded sources/units.
- Name-only camera edits retain the connection without preview; blank names are allowed. Historical names remain immutable. Connection replacement still validates.
- Routine cloud/camera successes no longer fill the 25-event log; warnings and a single usable recovery remain. Actual request/tile/budget counters remain available; speculative estimates are removed.

See the [manual](manual.md), [provider costs and limits](radar-providers.md) and [changelog](../CHANGELOG.md).

## Validation and limits

334 Windows tests passed before the documentation/version-only freeze. DEV acceptance includes desktop, medium and phone layouts, both themes, mixed HA/OpenWeather values, synthetic camera and retained real OWM light-rain captures. Synthetic services are not evidence of real HA/camera reliability or Pi performance. Heavy-rain behavior and native performance still need the Pi soak. Cloud observations lagged by roughly 21–23 minutes during RC1 investigation; the exact upstream cause remains unproven, and missing frames are not fabricated. One full month of actual Rainbow costs remains outstanding.

## Upgrade and recovery

Existing compatible 0.7.0/RC1 archives and settings are intended to be preserved. The older pre-0.7 archive reset remains as documented in [Upgrading](upgrading.md). Before installing this candidate, retain the exact RC1 image/configuration and make a consistent stopped-writer backup of current data and browser profile. Prove restoration and upgrade against isolated copies first; retain the compatible pre-upgrade data for rollback. Never substitute generic latest-image upgrade commands while using a local candidate override.

Native ARM64 validation: 334 tests passed; fresh/restart, RC1 restore and RC2 upgrade/restart passed. Upgrade checks preserved 5,069 records and 1,791 image assets. Settings and usage counters survived installation. See [deferred findings](follow-ups.md#after-080) for non-blocking observations parked beyond 0.8.0.
