# Playback terminology and behaviour

| Term | Meaning |
| --- | --- |
| **Live** | Latest 2, 4 or 6 hours of observations; not instantaneous radar. |
| **Archive** | A selected older period, with a temporary 1–24-hour window. |
| **Playback** | Animation and controls in either mode. |
| **History** | Stored observations, with shared rolling retention (seven days by default). |
| **Radar frame / observation** | One provider's radar at its original observation time. |
| **Capture** | A playback position combining available radar frames and associated weather/camera data. |
| **Camera snapshot** | One still image collected from the configured camera. |
| **Camera collection** | Backend acquisition of camera snapshots, independent of showing the widget. |
| **Screenshot** | An image of the rendered screen. |

## Observation-time playback

Both modes use the best available observations at their original times, independently for Main and Overview. An observation acquired late fills its original position wherever the period remains retained. Repeated cached imagery does not count as a fresh observation. Data no longer offered by a provider cannot necessarily be recovered.

Playback and the availability popup share ten-minute positions. The popup groups Rain, Clouds, Weather and Camera when applicable, with Main/Overview details inside the map-layer cells. Reused observations are amber; missing expected data is red; pending/disabled/unknown states remain distinct. The total reflects the worst applicable state, independently of operational freshness LEDs. Positions with no playable radar on either map are skipped by animation, while the popup retains their slots. See [indicators](indicators.md#5-frame-gaps).

## Live publication grace and borrowing

The endpoint is the clock rounded down to a ten-minute boundary after subtracting five minutes: at 21:03 it is 20:50; at 21:05 it becomes 21:00. Newer provider observations do not advance this endpoint. Only its newest missing slot is pending; older missing slots are gaps. The chosen duration extends backward from the endpoint. This grace does not change acquisition timing or the separate settling preference.

Live may borrow a compatible earlier observation for a missing map for less than 30 minutes. Beyond that, only its basemap is shown. Borrowing does not fill timeline gaps or improve completeness. With fewer than two playable positions, automatic pause waits for recovery; the combined play/pause icon distinguishes it from manual pause. Manual pause stays paused until changed by the user.

## Archive

Archive never borrows: a missing frame leaves that map's basemap visible and its timeline half missing. Late arrivals can fill gaps. Zero/one playable position cannot animate. The temporary duration and provider-name switch reset on return to Live; weather, Rain forecast and camera snapshots follow the historical position. Manual Live scrubbing changes radar only; Live widgets stay current.

Source changes retain provenance and geometry isolation. Radar has no automatic provider failover. HA-assigned weather readings can use optional OpenWeather fallback. Retention remains bounded by available storage. See [upgrade notes](upgrading.md) for the fresh-archive boundary.

Rain forecast and camera matching look back at most ten minutes, never ahead. Missing matches stay gaps; attribution still applies to expected missing data. Qualify provider-specific uses such as a Rainbow API snapshot or forecast snapshot; do not call a camera snapshot a screen capture.
