# Troubleshooting and PIN recovery

On the Pi, first connect from your laptop with SSH, then run commands in the app folder. Docker commands below need sudo on the documented Pi setup; omit it on Docker Desktop.

```sh
cd ~/apps/pi-rain-radar
sudo docker compose ps
sudo docker compose logs --tail 50 radar
```

## If something looks wrong

| Problem | Try this |
| --- | --- |
| “no configuration file provided” | Open the terminal in the folder containing `compose.yaml`, then run the command again. |
| Docker command missing, or cannot connect to Docker | Finish Docker installation, open Docker Desktop if applicable, and wait until it is running. Reopen the terminal after installation. |
| Browser cannot open the page | Check Docker is running, run `sudo docker compose up -d`, and open the Pi hostname/IP on your laptop. localhost only works on the computer running the app. Check both devices are on the same network; guest Wi-Fi may isolate devices. |
| Old radar after sleep or a network outage | Confirm Docker and Internet access have recovered. Allow time for the next check and downloads. If it stays stuck, refresh the page, then check recent logs or restart the app. Sleep pauses acquisition; it does not build history in the background. |
| Amber radar / missing timeline frames | Let acquisition retry. The provider may have missing frames or be unavailable. Playing cached data is expected. |
| No temperature or minute forecast | Save a One Call 4.0-enabled key, then check connection health in System → Status and details in Log. A radar-only setup works without it. |
| OpenWeather reports HTTP 401/403 | Check the key, activation and separate One Call 4.0 subscription in your provider account. A 3.0 or standard Weather API subscription is insufficient. |
| OpenWeather reports HTTP 429 | Check your account request limit and other apps using the account. The app retries automatically; repeated saves will not fix a provider limit. |
| A toolbar button disappeared | Open **Settings → Interface → Buttons** and enable it again. Tap the screen to reveal the settings cog. |
| Forgot the PIN | Follow [PIN recovery](#pin-recovery). There is no need to delete saved data. |

For technical details, see [Run and develop](development.md). For project status, see the [README](../README.md).

## PIN recovery

Use a terminal on the computer running Docker, or connect to that computer over SSH. Open the folder containing the app's `compose.yaml`. These commands use your access to Docker; they do not ask for the old app PIN.

### Set, replace or enable a PIN

The original command still works:

```sh
sudo docker compose exec radar node src/setup-pin.js
```

Enter a new six-digit PIN, press Enter, repeat it and press Enter again. Input is hidden: no digits or dots appear in the terminal. Leading zeroes are supported. A mismatch or cancellation with Ctrl+C leaves the existing PIN unchanged. Never put the PIN itself in the command line.

The explicit commands below perform the same operation: choose a new PIN and enable protection.

```sh
sudo docker compose exec radar node src/setup-pin.js --set
sudo docker compose exec radar node src/setup-pin.js --reset
sudo docker compose exec radar node src/setup-pin.js --enable
```

Use any one of these commands. `--enable` asks for a new PIN because disabling removes the previous PIN hash.

### Disable a forgotten PIN

```sh
sudo docker compose exec radar node src/setup-pin.js --disable
```

This removes PIN protection immediately. Close and reopen settings in the browser; they will open freely. You can then set a new PIN in the PIN tab whenever you want.

### Check status

```sh
sudo docker compose exec radar node src/setup-pin.js --status
```

This prints only whether protection is enabled or disabled. `--help` lists the commands.

All changes persist across restarts and require no container restart. Set/reset/enable invalidates old unlocked sessions; close and reopen browser settings after recovery. A delay caused by failed PIN guesses can remain for up to five minutes after setting a replacement; wait before retrying. Disable allows access immediately.

The map configuration, OpenWeather key and radar archive are preserved. Do not delete the Docker volume to recover a PIN. If Docker reports that the service is stopped, run `sudo docker compose up -d` first. If the command reports that recovery is unavailable, check the data volume and filesystem permissions; do not erase the volume.


See the [screen indicator guide](indicators.md) for status meanings, [radar provider guide](radar-providers.md) for setup and estimates, and [Device Power guide](device-power.md) for the optional host helper.

## Archive, collection and HA/camera checks

- **API saved but no new data:** credentials and collection are separate. Check Interface → Radar or Weather → Collection, or Interface → Camera. Disabled feeds retain stored data but make no background acquisitions. Status distinguishes configuration, enabled state and health.
- **HA connected but no weather reading:** check the entity mapping, reported unit and `last_reported` freshness. HA values must match shared app units; changing HA units later is detected on subsequent polls. Connection health alone cannot establish entity freshness.
- **HA connected but camera unavailable:** confirm the camera works inside HA and the selected entity still exists. HA can return HTTP500 for its image endpoint while `/api/` remains healthy. In0.7.0 some camera transport failures use the imprecise message “Could not read the Home Assistant camera list.” Do not assume a token is wrong solely from that message. Never post credentials or a credential-bearing camera URL in an issue.
- **Older Archive choice will not load:** rolling retention or storage pressure may have removed it after the picker opened. Reopen the picker and choose available history. A browser may continue replaying frames already in memory; this does not mean the server still retains them.
- **Archive unexpectedly starts over:** pre-0.7.0 upgrades intentionally start fresh. Confirmed database corruption may also create a fresh archive while preserving failed evidence. Check Storage/Status and logs; keep the whole data directory for diagnosis. Do not repeatedly delete the DB or edit schema versions. Use the [backup/restore guide](archive-backup.md).

Camera images are visible to people who can access the dashboard. The optional Settings PIN protects configuration, not viewing; use the installation's network-access controls for privacy.
