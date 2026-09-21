# Stats for nerds

Stats for nerds is an optional view of acquisition, playback coverage and local API usage. It helps explain what the radar is doing without having to watch every update.

Enable its button under **Settings → Interface → Buttons**, then open the draggable/resizable widget. Its placement belongs to the current browser. It uses the app's existing status data and needs no additional provider requests or host permissions.

This page is the reference for the widget’s metrics and limitations. See [screen indicators](indicators.md) for colours elsewhere in the UI and [playback conventions](playback-conventions.md) for Live, Archive and grace rules.

The widget and persistent incident counters shipped in 0.6.0 without an experimental label. Reboot and shutdown/power-up tests retained real incident counts while current availability continued to change independently. Use the [scenario studio](development.md#reusable-scenario-studio) for repeatable local review; production still preserves honest partial and untracked history.

## Current metrics

### Backend connection

The connection summary describes the browser's connection to the radar server, not the server's connection to each provider. Before receiving status it shows a waiting state. Failed connectivity or status more than 45 seconds old is marked unreachable/stale; previously received details can remain visible below it.

That 45-second status age is separate from the radar observation's 30-minute freshness threshold. An animated cached image does not prove either connection is healthy.

### Main and Overview acquisition

Main, Overview and OpenWeather have separate columns. Each radar column identifies its current provider.

| Field | Meaning |
| --- | --- |
| Acquisition | Fetching, Problem, Ready, Stale observation or Waiting, based on current acquisition state. |
| Latest observation | The newest observation timestamp and its age, not the currently animated frame's timestamp. |
| Last check | The most recent reported acquisition check. A check need not produce a new observation. |
| Next check (estimate) | The expected next check, not a guarantee that the provider will offer a new frame. |
| Settling · eligible check | Shown while an observation is waiting under the separate settling policy. This is not Live publication grace. |

These acquisition details stay current while browsing Archive. They describe the currently selected providers; older archive observations can have different provider provenance.

### Selected-window coverage

The heading identifies Live or Archive, its duration and endpoint. Main and Overview each report:

- **Available:** observation slots with usable imagery for that map in the selected window.
- **Missing:** slots without that map's observation.

A position can have Main available and Overview missing, or vice versa. Live's borrowed imagery does not turn a missing observation into an available one. A late arrival can fill a gap and improve these counts. Gaps seen and Late arrivals retain that incident evidence after recovery.

### OpenWeather

The widget shows the last successful current-weather and forecast fetch times separately, the next attempt, and a Fetching/Problem/Ready summary. No key produces Not configured.

Fetch time is not observation time. The current summary primarily reflects fetching/errors; it is not a complete field-by-field freshness assessment. Use the [weather indicator guide](indicators.md#1-top-dock-indicator) and visible readings/forecast alongside it. These acquisition metrics remain current during Archive playback; the weather and Rain forecast widgets replay their historical content.

### Rainbow local monthly counts

Monthly usage appears once under the Rainbow column (Main if both use Rainbow), and is hidden when neither view uses Rainbow. Requests and tiles are local counters for the displayed month. They are not authoritative billing totals or independent measurements from Rainbow. See [provider setup and usage assumptions](radar-providers.md).

## Gap history and late arrivals

These two diagnostics preserve information that current availability counts lose after recovery. They do not alter playback, acquisition, settling or provider requests.

| Counter | Meaning |
| --- | --- |
| Gaps seen | Distinct missing timeline slots, including those exposed during grace when the other map advances the endpoint. Recovery does not erase the count. |
| Late arrivals | Distinct observations first usable locally after their normal publication-grace deadline. Arrivals within grace do not count. |

For a 21:00 observation with a normal 21:10 deadline:

- A gap exposed early and filled at 21:07 contributes one gap, no late arrival.
- A gap filled at 21:13 contributes one gap and one late arrival.
- A slot still missing contributes a gap, but no late arrival until it arrives.

The counters overlap; do not add them together as a total. The display reports them separately for Main/Overview with provider context, alongside availability in the selected window. Each slot counts once regardless of repeated checks, animation loops or open browsers. Counts leave a rolling window when their observation timestamps leave it.

Tracking runs in the backend without a browser left open and retains evidence across ordinary restarts within the configured shared retention (seven days by default). It begins for new observations after tracking/provider activation; imported history and unobserved downtime are not assumed clean. Incident tracking reports tracked slots and marks partial coverage or Untracked. Existing observations without reliable arrival/gap evidence cannot be retrospectively classified as on-time or late. Archive coverage can report only evidence actually retained; opening an old window must not manufacture gap events.

These measure local availability, not provider fault. Provider publication timing, polling, connectivity and deliberate settling can all contribute to when a frame becomes usable.

## Further refinements

- Refine the widget's layout, labels and readability as the metrics develop; no specific UI redesign is committed yet.
- Keep definitions and examples here up to date as behaviour changes.
- Keep current acquisition health distinct from selected-window coverage and historical incidents.
- Preserve honest unknown/untracked states rather than presenting missing evidence as zero.
- Keep the widget lightweight and separate from the diagnostic Log; it is not an additional acquisition or monitoring service.

## Camera timestamps

The Camera acquisition details remain current in Live and Archive. **Timestamps · Metadata / Acquisition** counts camera snapshots in the selected playback window, following the same Live/Archive scope as window coverage. It does not count the entire retained archive. Metadata means a usable image timestamp; acquisition means the appliance's receipt time was used instead.
