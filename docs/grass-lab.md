# Grass Lab

From 0.15.0, open `/grass-lab` on your installation from a laptop to compare recorded Grass estimates with your observations and experiment with the calculation. Open `/grass-obs` directly on your phone to record an observation. These pages deliberately have no links in the normal radar menus. Bookmark the URLs you use over your own LAN or private remote access.

## Observe outside, compare at home

Choose an integer intensity from 0 (dry) to 5 (soaked), optionally add a note, then save. The default observation time is the moment you press Save; expand **Time** to correct it. The server separately records receipt time. A configured installation PIN is required to save, using the same unlock mechanism as settings. The six-box PIN dialog advances after each digit and supports pasting all six digits; the Lab uses the same dialog for Apply. Without a configured PIN, devices that can reach the app can save observations. The entry page loads neither weather history nor replay code. It needs a connection to save; keep the form open and retry after a connection failure. A retry of the same entry uses the same identifier to prevent duplicate saves.

Observations are stored on the appliance, associated with its location, and persist across restarts. They are not deleted when rolling weather history expires. They are included in the Lab export and in a complete application-data backup. The initial version has no edit/delete UI; review the selected level and time before saving.

## Explore a different balance

The Lab loads its sliders from the current saved Grass settings and defaults to seven days, with 12-hour, 24-hour, three-day and 30-day views. **Refresh history** includes recent inputs and observations and resets the experiment. Data responses can be cached for up to 30 seconds. The chart shows the actual retained coverage; choosing 30 days cannot recover inputs that were already deleted before this version was installed.

The grey line is the recorded estimate, the coloured line is the replay, and dots are your observations. Move a tuning slider to apply one alternative profile to all retained inputs. Window buttons change the visible chart, not the calculation boundary. **Reset** fetches the current saved Grass settings again and applies that profile across the retained inputs, including changes made in the menu after the Lab was opened. The recorded line remains fixed; baseline verification separately follows the original settings changes. If the settings request fails, the existing experiment is kept and an error is shown. **Apply**, beside Reset, deliberately saves the seven slider values to live Grass settings using the installation PIN. It preserves the calculation enable switch and other weather settings. Moving sliders alone remains a preview; Apply affects future estimates, not the recorded line.

Replay uses the model version recorded with each historical input in a background worker on the viewing laptop. It checks the baseline against saved estimates and reports mismatches. An alternative starts from the saved reservoir at the retained boundary, so it cannot reconstruct the effect of alternative settings before that boundary. Missing or ineligible inputs remain gaps, rather than dry readings. A long window uses fewer plotted vertices while retaining peaks, troughs and gaps; calculations still use the original input cadence.

Each observation is compared with the last available eligible estimate at or before its timestamp, within ten minutes. The mean absolute difference is a descriptive comparison, not automatic fitting or evidence that a profile is calibrated. The latest 200 observations appear in the table; the export contains all retained observations. Times are shown in the installation timezone; corrected entry times use the phone's local timezone.

The cursor date/time sits below the window selector. Focus the chart and use arrow keys or Home/End for keyboard inspection. Grid lines follow local midnight and whole hours, adapting to window length and chart width. Coloured change markers identify the first retained snapshot with a changed live parameter; they are not exact save timestamps. Imported notes and experimental sliders do not create these markers. Slider explanations open from the info buttons. The compact summary above observations shows the average absolute difference and matched count.

## See what shaped the curve

Six time-aligned heatmap strips show rain and dew wetting, and sun, wind, air and drainage drying. Each strip independently toggles its colour behind the chart: select several to combine overlays, select one again to remove it, or use **Clear overlays**. Matching colours identify the sliders. Hover or tap to inspect contribution rates; selected factors stay selected through slider changes, Reset and time-window changes. Reloading clears the overlay selection.

The strips follow the alternative profile, including changes made with the sliders. Their common brightness scale is fixed at 0–2 moisture units per hour, with square-root contrast to reveal small contributions. Values above 2 stay at maximum brightness; inspection retains their actual rates. Wide time windows average rates by duration within each small displayed interval. Hatching marks missing calculation coverage, while zero contribution has no colour. Warm-up can have contributions before the score becomes available. Hover reads the actual acquisition interval containing the cursor, even when intermediate snapshots reused a weather acquisition. A missing interval remains unavailable; no contribution is carried across a gap. Recovery can add a known accumulated rain delta without assigning it an invented time within the gap, so that interval remains hatched.

These are terms in the formula before its 0–5 reservoir limit, not independently attributable changes in the displayed score. Strong drying can coincide with a flat zero line when no moisture remains; an earlier effect can also leave the grass wetter or drier later. Overall sensitivity scales the displayed score and has no wetting/drying strip. Colour blending is a visual aid, not a combined numerical scale. Heatmap calculations use the existing laptop worker; neither opening the Lab nor changing its sliders changes live calibration.

## Retention and access

The app keeps a compact rolling 30-day set of the temperature, dew point, wind, sunlight, observed-rain inputs, parameters, estimates and reservoir state needed for replay, plus one initialization boundary. This is separate from normal archive retention and contains no radar, cloud or camera media. On upgrade, any still-available presentation history seeds this collection. Recording continues on the Pi without leaving the Lab open.

Observations have a separate 50,000-entry limit; the initial Lab serves at most 30,000 weather snapshots per location and reports an error if that bound is exceeded. Full application backups protect these SQLite tables. Export useful experiments before their weather inputs expire; keeping observations does not keep their old weather inputs forever.

The pages use the app's existing network access model. An unlisted URL is not authentication. Keep remote access private; these routes do not enable public sharing or expose the app to the Internet.
