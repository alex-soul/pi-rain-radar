# Radar providers: setup and usage

Choose sources in **Settings → Interface → Radar**. Main map and Overview map can use RainViewer, Rainbow, or the same provider. Acquisition is shared across connected displays.

## RainViewer

RainViewer generously provides public API access without a key. The app caches data and paces requests to respect rate limits. Read the [provider terms and notices](../THIRD_PARTY_NOTICES.md#rainviewer); this is not unlimited or guaranteed service.

## Rainbow

1. Obtain a Tiles API key from the [Rainbow developer portal](https://developer.rainbow.ai/).
2. Open **System → API → Rainbow**, enter the key and choose **Save key**. Validation happens before replacement; the key stays on the appliance.
3. Open **Interface → Radar**, enable Rainbow collection, choose Main/Overview sources and **Save and apply sources**. Saving credentials alone does not enable collection or apply sources. Configure cloud collection/layers separately under **Interface → Clouds** using the same Rainbow account.
4. RainViewer collection defaults enabled. Disable it if it is not needed; cached history remains available and no automatic provider switch occurs.

Switch both maps away from Rainbow before removing its key. Failed validation keeps the existing key; a failed source change keeps the previous selection. There is no automatic switch to the other provider on failure: a healthy map continues updating, while Live may retain compatible earlier radar for less than 30 minutes, then clears its radar overlay. Archive never borrows. See [indicators](indicators.md).

**Wait for radar to settle** is one global switch. Each provider independently waits about five extra minutes after new frames are first observed. Both maps share a provider's observation time; switching that provider between views does not start the wait again.

## Usage, costs and optional limit

The [Rainbow Tiles API](https://developer.rainbow.ai/) advertises 30,000 tiles/month free and $0.20 per 1,000 additional tiles, resetting each calendar month (checked 24 September 2026). Rain and clouds use this account; do not assume a separate free allowance per layer. The headline tile tariff does not establish how snapshot checks are billed: check your account terms. Local API requests are not proof of billable tiles.

Actual geometry, enabled layers, shared caches, initial loading, retries and source changes affect usage. Additional screens and playback speed do not multiply acquisition. Stats for nerds retains actual requests, tiles and the monthly budget; speculative map estimates have been removed.

My current setup has RainViewer main rain, Rainbow Overview rain, and Rainbow clouds on both maps: three Rainbow layers. An all-Rainbow rain/cloud setup on both maps has four. I still need one complete month of usage before I know the actual cost; neither configuration has a guaranteed bill or free-tier fit. For a simpler starting point, keep RainViewer radar and add optional layers as needed. Retained storage also varies; no fixed number of years is promised.

Under **System → API → Rainbow**, the optional **Maximum API requests** limit is shared by rain and clouds and counts **all** locally dispatched requests, including snapshots and failed calls. It is a request safeguard, not a currency budget or provider billing meter. Once exhausted, Rainbow updates pause until the UTC calendar month changes or the limit is raised/disabled. The dock and Status report the issue; Log records it. The limit does not count other apps using your account.

**Total calls** shows this month's count, with `/limit` when enabled. Counts survive restart. A crash after reservation can conservatively overcount. Older development ledgers without a monthly total carry their lifetime total into that month's count to avoid silently resetting usage.

## Archive and attribution

Archive replays available observations at their original times, including mixed sources and late arrivals, without downloading old frames on demand. Changing providers preserves it. Changing map geometry selects a different retained history; changing only name or time zone does not. Archive weather, forecast and camera follow saved history; Live keeps current weather and camera independent of radar scrubbing.

Credit at the bottom follows the displayed radar sources, including historical frames. Mixed sources show **Radar by RainViewer & Rainbow**, with separate direct links. Clouds have a separate Rainbow credit. Credits stay visible when the dock is tucked away.
