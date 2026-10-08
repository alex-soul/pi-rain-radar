# Guided installer: hardware testing

The permanent entry point is the repository-root `install-pi.sh`. It is public
for first fresh-hardware trials; Pi 5/Pi 4 installer acceptance is not yet complete.
The **[Ludicrously Quick Start](../../docs/ludicrous-quick-start.md)** covers
assembly, flashing, SSH and the guided steps with photographs. The Pi 5 / 7-inch
walkthrough and six HA controls have been tested; fresh Pi 4 installer testing
and longer resilience checks remain outstanding.

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
selected helpers. A final reboot tests automatic startup. A third run is optional:
it performs checks, not another installation. The first reboot handoff prints the
detected SSH login separately from the command to run inside the Pi terminal.

New local display installations start automatic blanking OFF, with a saved 15-minute timeout; MQTT is optional.
Setup verifies broker authentication/TLS before replacing an existing configuration.
HA discovery/controls and physical behaviour still require user confirmation.
No HA/broker installation, certificate provisioning, maintenance scheduler, app
updater or SSH policy change is included. Map/providers/PIN remain in the app UI.

## Version and retry contract

The bootstrap resolves one public `main` commit, downloads all runner/MQTT files
from that exact snapshot, and caches the complete bundle. The selected commit and
application manifest are saved in `~/.local/state/pi-rain-radar/install.json`.
Reboots/retries reuse that snapshot. `release.json` explicitly pairs this runner
with published v0.9.0, its immutable image digest, and checksummed Compose/Power
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

Six numbered stages keep the walkthrough compact. On a normal SSH terminal, the
current step and elapsed time update in place every ten seconds during commands;
each stage retains one success row. Colour is optional (`NO_COLOR` disables it).
Narrow terminals shorten only the live status, never copyable commands. Redirected
output and `TERM=dumb` use plain stage summaries and roughly minute-long heartbeats
without terminal escape codes. Explicit carriage returns keep output aligned even
when package tooling changes terminal newline handling.

Package output and exact version pins go to a timestamped install log under the
state directory. Errors show the last output and log location. MQTT passwords use hidden
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

## Updating the app pin for a release

A full fresh-card installation is not required for every application release.

For an app-only change with unchanged installer, Compose, host helpers and startup contract:

1. Wait for the published release's AMD64/ARM64 builds and fresh-start/restart checks to pass, and complete the normal Pi app acceptance.
2. Update `release.json` with the exact app tag, source commit and published index digest. Verify every pinned file checksum against that source; never replace the digest with `latest`.
3. Update the manifest expectation in installer tests. Run the Linux installer/display-control tests and shell checks, verify published file hashes, and smoke-test the selected image on empty disposable data.
4. Review resume/refresh compatibility and the guide, then publish the pin update after review. Existing installations resume their saved snapshot; this is not an app updater.

Repeat affected hardware checks when installer stages, OS support/packages, Docker setup, Compose/mounts/permissions, kiosk/autologin, display/touch, Power/MQTT helpers or the app startup/data contract change. A new OS baseline, hardware route or major installation-flow change warrants a full fresh-card walkthrough. Record what was actually tested; do not relabel an older physical walkthrough as testing the new combination.

The v0.9.0 pin update retains the existing installer logic and unchanged Compose/Device Power files. The original Pi 5 walkthrough used v0.8.0; v0.9.0 has separate app acceptance and targeted pin validation.

Pin validation on 29 September 2026: 22 installer and 21 display-control tests passed in isolated Linux, shell checks passed, all four published-source checksums matched, and the exact published image passed fresh startup/restart with retained disposable data on AMD64. Release CI already passed startup/restart on both AMD64 and ARM64; the published app was accepted on the Pi. No new physical installation or Pi modification was performed.

## Pending 0.10.0 release dependency

The current development runner provisions local Screen controls even when MQTT is declined: a local display controller plus authenticated bridge and Screen Compose override. Its snapshot bundle includes both `install_bridge.py` and `bridge.py`; retries retain the cached runner and selected application manifest. MQTT adds its adapter to the same settings/controller.

The checked-in app manifest intentionally remains v0.9.0 while 0.10.0-rc.1 is evaluated. Do not promise Appliance → Screen when the installed app still reports 0.9.0. Once the new published image is verified and accepted, update the exact tag/source/index digest and checksummed source files in `release.json`, validate public file hashes and installer CI, and update the Quick Start note. Do not use `latest` or change existing saved installation targets during resume.

Targeted Linux installer/display tests and isolated bridge installation passed, including restrictive umask and runtime socket access. The accepted private-controller Pi upgrade is not a fresh portable installation. Validate local control with MQTT declined, optional MQTT consistency, startup/reboot, touch wake and saved settings on the affected hardware route before reporting it accepted. Existing fresh Pi 4 and longer resilience gaps remain open.
