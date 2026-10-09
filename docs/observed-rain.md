# Observed accumulated rain

Under **Interface → Weather → Readings**, enable Home Assistant collection and choose an accumulated precipitation sensor in **Observed rain**. Use a running total with state class `total` or `total_increasing`, in mm, cm or in. Rain intensity (such as mm/h) and individual per-report amounts are not accumulated totals.

For Tempest, a correctly configured daily Utility Meter can turn the station's precipitation reports into a running daily total. Select that helper rather than the intensity sensor. For example, its value might rise from 0.5 mm to 1.2 mm during rain and reset to 0 at the start of the next day. Check the source sensor and the helper's behaviour in Home Assistant before selecting it; a helper should not repeatedly add the same cumulative total.

Radar acquires the total on its existing five-minute HA cycle, including unchanged values, and retains it under **System → Storage**'s archive policy. It saves the raw unit, original report timestamp and available reset/previous-period metadata. Acquisition time identifies each snapshot; missing or invalid acquisitions remain gaps. No forecast replaces an observed value.

Enable **Rain accumulation** under **Screen settings → Top dock → Readings**, or in Weather trends. Choose mm, cm or in under **Interface → Weather → Units**; this converts the display, not stored measurements. A trend is the running total, so daily resets break the line rather than appearing as negative rainfall. There is no data before collection is enabled.

This is the collection foundation. Comparing actual rain with forecasts at different lead times remains future work.
