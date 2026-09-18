# Radar providers: setup and usage

Choose sources in **Settings → System → API → Radar**. Main map and Overview map can use RainViewer, Rainbow, or the same provider. Acquisition is shared across connected displays.

## RainViewer

RainViewer generously provides public API access without a key. The app caches data and paces requests to respect rate limits. Read the [provider terms and notices](../THIRD_PARTY_NOTICES.md#rainviewer); this is not unlimited or guaranteed service.

## Rainbow

1. Obtain a Tiles API key from the [Rainbow developer portal](https://developer.rainbow.ai/).
2. Select Rainbow for Main map or Overview map to reveal its configuration.
3. Enter your key and choose **Save key**. A saved key is validated and stored on the appliance. When configured, the button becomes **Replace key**; Remove is disabled when no key exists.
4. Choose **Save and apply sources**. Saving a key and applying map sources are separate actions. Wait for the selected maps to be prepared.

Switch both maps away from Rainbow before removing its key. Failed validation keeps the existing key; a failed source change keeps the previous selection. There is no automatic switch to the other provider on failure: a healthy map continues updating, while the affected map retains its last captured image. See [indicators](indicators.md).

**Wait for radar to settle** is one global switch. Each provider independently waits about five extra minutes after new frames are first observed. Both maps share a provider's observation time; switching that provider between views does not start the wait again.

## Estimates and optional limit

The estimate covers a full 31-day month of continuous use with the selected map geometry. Tiles are downloaded for new ten-minute frames; one shared snapshot check runs every five minutes when Rainbow is selected. Additional displays and playback speed do not multiply acquisition.

For the default single Rainbow map, the baseline is **26,784 tile downloads + 8,928 snapshot checks = 35,712 API calls**. The suggested **38,000-call limit** leaves 2,288 extra calls for initial loading, retries and occasional changes. Suggestions add roughly 6% to the baseline and round up to the next thousand. Actual geometry, cache sharing, repeated changes and failures affect usage; this is an estimate, not a billing guarantee.

The release assumes Rainbow's advertised **30,000 free tiles/month** excludes snapshot checks. Under that assumption, the default single-map baseline leaves **3,216 free tiles**. Confirm your own subscription's terms in the [developer portal](https://developer.rainbow.ai/); provider pricing may change. The app does not treat total API-call statistics as proof of billable tiles.

The optional **Maximum API requests** limit counts **all** locally dispatched requests, including snapshots and failed calls. It can therefore be higher than 30,000 while expected tile usage stays below the free tile allowance. Once exhausted, Rainbow updates pause until the UTC calendar month changes or the limit is raised/disabled. The dock and Status report the issue; Log records it. The limit does not count other apps using your account.

**Total calls** shows this month's count, with `/limit` when enabled. Counts survive restart. A crash after reservation can conservatively overcount. Older development ledgers without a monthly total carry their lifetime total into that month's count to avoid silently resetting usage.

## History and attribution

History replays the captured map frames, including mixed sources, without downloading old frames on demand. Changing providers preserves it. Changing map geometry selects a different retained history; changing only name or time zone does not. Current weather and Rain forecast remain current during historical radar playback.

Credit at the bottom follows the displayed radar sources, including historical frames. Mixed sources show **Radar by RainViewer & Rainbow**, with separate direct links. Credits stay visible when the dock is tucked away.
