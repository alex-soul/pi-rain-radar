# Playback terminology and agreed behaviour

Use these terms in new product documentation, UI work and implementation discussions. This is the canonical naming convention, agreed on 17 September 2026.

| Term | Meaning |
| --- | --- |
| **Live** | Playback of the latest 2, 4 or 6 hours, with the window advancing as time passes. It does not mean instantaneous radar observations. |
| **Archive** | Playback of a selected older period. This is the agreed replacement for the current **History** UI label. |
| **Playback** | The animation and its controls in either mode. |
| **History** | Stored radar observations generally, including recent observations used by Live. It is not the name of a separate playback mode. |
| **Provider frame / observation** | Radar data belonging to a provider's observation time. |
| **Capture** | A saved combination of displayed map images in the 0.4.0 implementation. A capture can reuse older observations; it is not proof of fresh data. |

## Agreed next-release behaviour

Both Live and Archive should replay the best available observations for their selected period, including observations acquired or recovered later. Place each image at its observation time, not its download time or the time it first appeared on screen. Apply this independently to Main and Overview, including mixed providers.

For example, if the 14:10 observation arrives at 14:20, add it at 14:10 wherever that period is still retained. Live includes it if it is within the selected window; Archive includes it when that period is selected. A missing observation remains a gap until usable data for that time is acquired. Repeating an older cached image must not count as a fresh observation or hide the missing data.

This supersedes the earlier decision that History must reproduce exactly what appeared on screen. Previously unseen or recovered observations are useful and must not be excluded simply because they were unavailable at the original display time.

This does not promise recovery of data that providers no longer offer, unlimited retention, extra API entitlement or automatic provider failover. The implementation must respect existing request limits and resource constraints.

## Current release boundary

**0.4.0 has not implemented this change.** Its UI still says History. Both playback modes use captured combinations, which can repeat cached images during provider failures. Its timeline gaps and total count describe captures, not completeness of provider observations. See [current design](design.md#captures-and-playback).

Implementation, migration, mixed-map gap/count presentation and repository-wide naming alignment are tracked in [release follow-ups](follow-ups.md#live-and-archive-playback).
