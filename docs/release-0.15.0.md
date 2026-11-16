# 0.15.0 — Grass Lab and clearer rainfall intensity

0.15.0 is a prerelease. I accepted the complete Grass Lab and the final RC7 refinements on my Pi 4 / 2 GB after using the candidates for observation and tuning. The sections below retain the candidate history; published-image and installer verification is recorded in [validation](validation.md).

- Grass scores show one decimal in the dock, trends and full widget. The full widget uses five bars, a smaller number and the descriptive heading, without the denominator or footwear helper text.
- Archive GIF export preserves the playback slider track and thumb.
- Aviation and Grass have current integration status, with the official aviation provider status link and concise current-only Stats for nerds.
- [Grass Lab](grass-lab.md) and the separate mobile observation page are maintained routes, with persistent observations, 30-day compact history and experimental replay. The expanded Grass widget info bubble includes a Lab link with a kiosk advisory. Slider changes preview alternatives; Apply deliberately saves live calibration with the installation PIN.
- Forecast bars use absolute-rate vertical gradients matching the radar palette, while preserving automatic Y-axis scaling in Live and Archive.
- The local `__dev` scenario playground remains available for development.

Grass remains a weather-based estimate. This release makes observation and tuning easier; the starting profile reflects my garden and can be adjusted for other locations. See [Grass setup and tuning](grass-wetness.md).

Upgrading adds Grass tables to the existing SQLite database without rewriting recorded archive estimates or removing existing settings/media. The 30-day input collection begins with whatever presentation history is still retained. Existing observation records survive normal history cleanup. Back up application data before an upgrade.

Release CI tests and builds AMD64 and ARM64 images, verifies startup and retained data across restart, then promotes the versioned image to `latest`. Existing installations keep their saved tuning. The new starting profile is rain 3×, dew 2×, sun 1×, wind 0.5×, air 0.5×, drainage 0.1× and sensitivity 1×; calculation still starts disabled until configured.

## RC2 corrections

- METAR accepts automatic cloud groups such as `SCT010///`: known coverage and height remain available, while cloud type is explicitly unavailable. The report text is preserved, and malformed groups still fail validation. Cached cloud descriptions are enriched without rewriting acquisition times or archive records. This handles the format specified in [CAA CAP 746 section 4.147](https://www.caa.co.uk/publication/download/12602).
- Grass Lab loads sliders from current saved settings. Reset fetches them again without loading history, then recalculates the alternative. It no longer resets to the last historical profile. The baseline check remains independent, and experiments never modify live settings.

## RC3 — Grass contribution heatmaps

- Six time-aligned strips show wetting and drying contributions, with matching slider colours and a shared brightness scale. Select any combination to overlay those factors behind the chart; select again to remove one or clear all overlays.
- Contribution tracing runs with the existing background replay, preserves the model arithmetic and recorded estimates, and distinguishes missing calculations from zero contribution. All chart windows, including 30 days, use the retained original inputs.
- Reset continues to read current saved settings, independently of historical profiles. The upgrade does not alter live multipliers, observations or the wetness reservoir.

## RC4 — Grass Lab inspection and layout

- Coloured markers follow actual retained settings changes, including reversals. They mark the first snapshot with a changed value, not the exact settings-save time. Imported tracker notes remain in exports without creating duplicate chart markers.
- Cursor time appears above the chart; the time scrubber is removed. Grid lines align to local midnight and whole hours, with adaptive spacing and DST handling. Contribution inspection follows the calculated acquisition interval, preserving real gaps.
- Current inspected readings sit above the heatmaps. The observations comparison is compact, slider explanations use the menu info bubbles, and redundant explanatory copy and replay timing cards are removed.
- Replay remains in the viewing browser's worker. Reset still fetches current saved settings. Live multipliers, reservoir, observations and recorded estimates are unchanged.

RC4 validation: 497 automated tests; AMD64/ARM64 image startup and observation persistence across restart; 24 focused native ARM64 tests. Live verification retained settings, seven observations and sampled history, with 3,294 baseline estimates reproduced exactly. These checks do not replace longer calibration observations.

## RC5 — Grass recovery and direct Apply

- Established wetness survives compatible interruptions of up to 30 minutes and resumes when fresh readings return. Recovery carries proven cumulative rain once, without inventing dew or drying in the gap. New reservoirs and longer/incompatible interruptions start at 0 with a 30-minute warm-up.
- Model versions are retained per sample, so old estimates replay under their original rules. Upgrading preserves valid existing state; new recovery rules affect future calculations.
- Apply beside Reset saves the seven Lab sliders through the existing weather-settings persistence and PIN protection, preserving the enable switch and unrelated settings.
- Observation entry is a clean standalone form. The duplicate Lab entry card is removed. Both save actions share a themed six-box PIN dialog with digit advance and paste support.

RC5 validation: 502 automated tests; AMD64/ARM64 startup and persistence across restart; 34 focused native ARM64 tests. Production-page checks covered Apply/Reset and PIN entry in both themes, plus the compact phone form. Live verification preserved configuration and ten observations; 4,197 retained estimates reproduced exactly across both model versions. Natural-outage behaviour and lawn calibration still need observation.

## RC6 — Grass Lab navigation and observation editing

The reviewed compact layout, whole-chart panning, resizable history navigator, latest-seven-day default and 24h/3-day/7-day presets are integrated. Click-toggle marker popups stay open for text selection; observation popups and the table open the PIN-protected editor with confirmed deletion. Phone time entry, current-setting Reset, centred Reset/Apply buttons, heatmap actions and the guarded menu link are included. See [RC6 details](release-0.15.0-rc6.md).

RC6 validation: 506 automated tests; AMD64/ARM64 startup and edit persistence across restart; 36 focused native ARM64 tests. Isolated production browser checks covered editing, PIN, both themes, phone entry and kiosk advice. Live verification preserved all 18 observations, settings and retained Grass snapshots; 6,271 retained estimates reproduced exactly. Physical touch and ordinary-use acceptance remain part of the RC trial.

## RC7 — clearer intensity colours and Grass information

Forecast bars now use a vertical Universal Blue gradient tied to absolute rain rate in Live and Archive. The existing automatic axes, bar heights, dry/missing markers and actual-rain overlay are unchanged. Light rain stays blue even when its bars fill the chart. Yellow begins around 5.6 mm/h, orange 11.5, orange-red 23.7 and deep red 48.6. These are approximate display conversions of the radar palette, using Z = 200 R^1.6, not exact equivalence between forecast rates and measured radar reflectivity. The palette follows the dock legend; no extra settings are added.

The full Grass widget has short help with an inline Lab link, including the existing kiosk warning. The settings-menu link and ready-state uncalibrated wording are removed. Grass Stats for nerds now shows only the current estimate and calculation age; Status retains setup, warm-up and failure information.

New installations and Reset to defaults use my observed tuning: rain 3×, dew 2×, sun 1×, wind 0.5×, air 0.5×, drainage 0.1× and sensitivity 1×. Existing saved settings and historical model fallbacks are preserved. There is no model arithmetic or schema change.

References: [RainViewer Universal Blue table](https://www.rainviewer.com/files/rainviewer_api_colors_table.csv), [Rainbow palette identification](https://doc.rainbow.ai/tile_colors/), [KNMI rainfall conversion reference](https://cdn.knmi.nl/knmi/pdf/bibliotheek/knmipubWR/WR2009-06.pdf).

RC7 validation: 508 automated tests, AMD64/ARM64 startup and persistent restart checks, and 49 isolated native ARM64 tests. Light/dark, Live/Archive, missing minutes, actual-rain overlays and kiosk-link cancellation were checked locally. The Pi host packages were updated and verified before the candidate switch. Deployment preserved all 24 observations, settings and retained history; replay reproduced 8,921 recorded estimates exactly. Physical feature acceptance and further normal use remain part of this RC trial.
