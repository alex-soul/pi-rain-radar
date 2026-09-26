# Optional MQTT display controls

Optional component of the public hardware-test installer. The control policy was tested
on a Raspberry Pi 4 with the official 7-inch Touch Display 2. The portable
installation, generated units and hardware detection still need fresh-Pi testing.

The adapter discovers six controls under one device: brightness (10–100%), idle
timeout (1–120 minutes), Wake, Sleep, screen state and **Automatic screen blanking**.
New installations start with blanking OFF and a saved 15-minute timeout. With it
ON, inactivity blanks the display; turning it OFF disables automatic sleep.
Explicit Sleep remains in effect across switch changes until touch or Wake.
Turning the switch ON starts a fresh interval. Brightness, timeout and policy
persist across controller restarts; restart starts the screen on.

Use the [guided installer](../installer/README.md); its `--reconfigure` option can
add or configure these controls later.
An existing broker/account and Home Assistant MQTT integration are prerequisites.
Setup asks for hostname, port, username and a hidden password. TLS defaults to No;
plain MQTT sends credentials/data unencrypted over the LAN. TLS verifies the
broker using system trust or your supplied CA file. It never creates certificates,
changes the broker/HA, or falls back from TLS to plaintext.

Each installation receives a persistent random device ID. Reconfiguration keeps
that ID and local display settings. Do not copy its config to a second Pi.
This is a new-install namespace, not a migration of an existing private adapter.

Files and ownership:

- `/etc/pi-rain-radar-display/config.json`: non-secret detected/configured host
  settings, root-owned. `mqtt.json` beside it is root-only mode 0600; systemd
  supplies it as a credential to the unprivileged adapter. Secrets are never in
  arguments, environment variables, generated unit text or installation logs.
- `/usr/local/lib/pi-rain-radar-display`: controller, adapter and shared config.
- User `pi-rain-radar-display.service`: Wayland local control, started by desktop
  autostart. The controller remains usable when MQTT is disconnected.
- System `pi-rain-radar-mqtt.service`: unprivileged adapter, starts on boot and
  reconnects. No shell commands arrive through MQTT. Only fresh, non-retained,
  validated commands are accepted.
- A narrowly matched udev rule permits the desktop user's primary group to write
  the detected backlight's brightness. No sudo policy or account groups change.
- `~/.local/state/pi-rain-radar-display/settings.json`: mode 0600 display settings.

After setup, check all six controls in HA, disconnect/reconnect the broker, test
touch and both blanking modes, then reboot. A running service alone does not prove
broker authentication, discovery, physical touch or reboot persistence.

Recovery: stop `pi-rain-radar-mqtt.service` with sudo and stop the user
`pi-rain-radar-display.service`. The controller attempts to restore the screen on;
`wlopm --on <your-output>` in its Wayland session is the direct recovery command.
Disable the MQTT unit and move the display autostart entry out of `~/.config/autostart`
to leave them stopped after reboot. Preserve settings/credentials and existing app
files. Reconfiguration backups are root-only under
`/var/lib/pi-rain-radar-display-backups`; they contain credentials and must remain
private. Broker retained discovery is not removed automatically. Removing this
component entirely, restoring brightness permissions and clearing only its own
retained topics still need a tested uninstall workflow; this is not yet provided.

Tests (isolated; no broker or hardware changes):

```sh
python3 -m unittest discover -s host/display-controls -p 'test_*.py'
bash -n install-pi.sh
```

Tests require paho-mqtt 2.x and Jinja2; runtime requires Debian's python3-paho-mqtt,
wlopm and swayidle. Do not run live acceptance scripts against another appliance.
