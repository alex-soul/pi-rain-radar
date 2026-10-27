# Grass wetness: setup and tuning

Grass wetness estimates how wet the grass might feel underfoot, from **0 (dry) to 5 (soaked)**. I built it to help with a familiar question before going outside: do I need wellies? Rain and dew add wetness; sunlight, wind, dry air and drainage gradually remove it. The estimate remembers recent conditions instead of treating a moment without rain as dry grass.

This is an **uncalibrated weather-based estimate**, not a grass sensor or a soil-moisture measurement. The coefficients have not been fitted to my observation spreadsheet. I am leaving everything at **1×** initially and comparing it with what I see outside. That is the recommended starting point, not a claim that the defaults are optimal for every garden.

## What the scale means

| Intensity | Meaning | Practical interpretation |
| --- | --- | --- |
| 0 | Dry | Wellies not needed. |
| 1 | Slightly damp | A little dampness, but not wet; wellies not needed. |
| 2 | A little wet | Borderline, leaning towards ordinary shoes. |
| 3 | Wet | Borderline, leaning towards wellies. |
| 4 | Very wet | Soggy conditions; wellies recommended. |
| 5 | Soaked | Extreme wetness, potentially standing water. |

There are six possible values, so the middle lies **between 2 and 3**. A score of 2 fills two of five grass blades; 3 fills three. Errors around that boundary are less consequential than calling very soggy ground dry. A 5 is the top of an estimate, not a measurement or prediction of puddle depth.

## Start here

1. Configure Home Assistant in the installation settings. In **Interface → Weather → Readings**, select temperature, dew point and wind sources. These can use supported HA readings or OpenWeather.
2. Select an HA sensor for **Observed rain (accumulated)** and one for **Solar irradiance**. Both are required. Enable the relevant weather collection. Irradiance starts disabled and is not inferred from daylight, UV or cloud cover.
3. Under **Interface → Weather → Grass**, enable the calculation, leave all factors at **1×**, and press **Apply**.
4. Under **Screen settings → Side buttons**, enable **Grass**. Tap its grass icon to open the widget. The icon remains an indicator when the widget is closed.
5. Allow **30 minutes of continuous valid readings** for warm-up. Compare it with the same patch of grass over several days, including rain, drying afternoons and damp mornings.

The calculation is shared by every display and runs on the appliance. Button visibility, widget position, appearance and minimal mode belong to each browser. Hiding the button or closing the widget does not turn the calculation off. Grass wetness and Solar irradiance can also be selected in the top dock and Weather trends.

### Check the two HA inputs

**Observed rain (accumulated)** must be a non-negative cumulative total with HA state class `total` or `total_increasing`. Supported units are mm, cm and inches, converted internally to mm. A rain-rate sensor in mm/h is not interchangeable with a cumulative total. See [observed rainfall](observed-rain.md) for reset handling and source requirements.

**Solar irradiance** must report power per area in **W/m²** (supported spelling variants are normalized). There is no separate display-unit selector. Lux, UV index and sunshine duration cannot substitute. **Zero at night is valid**; missing or unavailable is not zero. Measured irradiance already reflects the sunlight reaching the sensor, including cloud attenuation, so the model does not apply another cloud-cover reduction.

Both HA values are acquired on the existing collection cycle, normally every five minutes. An unchanged valid irradiance value can still be a fresh successful HA acquisition: the original HA report time is retained separately. This makes a stable night-time zero usable. It also means the application cannot independently detect a physical sensor that has frozen while HA continues returning a plausible number. Check the source device in HA if its behaviour looks suspicious.

## Read the widget

The five-blade icon fills from left to right, using the same colour for every active blade. The full widget shows the integer, a short interpretation and a labelled 0–5 rail. It follows the normal drag, resize, corner controls, theme, opacity and font-size settings.

Open the widget's settings cog and enable **Minimalistic widget** for **five bars only**. Zero fills none; five fills all five. This mode can shrink to 40 px high. Returning to the full layout restores its larger minimum height. Corner controls still appear on interaction.

A dash or dashed outlines mean **no usable estimate**, never dry. The full widget distinguishes:

| Status | What to do |
| --- | --- |
| Calculation disabled | Enable it in Interface → Weather → Grass. |
| Setup required | Open the status **(i)** bubble and configure the missing reading or collection setting. |
| Warming up | Wait for 30 minutes of uninterrupted eligible readings. |
| Unavailable | Check the status bubble for a missing, invalid or stale input; inspect that source. |

If minimal mode looks unclear, use the full widget and its status bubble. Archive shows the estimate recorded at the selected time; it does not run today's settings over old weather data.

## How to tune it

Start by watching, not adjusting. Note the time, your own **0–5 intensity**, the displayed score, whether rain has just started or stopped, and whether conditions are sunny, windy or dewy. Use roughly the same patch and interpretation each time. A shaded lawn and an exposed patch can dry very differently even with the same weather station.

When a pattern repeats, change **one factor at a time**, make a small adjustment (for example 1× to 1.2×), press **Apply**, and observe comparable conditions again. The reservoir has memory, so drying adjustments need time to show their effect. Do not chase every five-minute fluctuation or one borderline 2/3 reading. Give repeated underestimates at 4 or 5 particular attention.

| Control | Increasing it does this | Consider it when… |
| --- | --- | --- |
| Rain wetting | Adds more wetness for each new mm of rain. | The score rises too little during rainfall. |
| Dew wetting | Adds more wetness when temperature is close to dew point. | Dewy mornings repeatedly look wetter than the estimate. |
| Sun drying | Removes wetness faster in measured sunlight. | Sunny afternoons leave the estimate wet after the grass has dried. |
| Wind drying | Removes wetness faster in wind, reduced when air is close to saturation. | The estimate dries too slowly during breezy periods. |
| Air drying | Removes wetness faster as temperature rises above dew point. | The estimate stays too wet in dry air, even without strong sun or wind. |
| Drainage | Removes a larger share of retained wetness over time. | Ground generally drains faster than the estimate assumes. |
| Overall sensitivity | Raises the displayed score for the same internal wetness. | The overall level is consistently too low, while its rise/fall timing looks reasonable. |

For the opposite pattern, reduce the relevant factor. For example, lower **Drainage** if the estimate dries too quickly on poorly drained ground. Drainage is a simple allowance for retained water draining away, including into the ground; it does not calculate soil layers, water tables or runoff routes. Sun, wind and air drying represent separate influences.

The six process factors range from **0–3×**; zero removes that contribution. Overall sensitivity ranges from **0.25–2×**. It changes the displayed scale without changing the stored reservoir, so it cannot correct wrong drying timing. These factors interact: diagnose the conditions before changing several controls together.

**Reset to defaults**, then **Apply**, restores the factors to 1×. It preserves the enable switch, accumulated model state and recorded history. It is not a fresh-start button. Disabling and re-enabling calculation restarts warm-up.

## The actual calculation

Model version 1 keeps an internal reservoir `M` between 0 and 5. These are model units, **not millimetres of water on the grass**. Each new eligible rain acquisition supplies the elapsed time and the increase in the cumulative rain counter. Other readings supply the drying/dew conditions for that step.

| Symbol | Input or meaning |
| --- | --- |
| `h` | Elapsed hours since the previous accepted rain acquisition. |
| `ΔR` | New rain in mm during that interval. |
| `T`, `Td` | Temperature and dew point in °C. |
| `D = max(0, T − Td)` | Dew-point depression in °C. |
| `A = min(1, D / 5)` | Dry-air factor, from 0 to 1. |
| `S` | Non-negative solar irradiance in W/m². |
| `W` | Non-negative wind speed, converted internally to mph. |
| `r, d, s, w, a, g` | Rain, dew, sun, wind, air and drainage multipliers. |
| `q` | Overall sensitivity. |

```text
wetting = 1.5 × max(0, ΔR) × r
        + h × 0.4 × max(0, 1 − D/2) × d

drying  = h × (S/400 × s
            + W/10 × A × w
            + D/10 × a
            + M × 0.12 × g)

M_next  = clamp(M + wetting − drying, 0, 5)
score   = round(clamp(M_next × q, 0, 5))
```

At defaults, one new mm of rain adds **1.5 model units** before drying. Dew adds up to **0.4 units per hour**, reaching zero when temperature is at least 2°C above dew point. Sun at 400 W/m² contributes **1 unit per hour** of drying; wind at 10 mph contributes up to **1 unit per hour**, depending on air dryness. Drainage removes **12% of the current reservoir per hour before step integration**. Applied in short steps, that is gradual decay, not a fixed number of points removed each hour.

For example, start at `M = 3` with a five-minute interval, 0.2 mm new rain, 200 W/m² sunlight, 10 mph wind and a 2°C dew-point depression. At 1×, wetting is 0.30 and drying is about 0.122. The reservoir becomes about 3.178 and the displayed score remains **3**. Small changes accumulate before crossing a whole-number boundary.

These coefficients are deliberately simple heuristics. Temperature near dew point suggests possible dew; it does not measure leaf condensation. The model does not know grass length, shade, mowing, irrigation, soil type, frost/snow or whether the sensor represents the patch you walk on. Weather inputs and personal observation remain essential.

## Warm-up, gaps and history

The reservoir starts internally at **2.5**, with the score withheld for 30 minutes. Warm-up prevents an invented initial dry reading; it does not reconstruct conditions before collection began or guarantee that the initial estimate matches your lawn. After a restart, a valid persisted state can continue. A gap longer than ten minutes, a source/location change or an unexplained rain-counter reset starts a new warm-up. Explicit, bounded `last_reset` and `last_period` metadata can bridge a counter reset.

HA inputs need a usable acquisition no older than ten minutes; eligible OpenWeather temperature, dew point and wind have a 30-minute freshness limit. Missing inputs stop estimation. The model advances only on new accumulated-rain acquisitions, so screen refreshes cannot count the same rain twice and additional viewers do not cause additional provider requests.

The reservoir and output are persisted together in SQLite, with model version, parameters and input provenance. **Tuning affects new estimates, not archived scores.** An old reading remains the result produced with the settings and data available at that time. Existing history without a grass estimate remains unavailable; it is not filled with invented values.

[User manual](manual.md) · [Observed rainfall](observed-rain.md) · [Release notes](release-0.14.0.md)
