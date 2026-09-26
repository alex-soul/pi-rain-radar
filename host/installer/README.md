# Guided installer: hardware testing

The permanent entry point is the repository-root `install-pi.sh`. It is public
for first fresh-hardware trials; Pi 5/Pi 4 installer acceptance is not yet complete.
The main user guides do not point to it yet. The planned **Ludicrously Quick Guide**
will cover flashing, assembly, SSH and the guided steps after the walkthrough works.

Run in the Pi SSH terminal as the normal desktop user:

```sh
curl -fsSL https://raw.githubusercontent.com/alex-soul/pi-rain-radar/main/install-pi.sh -o /tmp/pi-rain-radar-install.sh && bash /tmp/pi-rain-radar-install.sh
```

Fresh, dedicated Raspberry Pi OS 64-bit **Desktop Trixie / labwc** only. Pi 4B and
Pi 5 with official 7-inch Touch Display 2; official 10-inch is Pi 5 only and remains
best-effort, untested. Wait for the desktop before running. Existing Docker/app
installations are rejected; use the manual guide for those.

The flow confirms optional Power (Yes) and MQTT (No), rotates the display and asks
for physical picture/touch confirmation before the long OS upgrade. It persists
orientation, performs a required full initial upgrade, then asks for a reboot.
Reconnect over SSH and run **the same command** to resume. It then installs Docker,
the pinned published app, desktop autologin, a dedicated Chromium kiosk and the
selected helpers. A final reboot tests automatic startup; rerunning performs checks.

New MQTT installs start automatic blanking OFF, with a saved 15-minute timeout.
Setup verifies broker authentication/TLS before replacing an existing configuration.
HA discovery/controls and physical behaviour still require user confirmation.
No HA/broker installation, certificate provisioning, maintenance scheduler, app
updater or SSH policy change is included. Map/providers/PIN remain in the app UI.

## Version and retry contract

The bootstrap resolves one public `main` commit, downloads all runner/MQTT files
from that exact snapshot, and caches the complete bundle. The selected commit and
application manifest are saved in `~/.local/state/pi-rain-radar/install.json`.
Reboots/retries reuse that snapshot. `release.json` explicitly pairs this runner
with published v0.8.0, its immutable image digest, and checksummed Compose/Power
files from the release source commit. No `latest` app image or unrelated main
helper is used. This supports prereleases without relying on GitHub's stable-only
latest-release endpoint.

- `bash /tmp/pi-rain-radar-install.sh --check`: bounded service/HTTP/orientation checks.
- `bash /tmp/pi-rain-radar-install.sh --reconfigure`: add optional Power/MQTT or
  re-enter MQTT connection settings; existing options are retained. It does not
  uninstall services or silently upgrade the app.
- `bash /tmp/pi-rain-radar-install.sh --refresh-installer`: explicitly download the
  current runner for a test fix, retaining the application release. A completed
  installation then runs checks; use `--reconfigure` separately to reapply setup.
  An interrupted install resumes its saved stage using the refreshed runner.

These commands use the downloaded script; after reboot, download it again using
the command above before using an option if the temporary file has disappeared.

A future release must deliberately update and validate `release.json` (including
hashes/digest), review compatibility and repeat relevant hardware checks. An
existing installation targeting another release is stopped rather than upgraded.
The one-time initial full OS upgrade is not repeated after its recorded reboot.
No successful checkpoint is recorded for failed package or optional setup steps.

## Failure and recovery

Progress is printed every ten seconds during long operations; package output goes
to a timestamped install log under the state directory. MQTT passwords use hidden
terminal input, not logs or command arguments. The installer checks ownership of
files before replacing them, backs up adopted empty configs, and journals writes
for retry. Modified/unrelated files and Compose overrides cause a stop for review.
Existing app data and browser identity are preserved; no volumes are removed.

If interrupted, reconnect and run the same command. If apt reports unfinished
configuration, resolve its reported error first; the installer does not suppress
it or claim completion. If there is no logged-in desktop, wait or log in; Desktop
Autologin can be selected through `sudo raspi-config`, followed by a reboot.
If neither tested rotation tracks touch correctly, the original transform is
restored and setup stops. There is no automatic destructive reset/uninstaller.

To stop kiosk autostart, stop the user `pi-rain-radar-kiosk.service` and move its
`~/.config/autostart/pi-rain-radar.desktop` entry out of that directory. Keep its
browser profile and application data. Optional display recovery is documented in
[display controls](../display-controls/README.md). Use the existing Device Power
guide for helper removal; no power action is tested automatically.

## Checks and acceptance

Local Linux isolated tests cover OS/display boundaries, upgrade/reboot checkpoints,
interrupted file writes, ownership preservation, pinned source hashes and optional
setup failures, plus the display policy/MQTT contracts. CI repeats these checks and
verifies published source checksums. They do not establish fresh-hardware success.

The first physical walkthrough is user-run: verify orientation/touch, resume after
OS upgrade, app/default map, prompt-free kiosk after reboot, selected Power actions,
six MQTT controls, OFF/ON timing, touch/Wake, broker reconnect and persistence.
Repeat on Pi 4 / 2 GB using a spare SD; preserve its existing card. Record RAM/PSU,
cooling, card and exact OS, plus bounded temperatures/memory and any failures.

Docker repository setup follows the [official Debian instructions](https://docs.docker.com/engine/install/debian/).
The app's existing manual Raspberry Pi guide remains the ordinary installation path
until this guided flow is accepted.
