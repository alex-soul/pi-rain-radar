# Pi Rain Radar

A dedicated rain-radar screen for your home. Animate recent rain, see where it has been moving, and glance at optional current temperature and wind readings.

![Historical rain radar centred on Coventry](docs/images/radar-preview-20260916-2147.gif)

*Recorded on 16 September 2026 in v0.3.0: 13 radar frames over Coventry, spanning 19:40–21:40 BST, with Overview and MinuteCast open. Historical demonstration, not live conditions; weather readings and MinuteCast reflect capture time. Radar by [RainViewer](https://www.rainviewer.com/), basemap by [Natural Earth](https://www.naturalearthdata.com/), weather by [OpenWeather](https://openweathermap.org/). [Static preview](docs/images/radar-preview-20260916-2147.png).*

## Status

**v0.4.0 is a pre-release.** I tested the new candidate on my Raspberry Pi 4 with 2 GB RAM, including six-hour playback at full speed and restart/shutdown recovery. Native ARM64 tests and startup/restart checks passed. Prolonged soak remains a [follow-up](docs/follow-ups.md). See [validation](docs/validation.md) and the [changelog](CHANGELOG.md).

Pi Rain Radar focuses on rain: recent radar playback, a small overview map, optional next-hour precipitation forecasts and a few current readings. It is not a general-purpose weather dashboard.

## Run with Docker

Install Docker with the Compose plugin. For a new installation on Linux or a Pi (existing installations should use [Upgrade](#upgrade)):

```sh
mkdir -p ~/apps/pi-rain-radar
cd ~/apps/pi-rain-radar
curl -fL https://raw.githubusercontent.com/alex-soul/pi-rain-radar/main/compose.yaml -o compose.yaml
docker compose pull
docker compose up -d
```

Use `sudo docker` if your Linux user needs it. Open [localhost:3080](http://localhost:3080) on the host, or `http://<host-name>.local:3080` from another device on your home network. Allow roughly 2–3 minutes for initial radar acquisition.

The configuration download follows `main`; Docker runs the latest published image, including pre-releases. It does not build unreleased application source. For a fixed release and matching configuration, see [version pinning](docs/upgrading.md#pinning-a-version-and-rollback).

Ready-built images support Linux ARM64 (64-bit Raspberry Pi OS) and AMD64. No Git, Node installation or local build is needed. For Windows/macOS and remote setup of Map, OpenWeather and optional PIN, see [Quick Start](docs/quick-start.md).

### Upgrade

```sh
cd ~/apps/pi-rain-radar
docker compose pull
docker compose up -d
```

Settings and history stay in the existing data volume. Browsers running v0.1.2 or later reload automatically when the app version changes, after Settings is closed. See [upgrades and migration](docs/upgrading.md) for older source installs and version pinning. The `latest` channel currently includes pre-releases; upgrades happen only when you run these commands.

## What you get

- Two, four or six hours of animated radar, refreshed automatically, with adjustable speed, pause and a timeline showing missing frames.
- **RainViewer or Rainbow Weather — or both.** Choose either provider for Main and Overview independently, so you can compare them or manually switch when one has problems.
- **One Rainbow map can fit within the free tile allowance.** The default single-map estimate leaves room below 30,000 tiles/month, assuming snapshot checks are free. Includes usage estimates and an optional request cap; see [setup and usage assumptions](docs/radar-providers.md).
- A seven-day local archive that builds while the app runs.
- One Pi, multiple screens: each browser remembers its own buttons, widget layout and theme while sharing the same location and data. Radar and weather acquisition are shared between screens. See [LAN setup](docs/quick-start.md#3-open-it-from-your-laptop).
- Last-good cached playback through outages; incomplete timestamps do not block newer complete frames.
- Coventry defaults, with location, map zoom and time zone configurable in Settings.
- Optional six-digit settings PIN, managed in the UI, with [host recovery](docs/troubleshooting.md#pin-recovery).
- Optional OpenWeather current temperature, feels-like, wind/gusts and minute precipitation forecast, using your own One Call 4.0 key.
- Ten optional readings, including visibility, pressure and UV index, configurable units and wind-arrow convention.
- Optional host restart/shutdown from Settings, per-display UI lock and a small diagnostic log.
- Light/dark themes and touch controls. Target display: 1280 × 720 landscape; other shapes crop the map.

No PIN or API key is needed to start viewing radar. Overview and MinuteCast start closed. The app runs independently of Home Assistant.

## Documentation

- [Quick Start — install and configure from another computer](docs/quick-start.md)
- [Raspberry Pi build — unpacking to automatic kiosk, without an attached keyboard](docs/raspberry-pi.md)
- [User manual — settings and controls](docs/manual.md)
- [Screen indicators — numbered guide to colours and status](docs/indicators.md)
- [Radar providers — Rainbow setup, estimates and limits](docs/radar-providers.md)
- [Device Power — optional restart/shutdown setup](docs/device-power.md)
- [Release follow-ups](docs/follow-ups.md)
- [Upgrades — routine updates, migration and rollback](docs/upgrading.md)
- [Troubleshooting and PIN recovery](docs/troubleshooting.md)
- [Development — local workflow and tests](docs/development.md)
- [Design — architecture, behaviour and known limitations](docs/design.md)
- [Validation — tested baseline and next checks](docs/validation.md)
- [Contributing](CONTRIBUTING.md)
- [Third-party data and licences](THIRD_PARTY_NOTICES.md)

Node.js 24, Sharp and plain browser JavaScript. The backend prepares map frames; the browser plays them over locally bundled maps. Settings and acquired data persist in a Docker volume. The supplied configuration serves port 3080 on the home LAN; an optional bind-address setting restricts it to loopback.

## Licence and data

Pi Rain Radar is [MIT-licensed](LICENSE). You may use, modify and redistribute the software, including commercially, while retaining the copyright and licence notice.

**Weather data is subject to separate provider terms.** RainViewer's public API is intended for personal, educational and small community use; commercial integrations must check terms with the provider. OpenWeather requires your own eligible subscription/key. See [third-party notices](THIRD_PARTY_NOTICES.md).

Radar is delayed and coverage is best effort. An uncoloured area is not proof that it is dry.

> [!TIP]
> Questions about installation, the interface, troubleshooting or development? Give your AI this repository link and ask. The documentation covers beginners and developers; [screen indicators](docs/indicators.md) explains the colours.

## Inspiration

Inspired by [Eric Lewin's Pi Weather Station](https://github.com/elewin/pi-weather-station). Pi Rain Radar is a new application, not a fork.
