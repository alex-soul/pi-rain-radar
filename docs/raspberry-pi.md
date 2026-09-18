# Build a Raspberry Pi rain-radar screen

A walkthrough from unpacking the hardware to an automatically starting kitchen display. You use a laptop to prepare and configure the Pi; no keyboard or mouse needs to be connected to the Pi. No AI assistant is required.

**Reference setup:** Raspberry Pi 4 Model B (2 GB), 7-inch Touch Display 2, microSD storage, Raspberry Pi OS with desktop, 64-bit Debian 13 Trixie and labwc/Wayland. Installation, landscape touch, kiosk reboot, LAN configuration, image upgrade and location changes were confirmed in a manual walkthrough. Other boards/screens may need different cables or display settings. Continuous resource use and long-duration recovery tests remain ongoing.

## 1. Unpack and assemble

You need the Pi, compatible display, a suitable Pi power supply, microSD card and reader, another computer, Wi-Fi or Ethernet, and a stand/enclosure that leaves ventilation clear. The reference build used A2-rated storage; capacity and performance requirements for a full retained archive have not yet been measured. Have a small cross-head screwdriver available.

Work with the power disconnected. For the Pi 4 and 7-inch Touch Display 2, use the supplied 15-way ribbon cable. It carries display and touch data; the separate supplied GPIO cable powers the display. Use the Pi's **DISPLAY** connector, not its camera connector. Seat ribbon cables straight and close their retaining clips gently. Check the power wiring against the manufacturer's photographs before connecting power: red goes to physical pin 2 and black to physical pin 6. GPIO numbers and physical pin numbers are different.

Follow the [official illustrated Touch Display 2 assembly instructions](https://www.raspberrypi.com/documentation/accessories/touch-display-2.html#connect-to-a-raspberry-pi-device), including cable orientation and mounting. They show the connector details more clearly than a text-only description. Children should have an adult check the power connection. Other display sizes and Pi models use different connections; do not assume the Pi 4 cable instructions apply.

Leave the Pi unplugged until its card is ready.

## 2. Flash the operating system on your laptop

Install [Raspberry Pi Imager](https://www.raspberrypi.com/software/) on your laptop. Insert the microSD card into its reader. Flashing erases the selected card, so check the storage device carefully.

In Imager:

1. Select your Raspberry Pi model.
2. Choose **Raspberry Pi OS (64-bit), with desktop**. The standard desktop edition includes the browser and graphical session needed here. Do not choose Lite for this walkthrough.
3. Select your microSD card.
4. Configure the hostname; this guide uses `pi-weather` as an example.
5. Set your locale, keyboard layout and time zone.
6. Create your own username and password. Write down the username; it is needed for SSH. There is no assumption that it is `pi`.
7. Enter your Wi-Fi network name/password and wireless country. Ethernet is an alternative.
8. Enable **SSH** under remote access. Password authentication is the simplest route for this walkthrough; experienced users can choose an SSH public key.
9. Raspberry Pi Connect is optional and is not required by this guide.
10. Write the image and let verification finish. Do not unplug the reader while either is running.

Imager labels can vary between versions; see the [official getting-started guide](https://www.raspberrypi.com/documentation/computers/getting-started.html). The reference card took about 30 minutes to write at a reported 6 MB/s and passed verification. A slow write alone does not establish that the card is defective; card, reader and connection all affect it. Investigate repeated verification failures before using the card.

Eject the verified card safely, insert it in the unpowered Pi, then connect the Pi power supply. Give the first boot a few minutes. A portrait desktop at this stage is normal for this display.

## 3. Connect from your laptop

The Pi should join the preconfigured Wi-Fi. Keep the laptop on the same network, not an isolated guest network. The reference system briefly displayed its IP address during startup, and the desktop wireless menu also showed it; those details can vary by OS version. Your router's connected-device list is another place to find it.

Open **PowerShell** on Windows or **Terminal** on macOS/Linux. Replace `YOUR_USERNAME` with the username you chose in Imager:

```sh
ssh YOUR_USERNAME@pi-weather.local
```

Replace `pi-weather` too if you chose a different hostname. On first connection, SSH asks whether to trust the new host. Confirm it is your Pi; you can compare its displayed fingerprint locally if needed. Type `yes`, then your password. Password entry is invisible: no dots or stars appear.

If the hostname cannot be found, try the Pi's actual IP address:

```sh
ssh YOUR_USERNAME@192.168.1.50
```

The example IP is not a default. A successful login gives a prompt similar to `yourname@pi-weather:~ $`. From now on, commands labelled **Pi SSH terminal** run there, not in a separate laptop shell. Do not copy the prompt itself.

## 4. Update and orient the desktop

In the **Pi SSH terminal**:

```sh
cat /etc/os-release
uname -m
ps -eo comm | grep -E 'labwc|wayfire|Xorg'
sudo apt update
sudo apt full-upgrade
sudo reboot
```

Review and accept the package update prompt. Reboot disconnects SSH; wait for the desktop, then reconnect using the same SSH command. The reference output was Debian 13 Trixie, `aarch64` and `labwc`. The commands below target that desktop. If yours differs, check its display documentation before continuing.

List display outputs:

```sh
XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0 wlr-randr
```

The reference display is `DSI-1`, native 720 × 1280. Rotate it temporarily:

```sh
XDG_RUNTIME_DIR=/run/user/$(id -u) WAYLAND_DISPLAY=wayland-0 wlr-randr --output DSI-1 --transform 90
```

Check both orientation and touch: tap a desktop control. Use `270` instead if your enclosure needs the opposite landscape direction. Substitute the actual output name if yours differs. If Wayland is unavailable, first check that the desktop has finished loading; this requires a logged-in graphical session.

For the reference labwc setup, an existing kanshi process manages displays:

```sh
pgrep -a kanshi
cat ~/.config/kanshi/config
```

An empty config is normal on a fresh reference installation. **If it already contains display rules, preserve and edit those instead of replacing them.** With an empty or absent user config:

```sh
mkdir -p ~/.config/kanshi
cat > ~/.config/kanshi/config <<'EOF'
profile {
    output DSI-1 enable transform 90
}
EOF
sudo reboot
```

Use your tested output/rotation in the file. After reboot, confirm landscape and touch again. The early boot logo may remain portrait; rotating that is outside this guide. Reconnect SSH.

## 5. Install Docker

Docker runs the app independently of the browser. These commands use Docker's official Debian repository for the reference **Trixie / ARM64** system. Do not reuse the hardcoded release/architecture on a different OS; follow [Docker's Debian installation instructions](https://docs.docker.com/engine/install/debian/) instead. Existing Docker installations should use their existing installation/update method.

In the **Pi SSH terminal**:

```sh
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```sh
sudo tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: trixie
Components: stable
Architectures: arm64
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

```sh
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo docker run --rm hello-world
sudo docker compose version
```

**Expected:** “Hello from Docker!” and a Compose version. If installation fails, resolve that before installing the app. This guide deliberately uses `sudo docker`; no Docker-group membership change is required.

## 6. Install and configure Pi Rain Radar

Follow [Quick Start, steps 2–5](quick-start.md#2-install-the-app), using the Pi/Linux instructions. It downloads one Compose file and the published image into the permanent `~/apps/pi-rain-radar` installation.

On your laptop, open `http://pi-weather.local:3080` (or your actual hostname/IP). Set Map, optional OpenWeather key and optional PIN there. This avoids typing on the touchscreen. The Pi and laptop share these settings but retain independent widget layouts.

You can check backend readiness over SSH:

```sh
curl -fsS http://localhost:3080/healthz
```

`{"ok":true,"hasFrame":false}` is normal early in startup. `hasFrame` becomes true once radar is available. The preparation popup gives visible progress. A healthy process does not guarantee current provider imagery; the app's status handles report data freshness separately.

## 7. Start the screen automatically

The following uses the existing desktop's automatic login and XDG startup. It does not replace labwc's system autostart file. If your Pi boots to a login screen, run `sudo raspi-config` and select desktop auto-login under its boot/auto-login options before continuing. Menu labels vary by OS version.

In the **Pi SSH terminal**, confirm the browser:

```sh
command -v chromium
```

The reference output is `/usr/bin/chromium`. Create the launcher:

```sh
mkdir -p ~/.local/bin ~/.config/autostart
cat > ~/.local/bin/pi-rain-radar-kiosk <<'EOF'
#!/bin/sh
exec 9>"${XDG_RUNTIME_DIR:?}/pi-rain-radar-kiosk.lock"
flock -n 9 || exit 0
while true; do
    until curl -fsS --max-time 3 http://127.0.0.1:3080/healthz >/dev/null; do
        sleep 2
    done
    /usr/bin/chromium \
        --user-data-dir="$HOME/.config/pi-rain-radar-chromium" \
        --no-first-run \
        --password-store=basic \
        --noerrdialogs \
        --kiosk \
        'http://127.0.0.1:3080/?kiosk=1'
    sleep 5
done
EOF
chmod +x ~/.local/bin/pi-rain-radar-kiosk
```

This waits for the app, opens a dedicated Chromium profile in full screen, and restarts the browser if it exits. Its lock prevents duplicate launchers. The separate profile remembers the touchscreen's layout. `--password-store=basic` prevents the desktop keyring prompt; this profile is for the kiosk, not for storing personal website passwords. See [Chromium's password-storage documentation](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/linux/password_storage.md).

```sh
cat > ~/.config/autostart/pi-rain-radar.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Pi Rain Radar
Exec=$HOME/.local/bin/pi-rain-radar-kiosk
Terminal=false
EOF
```

Disable screen blanking for this always-on display, then reboot:

```sh
sudo raspi-config nonint do_blanking 1
sudo reboot
```

Here `1` means disable blanking. Close any manually opened radar browser before reboot. Once the desktop starts, the kiosk should open automatically with no keyring prompt. Arrange the touchscreen's widgets by touch. A laptop arrangement is independent, so it will not be copied to the Pi.

## 8. Confirm your appliance

- Reboot once and confirm automatic full-screen landscape startup.
- Tap, move and resize widgets; check their positions survive reboot.
- Open the app from the laptop; check shared map settings and independent layouts.
- Try a map change and allow its preparation popup to finish. Weather may follow 10–15 minutes later. Restore your desired location.
- With no key, radar should still work. With a key, check the API status and current readings.
- If enabled, close and reopen Settings to confirm PIN protection.

The reference walkthrough passed these core behaviours, including migration to the published image and the map-progress popup. Sustained idle operation, forced browser failure, network recovery on the Pi and maximum simultaneous-screen capacity still need separate testing; the launcher retry behaviour is not a promise that every crash condition has been tested.

## 9. Later maintenance

Use the [beginner upgrade guide](upgrading.md) for app updates. It uses the same SSH login and three familiar Docker commands; no reflashing or source folders are involved. OS updates are separate: `sudo apt update`, `sudo apt full-upgrade`, then reboot when appropriate.

To shut down before disconnecting power:

```sh
sudo poweroff
```

Wait for shutdown before unplugging. Reconnect power to start it again. The baseline here keeps the display on continuously; motion sensors, scheduled brightness and touch-to-wake sleep are optional customisations outside this guide.

If a step fails, use [Troubleshooting](troubleshooting.md). For what each screen element means, use the [user manual](manual.md).

See the [screen indicator guide](indicators.md) for status meanings, [radar provider guide](radar-providers.md) for setup and estimates, and [Device Power guide](device-power.md) for the optional host helper.
