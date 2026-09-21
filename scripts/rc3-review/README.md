# Historical RC3 synthetic UI review

This adapter supported the 0.7.0 design review and is retained as a synthetic fixture. The accepted production implementation now lives in `public/` and `src/`; backend settings, HA/camera collection, source/unit history and request gating were implemented and validated before publication. Do not treat the adapter as the current production contract.

To recreate this historical review, first run `npm run dev:scenarios`, then `node scripts/rc3-review/server.mjs`. Studio is3091; this adapter is3092 and conflicts with the optional LAN embed adapter. Preferences are disposable under `%TEMP%/pi-rain-radar-rc3-ui-review`. Never enter real credentials: HA accepts `http://ha.example:8123` / `demo-token`, and OWM uses 32 zeroes.

It provides fake connection, camera, unit-mismatch, fallback and historical-policy cases. No entered camera URL is fetched. Camera/HA/network behavior must be tested through the production modules separately. `test/rc3-review.test.js` covers the synthetic model only.

Final layout: Interface → Radar / Weather / Camera; Weather → Readings / Units / Source / Collection; System → API → OpenWeather / Rainbow / HA; Map → Location / Regional / Embed; Power above About. The normal product [manual](../../docs/manual.md) and [development guide](../../docs/development.md) supersede the earlier design iterations.

Stop the supervisor/backend and adapter when finished and remove only their verified disposable data directories. Keep reusable sources and release evidence.
