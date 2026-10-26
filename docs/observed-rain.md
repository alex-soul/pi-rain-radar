# Observed accumulated rain

Under **Interface → Weather → Readings**, enable Home Assistant collection and choose an accumulated precipitation sensor in **Observed rain**. Use a running total with state class `total` or `total_increasing`, in mm, cm or in. Rain intensity (such as mm/h) and individual per-report amounts are not accumulated totals.

For Tempest, a correctly configured daily Utility Meter can turn the station's precipitation reports into a running daily total. Select that helper rather than the intensity sensor. For example, its value might rise from 0.5 mm to 1.2 mm during rain and reset to 0 at the start of the next day. Check the source sensor and the helper's behaviour in Home Assistant before selecting it; a helper should not repeatedly add the same cumulative total.

Radar acquires the total on its existing five-minute HA cycle, including unchanged values, and retains it under **System → Storage**'s archive policy. It saves the raw unit, original report timestamp and available reset/previous-period metadata. Acquisition time identifies each snapshot; missing or invalid acquisitions remain gaps. No forecast replaces an observed value.

Enable **Rain accumulation** under **Screen settings → Top dock → Readings**, or in Weather trends. Choose the global mm, cm or in default under **Interface → Weather → Units**, or override it in **Screen settings → Top dock → Units**; this converts the display, not stored measurements. A trend is the running total, so daily resets break the line rather than appearing as negative rainfall. There is no data before collection is enabled.

## Archive forecast comparison

In DEV 0.14.0, **Archive → Options → Show actual rainfall** adds purple dots at observed interval midpoints to the selected saved forecast, connected by a gently smoothed line. Connections stop at gaps; the curve is a visual guide and does not reconstruct minute intensity. Live and Archive have a labelled mm/h Y axis at zero, midpoint and maximum, with matching gridlines and no heading. Forecast reference, coverage and hindsight details remain in chart descriptions and help. Original minute bars and both axes remain unchanged on toggle. The scale includes the maximum of the forecast and available actual intervals even when the overlay is off. No separate forecast-age slider remains. The switch defaults off and resets on return to Live; it does not change Live forecasts.

Differences between compatible cumulative readings are converted from mm/cm/in to mm and divided by the actual acquisition interval. A 0.2 mm change over five minutes is a 2.4 mm/h average. These are acquisition intervals, not exact rainfall onset/peak times: the original HA report timestamp remains in the retained evidence and the interval tooltip. A delayed changed total whose report predates the preceding acquisition is excluded. An unchanged valid total can establish zero; missing data cannot.

Only complete observed intervals inside the forecast horizon are drawn. Intervals exceeding ten minutes, invalid/missing acquisitions, source/unit/location/connection changes, conflicting or non-monotonic timestamps and unresolved counter resets break coverage. A reset can be bridged only with an explicit reset time inside the interval and a valid previous-period total yielding a nonnegative difference. Compatible collection resumes on the next trustworthy pair. Raw evidence is never rewritten.

The archive response includes separate retained observation evidence through the saved forecast horizon, bounded to two hours beyond the radar endpoint. It does not advance the selected forecast, radar window or historical readings and makes no additional provider requests. Unobserved future or expired retention stays unavailable. The configured HA rain source must represent the forecast location; the application checks its recorded context but cannot verify a sensor's physical placement.

Validate the accumulation helper against real rain before drawing accuracy conclusions. Synthetic DEV cases demonstrate rendering and boundary handling, not forecast accuracy. Numeric scoring and calibration remain out of scope.
