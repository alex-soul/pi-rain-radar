# Grass Lab

From 0.15.0, open `/grass-lab` on your installation from a laptop to compare recorded Grass estimates with your observations and experiment with the calculation. Open `/grass-obs` directly on your phone to record an observation. These pages deliberately have no links in the normal radar menus. Bookmark the URLs you use over your own LAN or private remote access.

## Observe outside, compare at home

Choose an integer intensity from 0 (dry) to 5 (soaked), optionally add a note, then save. The default observation time is the moment you press Save; expand **Time** to correct it. The server separately records receipt time. A configured installation PIN is required to save, using the same unlock mechanism as settings. Without a configured PIN, devices that can reach the app can save observations. The entry page loads neither weather history nor replay code. It needs a connection to save; keep the form open and retry after a connection failure. A retry of the same entry uses the same identifier to prevent duplicate saves.

Observations are stored on the appliance, associated with its location, and persist across restarts. They are not deleted when rolling weather history expires. They are included in the Lab export and in a complete application-data backup. The initial version has no edit/delete UI; review the selected level and time before saving.

## Explore a different balance

The Lab loads its sliders from the current saved Grass settings and defaults to seven days, with 12-hour, 24-hour, three-day and 30-day views. **Refresh history** includes recent inputs and observations and resets the experiment. Data responses can be cached for up to 30 seconds. The chart shows the actual retained coverage; choosing 30 days cannot recover inputs that were already deleted before this version was installed.

The grey line is the recorded estimate, the coloured line is the replay, and dots are your observations. Move a tuning slider to apply one alternative profile to all retained inputs. Window buttons change the visible chart, not the calculation boundary. **Reset** fetches the current saved Grass settings again and applies that profile across the retained inputs, including changes made in the menu after the Lab was opened. The recorded line remains fixed; baseline verification separately follows the original settings changes. If the settings request fails, the existing experiment is kept and an error is shown. The Lab never applies its sliders to live settings. The existing settings page remains the place to change the live model deliberately.

Replay uses the same formula as the live model in a background worker on the viewing laptop. It checks the baseline against saved estimates and reports mismatches. An alternative starts from the saved reservoir at the retained boundary, so it cannot reconstruct the effect of alternative settings before that boundary. Missing or ineligible inputs remain gaps, rather than dry readings. A long window uses fewer plotted vertices while retaining peaks, troughs and gaps; calculations still use the original input cadence.

Each observation is compared with the last available eligible estimate at or before its timestamp, within ten minutes. The mean absolute difference is a descriptive comparison, not automatic fitting or evidence that a profile is calibrated. The latest 200 observations appear in the table; the export contains all retained observations. Times are shown in the installation timezone; corrected entry times use the phone's local timezone.

## Retention and access

The app keeps a compact rolling 30-day set of the temperature, dew point, wind, sunlight, observed-rain inputs, parameters, estimates and reservoir state needed for replay, plus one initialization boundary. This is separate from normal archive retention and contains no radar, cloud or camera media. On upgrade, any still-available presentation history seeds this collection. Recording continues on the Pi without leaving the Lab open.

Observations have a separate 50,000-entry limit; the initial Lab serves at most 30,000 weather snapshots per location and reports an error if that bound is exceeded. Full application backups protect these SQLite tables. Export useful experiments before their weather inputs expire; keeping observations does not keep their old weather inputs forever.

The pages use the app's existing network access model. An unlisted URL is not authentication. Keep remote access private; these routes do not enable public sharing or expose the app to the Internet.
