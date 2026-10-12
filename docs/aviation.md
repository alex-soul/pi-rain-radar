# Aviation weather

Open **Interface → Aviation**, enable METAR/TAF and enter a four-character ICAO airport code, for example EGBB. The appliance collects METAR and TAF from NOAA Aviation Weather Center every five minutes, shared by all screens. No API key is required. Failures use bounded retry backoff; opening or hiding a widget makes no extra provider requests.

Fresh installations enable collection at EGBB. Existing installations keep it off until enabled. New screens show the Aviation side button with the widget closed. Disabling collection hides the Aviation availability row and stops requests while preserving retained history.

## Display and explanations

The widget displays the complete raw METAR and TAF, left-aligned and wrapped to fit. Its cog controls opacity, font size and separate METAR/TAF panels. Drag using the small top-centre handle revealed by hover/tap; resize with the corner and close with the cross. The minimum width is 180px and maximum 1,000px, bounded by the viewport. Minimum height fits one scaled text line plus padding; scrolling appears only when content overflows.

Hover or tap a code or meaningful group to explain that section. A brighter background identifies it. Keyboard focus also reveals explanations; Escape or outside interaction dismisses them. Unknown groups stay visible and are labelled as not decoded. Raw text remains the reference; decoding is a learning aid and does not replace a flight briefing.

## Live and Archive

Live shows one latest acquired report for each product. Archive shows the latest version this installation had acquired by the capture position. Issue/observation time and TAF validity remain separate from acquisition. A newly acquired TAF appears immediately even when its printed validity starts later. Drag the Archive slider to see previous editions; there is no second Current/Next panel.

Repeated successful polls of an identical report keep its original acquisition time. Different METAR and TAF arrival times, amendments, cancellations, station changes and collection state are recorded independently. Before the first retained acquisition there is no report; external history is not backfilled. Reports use the same rolling storage retention as other streams.

## Availability

The gaps popup has one Aviation row with separate METAR/TAF details. Unchanged reports across successful polls are normal continuity. An interrupted or overdue collection is amber while an otherwise usable report is retained. Missing/cancelled reports are red; a METAR over 90 minutes old or a TAF at/past its validity end is also unusable. More than 15 minutes since the last successful check warns of interrupted collection. Future TAF validity alone is not a warning. Waiting, disabled and unknown history remain distinct.

Archive applies these rules at the selected capture time. Collection continues independently of whether either widget is visible. See [playback conventions](playback-conventions.md) and [upgrade defaults](upgrading.md#0120).
