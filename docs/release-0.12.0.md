# Pi Rain Radar 0.12.0

This pre-release adds Aviation weather and refines the dock and charts. I accepted RC2 on my existing Pi 4 / 2 GB.

- **Aviation:** collect METAR/TAF every five minutes from NOAA Aviation Weather Center. Show complete raw reports together or in separate movable/resizable widgets, with opacity/font controls and explanations for the highlighted code. Archive changes reports when this installation first acquired them, including TAFs received before their validity starts. [Setup and replay](aviation.md).
- **Display defaults:** global units and wind/Sun/Moon formats, with independent **Inherit global** dropdowns under Screen settings → Top dock → Units. Existing 0.11.0 global units survive; the first existing screen seeds wind/Sun/Moon defaults once, then all migrated screens inherit. [Migration details](upgrading.md#0120).
- **Top dock:** common 20px values at 100%, wider Sun/Moon slots, and trend arrows based on the preceding hour. Stable/noisy/insufficient evidence leaves the arrow blank. Wind values always mean FROM; **Wind arrow** independently chooses Blowing towards or Coming from.
- **Weather trends:** TMP, DPT, DPD, WND, GST, HUM, PRS, UVI, VIS and RAC labels with hover/tap explanations and matching editor subtitles. Live values stay latest while the cursor moves. Archive values follow capture and its window takes precedence over the saved Live chart lookback.
- **Less clutter:** closer availability popup, balanced Rain forecast bottom spacing, themed dropdowns/tabs/sliders, and no routine “Saved on this screen” footer.
- **Cloud delay:** green below 40 minutes, amber at 40–under 60 and red from 60. Live cloud borrowing extends to below 40 minutes; radar stays below 30 and Archive never borrows imagery. Original timestamps and gaps remain visible.

Compatible history, keys, PIN, map, browser layout and installed Power/Screen helpers are preserved. Aviation starts disabled on upgrade; fresh installations collect EGBB with the widget hidden. Display conversion does not rewrite source measurements.

RC1 passed all 421 native ARM64 tests, copied-data startup/restart and real NOAA collection checks. RC2's wind correction passed 45 affected tests locally and natively plus startup/restart. These bounded checks and Pi acceptance do not establish longer soak or a fresh-card installer route. The Ludicrous Quick Start's installer pin is updated after the published image is verified; existing saved installer runs retain their selected snapshot/release.

Upgrade using the existing Compose project and volume; preserve any Power/Screen overrides. Follow [upgrade guidance](upgrading.md) and verify that a fixed image pin selects this release before pulling. Observed-rain forecast comparison remains future work.
