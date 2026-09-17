# Device Power

Restart or shut down the host from **Settings → System → Status → Device Power**. This is optional: radar works normally without it. Grey buttons open setup guidance; once configured, each action asks for confirmation. A Settings PIN protects these actions if you enable one. Without a PIN, anyone who can access your app can request device power actions.

## Enable

Supported hosts: Debian 12 or later and Raspberry Pi OS Bookworm or later, running systemd, with Python 3 installed. The helper runs on the host, separately from Docker. These instructions apply to a release containing Device Power support.

From a checkout of the matching release on your Pi:

```sh
sudo sh host/device-power/manage.sh install
```

From your existing radar Compose directory, retain your usual overrides and add the generated power override:

```sh
sudo docker compose -f compose.yaml -f /etc/pi-rain-radar-power/compose.power.yaml up -d
```

Use that same override when recreating/upgrading the app. Re-running the installer updates the helper while preserving its token and request ledger. It does not restart or shut down your Pi. No API subscription or PIN is required.

## What it permits

The app can ask a small host service to run only `systemctl --no-block reboot` or `systemctl --no-block poweroff`. It cannot supply a shell command. The service listens only on a Unix socket; requests are authenticated with a shared secret, expire after 30 seconds and cannot be replayed. Recent power requests block another request for two minutes, including after a helper restart. The app gets only the socket, a read-only token and a supplementary group; it needs neither a privileged container nor the Docker socket. The host service runs as root with a restricted systemd sandbox. Keep the token private.

## If it does not work

Select a power button for the current connection/setup message. Check the helper on the host:

```sh
sudo sh host/device-power/manage.sh status
sudo journalctl -u pi-rain-radar-power.service -n 30 --no-pager
```

Check that the app was recreated with the override and that both configured mounts exist. A request accepted by the helper is not proof that the host finished shutting down. If the connection drops during confirmation, check the device before retrying. After shutdown, wait until the host has finished before unplugging it; reconnect power to start it again. A physical shutdown test needs a way to reach the Pi and turn it back on.

## Disable

Recreate the app using its usual Compose files without the power override, then run:

```sh
sudo sh host/device-power/manage.sh remove
```

Removal stops/disables the service and removes its executable/unit. It preserves the token, replay ledger, generated override and group for reinstalling. The radar app stays usable and its power buttons return to setup guidance. This does not change radar data, API keys or Settings PINs.
