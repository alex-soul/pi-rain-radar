# Pi Rain Radar 0.13.0

This pre-release adds a compact Cloud layers widget alongside METAR/TAF. I tested and accepted RC2 and the final published image on my existing Pi 4 / 2 GB on 13 October 2026.

- **Cloud layers:** observed METAR bases with distinct FEW/SCT/BKN/OVC coverage, vertical-visibility haze and subtle CB/TCU shading. Shapes are illustrative; they do not claim measured cloud tops.
- **Make it fit:** 200×100px minimum size, edge/corner resizing, metres/feet and automatic/fixed scale. Adjust cloud opacity, size and irregularity separately from widget opacity and text size.
- **One Aviation button:** synchronized Panels switches select METAR, TAF and Cloud layers. Closing a panel turns its switch off; hiding the group retains your choices. If all panels are off, the next button click opens settings.
- **Same data, honest history:** shared collection and stable per-observation appearance in Live and Archive, with explicit freshness/error indication and the existing 90-minute METAR cutoff. No extra polling.
- **Retained playground:** reusable synthetic widget and integrated Aviation review surfaces, sharing production rendering and decoding.

Existing station, settings, layout and Archive are preserved. Clouds joins the next Aviation opening; it is not forced onto an existing screen. Fresh screens start with all three selected and hidden. [Aviation guide](aviation.md) · [Upgrade details](upgrading.md#0130) · [Widget playground](widget-playground.md).

RC1 passed 449 native ARM64 tests; RC2 passed 20 affected tests locally and natively plus fresh startup/restart. Pi review covered the UI and revised close/reopen behaviour. Bounded resource/health checks passed; these are not a prolonged soak or a fresh-card Pi 4 installer test.

[Release CI](https://github.com/alex-soul/pi-rain-radar/actions/runs/38425742918) passed all 450 tests, AMD64/ARM64 builds and fresh startup/restart on both architectures. The Pi handover preserved settings, Archive and host-helper configuration. The guided installer pins the exact release/source/image digest; 25 installer and 25 display-control Linux tests, shell/checksum checks and [installer CI](https://github.com/alex-soul/pi-rain-radar/actions/runs/38427084925) passed. Existing saved installer snapshots keep their original release; rerunning is not an app upgrade.
