# 0.15.0 release candidate

`0.15.0-rc.1` is for appliance observation and feedback. It does not promote the public `latest` image or change the guided installer's accepted 0.14.0 pin.

- Grass scores show one decimal in the dock, trends and full widget. The full widget uses five bars, a smaller number and the descriptive heading, without the denominator or footwear helper text.
- Archive GIF export preserves the playback slider track and thumb.
- Aviation and Grass have current integration status, with the official aviation provider status link and concise current-only Stats for nerds.
- [Grass Lab](grass-lab.md) and the separate mobile observation page are maintained direct routes, with persistent observations, 30-day compact history and experimental replay. They do not appear in radar menus and do not change live calibration.
- The local `__dev` scenario playground remains available for development.

The Grass model remains an uncalibrated estimate. This candidate improves observation and comparison; it does not claim to solve dew behaviour or introduce a new predictive model. See [Grass setup and tuning](grass-wetness.md).

Upgrading adds Grass tables to the existing SQLite database without rewriting recorded archive estimates or removing existing settings/media. The 30-day input collection begins with whatever presentation history is still retained. Existing observation records survive normal history cleanup. Back up application data before an upgrade.

Candidate images are built and smoke-tested on AMD64 and ARM64 by the manually dispatched **Build release candidate** workflow. A candidate is explicitly pinned for testing; final publication and installer pin changes follow appliance acceptance separately.
