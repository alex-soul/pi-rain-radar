# Pi Rain Radar 0.10.0

This pre-release brings more flexible screen controls, gentler astronomy motion and local appliance display settings. The accepted RC was tested on the existing Pi appliance. Both architecture builds and published-image startup/restart checks passed. The installer is pinned to the verified release. I confirmed About 0.10.0 with all functions working and full MQTT synchronization after the published-image handover.

- Sun/Moon motion follows horizon limb crossings with a gentler passage through the centre. Astronomy review uses the production renderer and ten-minute slider steps.
- Tighter, stable weather dock spacing retains the broad curved outline. Reorder dock readings and side buttons directly by dragging; touch uses hold then drag.
- Widget settings move left and close moves right. Pinch preserves proportions; flexible corner resizing adjusts width/height independently. Edge resizing respects Overview/Camera aspect locks. Combined Weather Trends can grow to available screen height.
- Per-widget font sizing, separate Overview controls and main-map settings, and town-label density from none to above the original default. History and setup preview are preserved. Reset buttons are removed.
- Appliance groups Power and Screen. Local brightness and sleep settings share the controller with optional MQTT, with no broker required for local control.
- Compact filesystem storage bar, consistent control highlights/spacing, and camera retry text that works with any polling interval.

I tested the revised controls on desktop and phone and accepted the new features on my Pi, including Screen settings synchronized with MQTT. See [validation](validation.md) for automated checks and limits.

The portable installer now prepares a local display controller and authenticated Screen bridge independently of MQTT. **The changed fresh-install/reboot route remains experimental.** Fresh-card hardware testing is deferred for this release; the accepted existing-controller upgrade does not establish that result. The installer manifest pins v0.10.0 to the verified source commit, image index digest and source-file checksums; saved installation snapshots retain their earlier selection. See [installer notes](../host/installer/README.md).

Final-version checks: all 383 application tests passed locally; 25 installer and 25 display tests passed on Linux, along with shell syntax and isolated authenticated bridge installation checks. The latter use a mocked controller/systemd and do not replace hardware validation. Compatible archives and browser preferences are preserved; retain both Power and Screen overrides when upgrading an installation using those helpers.
