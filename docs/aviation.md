# Aviation weather

Open **Interface → Aviation**, enable METAR/TAF and enter a four-character ICAO airport code, for example EGBB. The appliance collects METAR and TAF from NOAA Aviation Weather Center every five minutes, shared by all screens. No API key is required. Failures use bounded retry backoff; opening or hiding a widget makes no extra provider requests.

Fresh installations enable collection at EGBB. Existing installations keep it off until enabled. New screens show the Aviation side button with the widget closed. Disabling collection hides the Aviation availability row and stops requests while preserving retained history.

## Display and explanations

The raw widgets display the complete METAR and TAF, left-aligned and wrapped to fit. Their Options tab controls opacity, font size and combined/split layout. Both raw-report and Cloud layers cogs share a Panels tab with Open with Aviation switches for METAR, TAF and Cloud layers. Drag using the small top-centre handle revealed by hover/tap; resize with the corner and close with the cross. The minimum width is 180px and maximum 1,000px, bounded by the viewport. Minimum height fits one scaled text line plus padding; scrolling appears only when content overflows.

Hover or tap a code or meaningful group to explain that section. A brighter background identifies it. Keyboard focus also reveals explanations; Escape or outside interaction dismisses them. Unknown groups stay visible and are labelled as not decoded. Raw text remains the reference; decoding is a learning aid and does not replace a flight briefing.

The Aviation button hides or opens the selected panels. Closing a panel with × also turns its switch off; closing a combined METAR/TAF window turns both text switches off. If all switches are off, the next Aviation click opens Panels settings. Enable the panels you want, close settings and click Aviation to show them. Choices and placement are saved independently on each screen.

## Cloud layers

Cloud layers shows observed cloud bases above the aerodrome, using the same station and METAR collection. FEW, SCT, BKN and OVC have distinct coverage; shapes and thickness are illustrative, not measured cloud tops or horizontal positions. CB/TCU add subtle internal shading without implying extra height. Each observation keeps a stable appearance in Live and Archive.

The compact footer shows a status LED, airport code and original cloud groups. Hover, tap or focus the groups for timestamps, full detail and warnings about layers above a fixed scale. Clear/no-significant-cloud codes leave the chart empty. Vertical visibility uses haze and a dashed marker; unknown heights are never plotted as zero. Known bases still appear when other groups have unknown bases.

The Clouds tab controls cloud opacity, size and irregularity. Options controls metres/feet, automatic/fixed vertical scale, widget opacity and font size. Panels is shared with the raw widgets. Drag or resize from the edges/corner; minimum and initial size are 200×100px. Defaults are metres, automatic scale, 80% widget opacity, 85% cloud opacity and 100% font, size and irregularity.

Clouds LED: green means current; amber means overdue collection or an expired observation; grey means unconfigured or missing; red means an explicit collection/processing error. A last usable picture is retained through delays/errors until the observation exceeds 90 minutes, then cleared. This LED describes the cloud observation; the availability row below describes the separate METAR/TAF products.

## Live and Archive

Live shows one latest acquired report for each product. Archive shows the latest version this installation had acquired by the capture position. Issue/observation time and TAF validity remain separate from acquisition. A newly acquired TAF appears immediately even when its printed validity starts later. Drag the Archive slider to see previous editions; there is no second Current/Next panel.

Repeated successful polls of an identical report keep its original acquisition time. Different METAR and TAF arrival times, amendments, cancellations, station changes and collection state are recorded independently. Before the first retained acquisition there is no report; external history is not backfilled. Reports use the same rolling storage retention as other streams.

## Availability

The gaps popup has one Aviation row with separate METAR/TAF details. Unchanged reports across successful polls are normal continuity. An interrupted or overdue collection is amber while an otherwise usable report is retained. Missing/cancelled reports are red; a METAR over 90 minutes old or a TAF at/past its validity end is also unusable. More than 15 minutes since the last successful check warns of interrupted collection. Future TAF validity alone is not a warning. Waiting, disabled and unknown history remain distinct.

Archive applies these rules at the selected capture time. Collection continues independently of which panels are visible. See [playback conventions](playback-conventions.md) and [upgrade defaults](upgrading.md#0130).
