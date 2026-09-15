# Upgrades and migration

## Routine upgrades

First read the [release notes](https://github.com/alex-soul/pi-rain-radar/releases). On your laptop, open PowerShell/Terminal and connect to the Pi just as during setup:

```sh
ssh YOUR_USERNAME@pi-weather.local
```

Use your actual username and hostname. If SSH is already connected, do not open another connection. Run the following in that **Pi SSH terminal**, in the folder containing `compose.yaml`:

```sh
cd ~/apps/pi-rain-radar
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
```

| Command | What it does |
| --- | --- |
| `cd ...` | Selects the permanent app folder; it does not change the app. |
| `pull` | Downloads the new image while the existing app keeps running. Wait for it to finish successfully. |
| `up -d` | Replaces the container if needed and starts it in the background, using the same saved data. A brief interruption is normal. |
| `ps` | Shows whether the new container is starting or healthy. |

If `pull` fails, stop there: check the network/error and retry later. Do not delete the running container or volume. If `up` fails or the container remains unhealthy, run `sudo docker compose logs --tail 50 radar` and use [Troubleshooting](troubleshooting.md). The health URL is `http://localhost:3080/healthz` when checked from the Pi; `hasFrame:false` briefly can be normal at startup.

You do not need to download Compose again for an ordinary image update. If release notes require a configuration change, preserve your old file and follow those specific instructions. There is no need to reboot just for an app update once your browser is running v0.1.2 or later. Raspberry Pi OS updates are separate and can still need a reboot.

If the app itself runs on Windows/macOS, omit `sudo`. The image is built for both Linux ARM64 and AMD64; Docker chooses automatically. Keep the same Compose project name (`pi-rain-radar`) and volume (`radar-data`). Do not use `down --volumes`: that deletes your settings and history.

The default `latest` tag follows the most recently published image, including pre-releases during this early stage. It does not update itself: run the commands when you want to upgrade. Read release notes first; future releases may require an explicit Compose or data migration.

Browsers already running v0.1.2 or later detect a different server version on the next successful status poll (normally within 15 seconds), then reload. Reload waits while Settings is open. Browser preferences remain stored at the same address. When migrating from an older version, refresh each browser once; rebooting a kiosk is an alternative if it has no keyboard.

## One-time migration from v0.1.0 or v0.1.1 source builds

No reinstall or SD-card flashing is needed. From the existing installation folder, back up Compose and replace its `build: .` line with the published image:

```sh
cd ~/apps/pi-rain-radar
cp compose.yaml "compose.yaml.backup-$(date +%Y%m%d-%H%M%S)"
sed -i 's|build: \.|image: ghcr.io/alex-soul/pi-rain-radar:latest|' compose.yaml
sudo docker compose config --images
sudo docker compose pull
sudo docker compose up -d
sudo docker compose ps
curl -fsS http://localhost:3080/healthz
```

The image line printed by `config --images` should be `ghcr.io/alex-soul/pi-rain-radar:latest`. The existing port binding, project name, data volume and `.env` stay unchanged. If your Compose file is customised or still has a `build` section, edit it explicitly instead of using this substitution. Old source files may remain; they are no longer used by the container. Keep them until you have confirmed the migration.

## Pinning a version and rollback

The supplied Compose file accepts `RADAR_VERSION=v0.1.2` in a `.env` file beside it. Preserve any other entries in that file. Run pull and up again to use that fixed version. To follow the moving channel, remove that entry or set it to `latest`.

For a migrated file with a literal image tag, replace `:latest` on its image line with the desired published tag, for example `:v0.1.2`. Published images start at v0.1.2; older versions were source-only builds.

Keep a backup of your data before upgrades that change stored formats. Selecting an older image does not restore older data. During the first migration, the saved Compose file and locally built image provide a rollback path: restore the Compose backup and run `sudo docker compose up -d --no-build` while those local assets still exist.

## Validation boundary

The release workflow tests fresh startup and persistent data across container restart for both architectures, without provider network access. ARM64 is exercised under emulation in CI. This does not replace real-Pi testing of touch, Chromium, kiosk startup, network recovery or long-running performance. Existing data can be retained while validating those on the appliance; reflashing is not necessary.

## Tested on the reference Pi

Migration from the source build to the published v0.1.2 ARM64 image, reboot, retained configuration, a map change back to Coventry, the preparation popup and the OpenWeather waiting hint were confirmed by the user. Automatic reload across a subsequent version change is covered by browser-logic tests; a later real-Pi version-to-version check is still pending.
