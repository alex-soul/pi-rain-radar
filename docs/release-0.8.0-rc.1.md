# 0.8.0-rc.1 — local release candidate

> Historical candidate record. Superseded by the [published and accepted 0.8.0 release](release-0.8.0.md); statuses below describe that candidate checkpoint, not the current deployment.

This candidate is for device soak testing; 0.8.0 has not been released.

Weather now separates current readings from Forecast collection. Ten reading sources support Disabled/OpenWeather; temperature, feels-like, wind and gust additionally support Home Assistant. Fresh installations start with readings disabled; upgrades retain existing selections and collection. Disabled metrics are discarded before storage. Hiding a Dock reading only changes presentation. One OpenWeather current request supplies all selected metrics; selecting fewer does not save calls. All disabled suppresses current requests. Forecast remains independent. Removing credentials turns dependent switches off; re-adding requires manual enablement.

Dock explanations and source/health indicators are consistent across readings. OpenWeather gust is optional, with optional bounded retention; HA gust is required and does not use that cache. Weather and playback auto-hide controls retain their purpose. Only the weather Dock handle toggles it. Reading widths remain stable; on wide displays the Dock may overlap stationary controls, while narrower displays move controls only on collision.

Clouds are optional under Interface > Clouds. Configure Rainbow first, then enable collection and choose Main (default), Overview or Both. Toolbar visibility does not stop acquisition. Cloud opacity and rain opacity are separate; rain opacity sits below playback speed. Clouds render below rain and share Rainbow's request ledger/rate limiting. Clouds default off; removal of the Rainbow key switches them off persistently. Enabling may backfill two hours. Public tariff estimates are not account billing guarantees; both maps and initial backfill increase requests. No separate free allowance is assumed.

Rain/cloud/camera playback keeps the current image until a replacement decodes, with bounded caches/timeouts. Cloud Live reuse is strictly less than30 minutes; Archive uses exact cloud captures. New camera captures fit640x640 with aspect ratio/no enlargement and JPEG85; old images are not rewritten. Real camera quality is assessed during RC soak.

Click the total frame count to show availability above the centred timeline. Rows are Rain and relevant Clouds/Weather/Camera. Teal means available, amber a reused observation, red missing data during known collection, grey disabled or unknown historical collection state. Detail distinguishes Unknown from Disabled. Camera/cloud policy transitions are recorded going forward; older gaps do not prove collection was enabled. Retained captures remain visible. The total summarises the window; current collection LEDs remain independent.

Keep a consistent data/profile/config backup before upgrade. Local RC installation must preserve the current volume, origin and Device Power override. Reverting code is not equivalent to restoring compatible data. Multi-day camera/HA/cloud freshness, touch interaction and hardware performance remain soak checks; local automated tests are not physical acceptance.
