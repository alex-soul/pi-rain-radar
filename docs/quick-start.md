# Quick Start

Run Pi Rain Radar, then configure it from a browser. No programming, Git or Node installation is required.

**Starting with a boxed Raspberry Pi and screen?** Follow the [Raspberry Pi build guide](raspberry-pi.md). It covers assembly, flashing, Wi-Fi, SSH, Docker and automatic kiosk startup without a keyboard or mouse attached to the Pi. Come back here when it reaches app installation.

**Already installed?** Use the [user manual](manual.md) or [upgrade guide](upgrading.md).

## 1. Prepare Docker

- **Pi:** follow the Docker section in the [build guide](raspberry-pi.md#5-install-docker).
- **Other Linux computers:** install [Docker Engine and Compose](https://docs.docker.com/engine/install/).
- **Windows/macOS:** install and open [Docker Desktop](https://docs.docker.com/desktop/). Wait until it is running. Windows needs Linux containers.

Images support Linux ARM64 and AMD64. The Pi walkthrough used 64-bit Raspberry Pi OS on a Pi 4 with a 7-inch Touch Display 2. The app's recommended display shape is 1280 × 720 landscape; other shapes crop the main map.

## 2. Install the app

The maintained Compose file uses the `latest` published image by default, including pre-releases. The configuration download follows `main`; it does not build unreleased application source. Updates are manual. For a fixed release and matching configuration, see [version pinning](upgrading.md#pinning-a-version-and-rollback).

### Raspberry Pi / Linux

Run these in your **Pi SSH terminal**, one block at a time. On other Linux machines, use their terminal. These are first-install commands: if this folder already contains an installation, use [Upgrading](upgrading.md) instead.

```sh
mkdir -p ~/apps/pi-rain-radar
cd ~/apps/pi-rain-radar
```

Download the one configuration file Docker needs. This command refuses to overwrite an existing one:

```sh
if [ -e compose.yaml ]; then
  echo 'compose.yaml already exists. Follow the upgrade guide instead.'
else
  curl -fL https://raw.githubusercontent.com/alex-soul/pi-rain-radar/main/compose.yaml -o compose.yaml
fi
```

If downloading reports an error, stop and resolve it before continuing.

```sh
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

Docker downloads the ready-built image and starts it. No source archive or compilation is needed. `ps` should eventually show **healthy**; `starting` briefly is normal. The folder stays `~/apps/pi-rain-radar` for future upgrades.

### Windows / macOS

1. Create a folder named `pi-rain-radar` somewhere you want to keep it.
2. Save [compose.yaml](https://raw.githubusercontent.com/alex-soul/pi-rain-radar/main/compose.yaml) in that folder. Keep the exact filename, not `compose.yaml.txt`.
3. Open a terminal there. On Windows, click File Explorer's address bar, type `powershell`, and press Enter. On macOS, open Terminal, type `cd `, drag the folder into the window, and press Enter.
4. Run:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

Leave Docker Desktop running. Closing the terminal is fine. A sleeping computer stops collecting radar history.

## 3. Open it from your laptop

For a Pi with the example hostname `pi-weather`, open **http://pi-weather.local:3080** on a laptop connected to the same home network. If the name does not resolve, substitute its IP address, for example `http://192.168.1.50:3080` (use your actual Pi address).

If the app runs on the computer you are using, open **http://localhost:3080**. `localhost` means this computer; it will not reach a separate Pi.

The first-start popup shows preparation and image-download progress. Allow roughly 2–3 minutes, sometimes longer on a slow connection or when the provider is unavailable. The app switches to radar automatically. No RainViewer account or API key is needed.

LAN access is intended for a trusted home network. HTTP does not encrypt API-key or PIN entry. Do not forward port 3080 through your router to the Internet. For local-only access, set `RADAR_BIND_ADDRESS=127.0.0.1` in `.env` beside Compose and recreate the container with `docker compose up -d`.

## 4. Configure from the laptop

Move the pointer or tap the page to reveal the settings cog at the bottom right. Open Settings. It is unlocked on a fresh installation.

1. **Map:** choose a label, latitude/longitude and time zone. Typing a place name does not find its coordinates. Preview if you want, then Apply. The progress popup stays visible while the new view is prepared. All connected screens adopt the change. Coventry is ready to use if you prefer to try it first.
2. **System → API, optional:** paste your [OpenWeather One Call 4.0](https://openweathermap.org/api/one-call-4) key and Save key. This adds current readings and MinuteCast. Activate the separate 4.0 subscription first, even if you already use 3.0. Check the provider's access/pricing and set the daily limit to 1,000 to stay within its currently advertised free allowance; the default 2,000 limit permits charges. After moving the map, allow 10–15 minutes for the next weather request. Radar works without a key.
3. **System → PIN, optional:** enable protection and enter your chosen six-digit PIN twice, then Save. Leave protection disabled if you do not want it. There are no setup nags. [Forgotten PIN recovery](troubleshooting.md#pin-recovery) uses SSH and does not erase data.

Use the laptop for typing; you do not need a keyboard attached to the Pi. See the [manual](manual.md) for every setting and status colour.

## 5. Arrange each screen

On the Pi touchscreen, open the widgets you want, drag them into position and resize them with their corner handles. In Settings → Interface → Buttons, show/hide and reorder the controls. These display preferences belong to that browser; arranging your laptop does not rearrange the Pi.

One Pi can serve multiple screens, sharing location and downloaded data while each browser keeps its own layout. Use the same address and browser profile each time. Switching from hostname to IP, or clearing browser site data, starts a separate layout.

For automatic full-screen startup, continue with [kiosk setup](raspberry-pi.md#7-start-the-screen-automatically).

## 6. Keep it updated

On the Pi, connect over SSH and run:

```sh
cd ~/apps/pi-rain-radar
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

No reinstall or reflashing is required. [The upgrade guide](upgrading.md) explains what each command does, version selection and recovery. Keep the data volume: it contains the app settings and history.

## Need help?

- [User manual: settings, widgets, history and colours](manual.md)
- [Troubleshooting and PIN recovery](troubleshooting.md)
- [Upgrades and migration from older installations](upgrading.md)
- [Technical architecture](design.md) and [development](development.md)
