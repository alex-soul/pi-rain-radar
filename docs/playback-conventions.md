# Playback terminology and behaviour

| Term | Meaning |
| --- | --- |
| **Live** | Latest 2, 4 or 6 hours of observations; not instantaneous radar. |
| **Archive** | A selected older period, with a temporary 1–24-hour window. |
| **Playback** | Animation and controls in either mode. |
| **History** | Stored observations, retained for seven days. |
| **Provider frame / observation** | One provider's radar at its original observation time. |
| **Capture** | A paired position in playback; it may have one or both provider frames. Legacy captures could repeat older observations. |

## Observation-time playback

Both modes use the best available observations at their original times, independently for Main and Overview. An observation acquired late fills its original position wherever the period remains retained. Repeated cached imagery does not count as a fresh observation. Data no longer offered by a provider cannot necessarily be recovered.

The timeline consists of two touching halves: Main above, Overview below. Every visible position shows actual availability. If one half is missing it shows a gap and makes the total amber, even if all 13 positions in a two-hour window have something playable. Positions missing both halves are skipped without a playback delay.

## Live publication grace and borrowing

The normal endpoint is the preceding ten-minute boundary: at 21:00 it is 20:50. A newer acquired observation advances it immediately. If RainViewer supplies 21:00 while Rainbow only has 20:50, the endpoint becomes 21:00 and Rainbow's half shows a gap immediately. At 21:10, 21:00 enters the window even if both maps are missing. The chosen duration extends backward from the endpoint. This grace does not change acquisition timing or the separate settling preference.

Live may borrow a compatible earlier observation for a missing map for up to 30 minutes. Beyond that, only its basemap is shown. Borrowing does not fill timeline gaps or improve completeness. With fewer than two playable positions, automatic pause waits for recovery; the combined play/pause icon distinguishes it from manual pause. Manual pause stays paused until changed by the user.

## Archive

Archive never borrows: a missing frame leaves that map's basemap visible and its timeline half missing. Late arrivals can fill gaps. Zero/one playable position cannot animate. The temporary duration and provider-name switch reset on return to Live; current weather and Rain forecast remain current.

Source changes retain provenance and geometry isolation. No automatic provider failover, extra API entitlement or unlimited retention is implied. See [upgrade notes](upgrading.md) for legacy conversion limits.
