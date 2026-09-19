# Device Power

Restart or shut down the host from **Settings → System → Status → Device Power**. This is optional: radar works normally without it. Grey buttons open setup guidance; once configured, each action asks for confirmation. A Settings PIN protects these actions if you enable one. Without a PIN, anyone who can access your app can request device power actions.

## Enable

After an accepted action, Settings closes and a dismissible **Reboot initiated** or **Shutdown initiated** message explains what happens next. Already-loaded radar may continue while usable, and the browser reconnects automatically. This does not guarantee indefinite offline playback. Unconfirmed requests retain an error message; they are not retried automatically.

Supported hosts: Debian 12 or later and Raspberry Pi OS Bookworm or later, running systemd, with Python 3 installed. The helper runs on the host, separately from Docker. These instructions apply to a release containing Device Power support.

From a checkout of the matching release on your Pi:

```sh
sudo sh host/device-power/manage.sh install
```

For a standard installation, link the generated power configuration into your app directory once. Compose then loads it automatically, including during upgrades:

```sh
cd ~/apps/pi-rain-radar
ln -s /etc/pi-rain-radar-power/compose.power.yaml compose.override.yaml
sudo docker compose up -d
```

If `compose.override.yaml` already exists, do not replace it. Use the explicit configuration described under [Upgrade](#upgrade), retaining your existing overrides. The automatic setup assumes you do not select different files through `-f` or `COMPOSE_FILE`.

No API subscription or PIN is required.

## Upgrade

**Automatic setup above:** the usual README commands preserve Device Power:

```sh
cd ~/apps/pi-rain-radar
sudo docker compose pull
sudo docker compose up -d
```

**Earlier installations using explicit overrides:** either create the link described under [Enable](#enable) once, or include the power configuration on every upgrade:

```sh
cd ~/apps/pi-rain-radar
sudo docker compose -f compose.yaml -f /etc/pi-rain-radar-power/compose.power.yaml pull
sudo docker compose -f compose.yaml -f /etc/pi-rain-radar-power/compose.power.yaml up -d
```

If you use other overrides, include their `-f` arguments too, before the power override. Explicit `-f` commands do not automatically load `compose.override.yaml`. If `pull` fails, stop before running `up`.

The app image update preserves settings and history but does not update the host helper. Only when release instructions require a helper update, re-run its installer from the matching release checkout. This preserves its token and request ledger and does not restart or shut down your Pi.

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

If you used the automatic setup, first remove only the link created above. This command refuses to remove a different file or link:

```sh
cd ~/apps/pi-rain-radar
if [ -L compose.override.yaml ] && [ "$(readlink compose.override.yaml)" = /etc/pi-rain-radar-power/compose.power.yaml ]; then
  rm compose.override.yaml
fi
```

Recreate the app using its usual Compose files without the power override, then run the removal command from the release checkout:

```sh
sudo sh host/device-power/manage.sh remove
```

Removal stops/disables the service and removes its executable/unit. It preserves the token, replay ledger, generated override and group for reinstalling. The radar app stays usable and its power buttons return to setup guidance. This does not change radar data, API keys or Settings PINs.
