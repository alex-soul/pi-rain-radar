# RC3 synthetic UI review

This is a DEV-only review adapter, not the RC3 production implementation. It serves the existing app with the agreed Settings/UI changes and synthetic HA/weather behavior. Production `public/` and `src/` files are not changed by this adapter.

## Run

Keep the original synthetic preview/studio running on `http://127.0.0.1:3091`. From the product checkout run:

```powershell
node scripts/rc3-review/server.mjs
```

Open `http://127.0.0.1:3092/`. The original studio remains at `http://127.0.0.1:3091/__dev`. The adapter reuses its synthetic archive assets; when its fixed Live fixture ages out, it shifts a copy of those timestamps for Live display without reseeding the underlying archive.

Synthetic shared preferences persist in `%TEMP%\pi-rain-radar-rc3-ui-review\synthetic-settings.json`. Browser layout remains local to this review origin. Changes sync between review browsers by polling. This file is not the production appliance settings contract.

## Review

- System > API > HA: use `http://ha.example:8123` and `demo-token`. Real HA values are rejected. OWM uses 32 zeroes if a dummy key is needed.
- Interface > Weather > Source: choose HA, enable its weather collection in Source, map any of the four eligible readings, and select optional OWM fallback. Other readings intentionally use OWM.
- Interface > Camera: add one Direct or HA camera, Preview, Add, enable collection; the switch saves immediately. Enable the camera button separately under Buttons. Direct credentials are only transient UI input; no entered camera URL is fetched or saved. Use example values only.
- Review cases offers unavailable, stale, unit mismatch, HA connection/auth failures, no cameras, portrait image, and historical unit/fallback scenarios.
- For the history scenario, open the latest Archive window spanning the boundary shown in Review cases. Scrub across it. As recorded preserves simulated historical units and amber fallback; OpenWeather comparison shows ordinary OWM readings. Closing the popup preserves position.
- Map has Location / Regional / Embed. Regional saves a synthetic shared time zone and reloads the review. Power is above About. Storage details are under Storage; Status has four compact health groups.

## Evidence and limits

`node --test test/rc3-review.test.js` covers deliberate OWM versus fallback, unit mismatch, cache expiry after collection stops, and historical policy/units. Browser checks cover dummy HA/camera onboarding, mixed readings, fallback, historical unit changes/comparison, camera footer and portrait fit, menus, two-column controls and light/dark presentation. Transformed application modules were syntax checked.

The adapter uses runtime module transformations for rapid review and must not be deployed as product code. UI acceptance should be followed by normal source integration with tests. Live provider access is not part of this review.

Still requires implementation/validation before RC3: durable appliance-wide settings and upgrade defaults; independent HA health/observation collectors; real entity discovery and source metadata; persisted provenance and effective unit/source history; current attribution rules for generic upstream integrations; secure credential lifecycle; coordinated OWM collection/forecast behavior. These can first receive synthetic backend tests. RC then validates actual tokens/network/DNS/TLS, real camera image quality and sizing, units/report freshness over several days, reboot and multi-browser continuity, storage/rollover and Pi performance. No hardware/power action is validated here.


Batch 2 UI review: Units / Source sub-tabs; shared HA credentials remain under API > HA, with HA weather collection under Interface > Weather > Source. OWM stays under API > Weather. API > Radar has RainViewer and Rainbow Enable switches. RainViewer defaults on; new Rainbow configuration defaults off; existing review settings persist. Switches model settings/status only: the old synthetic radar fixture is still used for playback, so it is not proof of provider request suppression. Camera enable saves immediately with failure recovery. Map warning links to the existing map/history manual section; Storage explanations are expandable. Standard help and single LED styling are reused. Production documentation must reconcile configurable retention before release.


Current menu iteration: Interface has Display / Buttons / Radar / Weather / Camera. Weather contains Units / Source / Readings. Both independent weather collection switches are in Source, outside conditional HA mappings. Radar owns provider selection, settling, Enable switches and Rainbow budgets/estimates. API now has Rainbow / OpenWeather / HA connection setup only; no collection controls or built-in Map panel. Routine radar status paragraphs are removed; Status still reports operational state. The separate Feeds-menu proposal was superseded.


Latest layout: Weather tabs are Readings / Units / Source / Collection; both collection switches live in Collection. Radar uses source controls and RainViewer side by side on wide screens, then configured Rainbow below. Unconfigured Rainbow controls are hidden without changing selected sources. API order/default is OpenWeather / Rainbow / HA, with full-width credential forms. Storage policy, metrics and estimates share the Archive retention expander.


Post-save review prompts: save the dummy OWM key while collection is off to see Enable weather collection; save demo-token for HA with HA weather and HA camera collection off to see both setup links. Links only navigate/focus; they never enable collection. Already-active replacements show a simple saved confirmation. First OWM key addition leaves collection off; replacement preserves existing enablement. Radar source selectors and Apply share an outline; settling is last in the provider column. Compact Status was verified without overflow at1280x720.
