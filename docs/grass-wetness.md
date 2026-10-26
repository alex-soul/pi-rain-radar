# Grass wetness

Grass wetness is an **uncalibrated estimate**, on a 0–5 scale. It has not been fitted to an observation spreadsheet. Start with the defaults, compare it with conditions outside, and adjust the sensitivity in **Interface → Weather → Grass**. Tap the info bubble beside each label for help.

| Intensity | Meaning |
| --- | --- |
| 0 | Dry |
| 1 | Slightly damp; wellies not needed |
| 2 | A little wet; borderline, leaning towards ordinary shoes |
| 3 | Wet; borderline, leaning towards wellies |
| 4 | Very wet or soggy; wellies recommended |
| 5 | Soaked; extreme wetness, potentially standing water |

Configure temperature, dew point and wind in **Weather → Readings**, plus Home Assistant sensors for **Observed rain (accumulated)** and **Solar irradiance**. Irradiance uses **W/m²**, including zero at night; lux, UV and forecast rain cannot substitute for these inputs. The accumulated-rain sensor must provide a non-negative total in mm, cm or inches with HA state class `total` or `total_increasing`.

Enable the calculation, then enable **Grass** under **Screen settings → Side buttons**. The grass icon fills one blade per point, left to right, from none at 0 to all five at 5 and remains an indicator when its widget is closed. Tap it for the score, description and six-segment rail. The widget uses the normal drag, resize, corner controls, theme, opacity and font-size settings. Its active bars share one colour. In the widget settings popup, **Minimalistic widget** switches to five bars only: 0 fills none and 5 fills all five. Unavailable readings use dashed outlines. This preference is saved per display, applies in Live and Archive, and defaults off. Minimal mode can be resized down to 40px high; turning it off restores the full layout and its minimum height. Normal corner controls still appear on interaction. The top dock uses a grass icon; the top dock and Weather trends also offer Grass wetness and Solar irradiance readings.

A dashed grass icon and a dash mean unavailable, warming up or disabled, **not dry**. The widget distinguishes **Calculation disabled**, **Setup required**, **Warming up** and **Unavailable**. Setup required means a required reading or collection is not configured; Unavailable means configured readings are missing, invalid or stale. The standard **(i)** beside the status lists missing setup and where to configure it; detailed guidance stays inside the bubble. Closing the widget or hiding its side button does not disable calculation. In Archive the widget and dock show the estimates saved at the selected time.

## Tuning

Rain and dew add wetness. Sunlight, wind in unsaturated air, temperature above dew point and drainage remove it. Each factor starts at **1×**, with a **0–3×** range. Overall sensitivity scales the result, from **0.25–2×**. Larger wetting factors increase wetness; larger drying factors reduce it. Adjust one factor at a time and press **Apply**. **Reset to defaults** selects the default factors; press Apply to save them. It preserves the enable switch, accumulated model state and recorded history.

The backend maintains a bounded 0–5 reservoir. It starts at 2.5 internally and withholds the score for 30 minutes of continuous valid readings. That warm-up avoids showing an invented initial dry score; it does not prove the starting estimate matches the ground. Fresh rain adds 1.5 reservoir units per mm at default sensitivity. Per hour, dew adds up to 0.4 units when temperature is within 2°C of dew point. Drying combines irradiance/400, wind in mph/10 multiplied by air dryness, dew-point depression/10, and 12% of retained moisture. Air dryness is bounded at a 5°C depression. Each term has its own factor. Overall sensitivity is applied before rounding and clamping the displayed integer to 0–5.

Calculation advances on new accumulated-rain acquisitions, normally every five minutes, with no additional provider calls. Repeated snapshots cannot count the same rain twice. HA inputs expire after ten minutes; eligible OpenWeather temperature/dew/wind use their existing freshness policy. Missing inputs stop estimation. A gap longer than ten minutes, a source/location change or an unexplained counter reset restarts warm-up. Explicit `last_reset` and `last_period` metadata can bridge a counter reset. Disabling and re-enabling calculation also restarts warm-up.

The reservoir and its corresponding output are saved together in SQLite. Every output retains its model version, parameters and input provenance. Tuning affects new estimates; it never recalculates archived scores. This is a small deterministic calculation on the appliance, shared by every browser. Local synthetic tests establish behaviour and persistence, not accuracy or Pi performance.
