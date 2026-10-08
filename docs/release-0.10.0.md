# 0.10.0 — draft release notes

**Unpublished.** 0.10.0-rc.1 has been tested and accepted on the existing Pi appliance. The final release image and installer pin are still pending.

- Sun/Moon motion follows horizon limb crossings with a gentler passage through the centre. Astronomy review uses the production renderer and ten-minute slider steps.
- Tighter, stable weather dock spacing retains the broad curved outline. Reorder dock readings and side buttons directly by dragging; touch uses hold then drag.
- Widget settings move left and close moves right. Pinch preserves proportions; flexible corner resizing adjusts width/height independently. Edge resizing respects Overview/Camera aspect locks. Combined Weather Trends can grow to available screen height.
- Per-widget font sizing, separate Overview controls and main-map settings, and town-label density from none to above the original default. History and setup preview are preserved. Reset buttons are removed.
- Appliance groups Power and Screen. Local brightness and sleep settings share the controller with optional MQTT, with no broker required for local control.
- Compact filesystem storage bar, consistent control highlights/spacing, and camera retry text that works with any polling interval.

I tested the revised controls on desktop and phone and accepted the new features on my Pi, including Screen settings synchronized with MQTT. See [validation](validation.md) for automated checks and limits.

The portable installer now prepares a local display controller and authenticated Screen bridge independently of MQTT. Its new fresh-install/reboot route still needs affected hardware validation; the accepted existing-controller upgrade does not establish that result. The installer manifest remains pinned to verified v0.9.0 until a new published image is verified and its exact source/digest/checksums are recorded. See [installer notes](../host/installer/README.md).
