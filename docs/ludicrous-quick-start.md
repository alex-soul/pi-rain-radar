# The Ludicrously Quick Start

**From a box of parts to your own rain-radar screen. No Raspberry Pi experience needed.**

You will put the parts together, prepare a memory card on your computer, then paste one command into the Pi. The installer takes care of the software. Keep this page open on your computer as you go.

“Quick” means very little typing. Downloading and updating still take time, so leave yourself an unhurried hour or more for a first build.

![Pi, touchscreen, cooler, power supply and memory card laid out before assembly](images/ludicrous-quick-start/hardware-01.jpg)

**Tested walkthrough:** I completed this guided installation on a Raspberry Pi 5 with 2 GB RAM, the official 7-inch Touch Display 2 and a fresh 128 GB card, including the optional Home Assistant controls. The installer is still a public test version. Pi 4B is supported by the script and is the app's existing reference platform, but its fresh-card installer walkthrough is pending. The official 10-inch Touch Display 2 is Pi 5 only and remains best-effort, physically untested here. These assembly photos show the **7-inch display and Pi 5**.

Already using your Pi for other things? Use the [manual installation guide](raspberry-pi.md) instead. This guided route is for a freshly flashed, dedicated radar Pi.

**Your route:** [Gather the parts](#1-gather-the-parts) → [Assemble](#2-put-the-hardware-together) → [Prepare the card](#3-prepare-the-memory-card) → [Connect](#4-turn-it-on-and-connect) → [Install](#5-run-the-installer) → [Make it yours](#7-make-it-yours).

## 1. Gather the parts

- **Raspberry Pi 5**, with 2 GB RAM or more, for the photographed build.
- **Official 7-inch Raspberry Pi Touch Display 2**, including its ribbon cables, power lead and mounting screws. Check the “2” in the product name.
- **A suitable Pi 5 USB-C power supply**; the official 27 W supply is a straightforward choice. A random phone charger may not supply enough power.
- **Pi 5 cooling**, such as the Active Cooler pictured, and a stand or enclosure that fits your display and leaves ventilation clear.
- **A reliable microSD card and a card reader** for your computer. A 32 GB or larger card is a practical starting point; larger cards leave more room for saved history. Flashing will erase it.
- **A Windows, Mac or Linux computer**, your home Wi-Fi name/password, internet access and a small cross-head screwdriver.

You do not need a keyboard or mouse attached to the Pi. You do not need Home Assistant, a weather subscription or an API key to get the basic radar working.

![Boxed Pi 5, official Touch Display 2, 27 W power supply, Active Cooler and Pimoroni LCD Frame, with a memory-card adapter](images/ludicrous-quick-start/boxed-parts.jpg)

*The parts for my build, before unpacking. I used the Pimoroni LCD Frame for the 7-inch Touch Display 2; you can choose another compatible stand or enclosure. The full-size SD adapter in front holds the tiny microSD card for use in a computer's card reader.*

For another supported board/display combination, check the [official display compatibility and cable instructions](https://www.raspberrypi.com/documentation/accessories/touch-display-2.html) before buying parts. Pi 4 uses a different ribbon cable and power supply. This guide does not cover the original Touch Display, 5-inch displays or third-party screens.

## 2. Put the hardware together

**Keep the power supply unplugged throughout assembly.** Place the screen face down on a clean, soft surface so you do not scratch it. Handle the board by its edges.

### Connect the cables to the screen

The flat ribbon carries the picture and touch input. The red/black lead supplies power to the screen. On a Pi 5 with this 7-inch display, use the supplied **Standard–Mini ribbon**: its wider end fits the display and its narrower end fits the Pi.

Open the display connector's little retaining clip gently, insert the ribbon straight, and close the clip. Plug the small end of the power lead into the display's `J1` socket. Compare your connections with the photograph and the [manufacturer's close-up assembly instructions](https://www.raspberrypi.com/documentation/accessories/touch-display-2.html#connect-to-a-raspberry-pi-device). Do not pull a retaining clip off or force a cable into a closed connector.

![Back of the 7-inch display with its ribbon and red/black power lead connected](images/ludicrous-quick-start/hardware-02.jpg)

### Mount the Pi and fit its cooler

Align the Pi with the four mounting posts on the back of the display and secure it with the supplied screws. Tighten gently; keep the loose cables clear.

![Pi 5 screwed onto the four mounting posts behind the display](images/ludicrous-quick-start/hardware-03.jpg)

Fit your cooler using its own instructions, including removing any protective film from its thermal pads. The cooler pictured attaches to the Pi and has a small fan cable; connect that to the Pi's fan socket.

![Active Cooler fitted to the Pi; cables still being connected](images/ludicrous-quick-start/hardware-04.jpg)

### Finish the connections

Connect the narrow end of the ribbon to a Pi 5 `CAM/DISP` connector, following the official instructions for contact orientation. Open and close its retaining clip gently. Give the ribbon a smooth curve rather than a sharp crease.

Connect the display power lead to the Pi's long pin header: **red to physical pin 2 (5 V), black to physical pin 6 (ground)**. These are physical pin positions, not GPIO numbers. Use the manufacturer's diagram to identify them; turning the assembly around changes what looks like “left” or “right”.

![Close-up of the connected ribbon, cooler fan lead and display power lead](images/ludicrous-quick-start/hardware-05.jpg)

![Second angle showing the display power connector on the Pi header](images/ludicrous-quick-start/hardware-06.jpg)

Check the ribbon clips, fan lead and power lead before going further. Keep wires out of the fan. The finished rear assembly should look like this:

![Completed Pi 5 and 7-inch display assembly viewed from behind](images/ludicrous-quick-start/hardware-07.jpg)

<details>
<summary>Another angle of the finished assembly</summary>

![Finished assembly viewed from the side, showing mounting posts and cable routing](images/ludicrous-quick-start/hardware-08.jpg)

</details>

### Fit the stand or enclosure

Follow the instructions supplied with your stand or enclosure. Keep the ribbon and power leads clear of screws and leave space around the cooler for air to circulate. Here is my assembled frame from both sides, still switched off:

| Front | Back |
| --- | --- |
| ![Assembled touchscreen in its frame, standing in landscape orientation with power off](images/ludicrous-quick-start/assembled-stand-front.jpg) | ![Rear of the framed display showing the mounted Pi 5, Active Cooler, ribbon cable and clear stand legs](images/ludicrous-quick-start/assembled-stand-rear.jpg) |

Leave the power disconnected. The card comes next.

## 3. Prepare the memory card

**On your computer:** download and install [Raspberry Pi Imager](https://www.raspberrypi.com/software/). This copies the operating system—the Pi's basic software—onto the card. Insert the microSD card into your computer's card reader and open Imager.

The screenshots show Imager 2.0.11.1; later versions may arrange the same choices differently. Click **Next** after each page. Do not skip customisation: it sets up the network and login we need later.

### Device, operating system and storage

Choose **Raspberry Pi 5** if that is your board.

![Imager device selection with Raspberry Pi 5 selected](images/ludicrous-quick-start/imager-001.png)

Choose **Raspberry Pi OS (64-bit)** with the **Raspberry Pi Desktop**, based on **Trixie**. Do not choose Lite, Legacy or the 32-bit edition. The tested image was released on 15 September 2026; this installer currently requires Trixie.

![Imager OS selection showing the 64-bit Trixie desktop edition](images/ludicrous-quick-start/imager-002.png)

Select your **microSD card**. Check its capacity so you do not erase another drive. The example below shows a 32 GB card; your card's name and reported capacity may differ.

![Imager storage selection with the memory card selected](images/ludicrous-quick-start/imager-003.png)

### Give the Pi a name

Enter **`pi-rain-radar`** as the hostname. This is its name on your home network, and using it lets you copy the commands below unchanged. If you already have a device with that name, choose a different one and substitute it in the later commands and web address.

![Hostname set to pi-rain-radar](images/ludicrous-quick-start/imager-004.png)

Choose **your own location, time zone and keyboard layout**. The screenshot shows the UK example.

![Localisation choices for location, time zone and keyboard](images/ludicrous-quick-start/imager-005.png)

### Create your login

For the simplest copy-and-paste route, use **`pi-admin`** as the username. Create **your own password** and keep it somewhere safe. You will type it when connecting to the Pi. There is no supplied default password.

You can use a different username; replace `pi-admin` in the SSH commands if you do.

![User account page with pi-admin and hidden password fields](images/ludicrous-quick-start/imager-006.png)

### Connect it to your home network

Enter your actual Wi-Fi name in **SSID** and your Wi-Fi password. `your-wifi-name` in the screenshot is just an example. Use the same home network as your computer, rather than an isolated guest network. If you prefer Ethernet, connect the Pi to your router by network cable instead.

![Wi-Fi page showing where to enter the network name and password](images/ludicrous-quick-start/imager-007.png)

### Enable remote access

Turn **Enable SSH** on and choose **Use password authentication**. SSH lets you type commands on the Pi from your computer. It uses the Pi username/password you just created, not your Wi-Fi password.

![SSH enabled with password authentication selected](images/ludicrous-quick-start/imager-008.png)

Leave **Raspberry Pi Connect** off for this walkthrough. You do not need an account for it.

![Raspberry Pi Connect left disabled](images/ludicrous-quick-start/imager-009.png)

### Write and verify

Review the summary. Check that your username, Wi-Fi and SSH have been configured. Click **Write** and accept the card-erasure confirmation only after checking that the selected drive is the intended card.

![Imager summary before writing the card](images/ludicrous-quick-start/imager-010.png)

Let writing **and verification** finish. This can take a while; leave the reader connected. When Imager says **Write complete**, safely remove the card as directed.

![Imager write-complete screen confirming customisations were applied](images/ludicrous-quick-start/imager-011.png)

## 4. Turn it on and connect

With the Pi still unplugged, put the microSD card into its card slot. Place the assembly securely in its stand/enclosure, then connect the power supply. Give the first boot a few minutes to reach the desktop.

**A sideways or portrait desktop is normal at this point.** The installer fixes the screen orientation early, before the long update. Leave any desktop update notification alone for now; the installer performs the full initial update itself.

![First boot reaches the Raspberry Pi desktop, still sideways before installer orientation](images/ludicrous-quick-start/first-boot-desktop.jpg)

*This is the desktop you are waiting for. Its sideways appearance is expected before setup.*

<details>
<summary>What you may see while the Pi is starting</summary>

![Sideways Raspberry Pi OS boot splash before the desktop loads](images/ludicrous-quick-start/boot-splash.jpg)

The welcome screen and startup text may also be sideways. Wait for the desktop above. The early boot splash may remain sideways on later boots too; the installer rotates the desktop and radar screen.

</details>

**On your computer:** open **PowerShell** from the Windows Start menu, or **Terminal** on Mac/Linux. Copy this line, paste it and press Enter:

```sh
ssh pi-admin@pi-rain-radar.local
```

If you chose different names in Imager, replace them here. On the first connection, a message asks whether you trust this new host. Check that you are connecting to your Pi on your own network, type **`yes`** in full and press Enter. Then type the Pi login password and press Enter.

**Nothing appears while you type the password—not even dots. That is normal.**

You should now see something like:

```text
pi-admin@pi-rain-radar:~ $
```

That means you are **inside the Pi**. A prompt starting with `PS C:\...>` means you are still in Windows. This distinction matters for the next step.

## 5. Run the installer

**Inside the Pi terminal:** copy the entire command below, paste it, then press Enter. It downloads this project's installer and starts it. You can [read the script first](../install-pi.sh).

```sh
curl -fsSL https://raw.githubusercontent.com/alex-soul/pi-rain-radar/main/install-pi.sh -o /tmp/pi-rain-radar-install.sh && bash /tmp/pi-rain-radar-install.sh
```

Keep the terminal open while it works. If `[sudo] password` appears, enter the **same Pi login password**. It remains invisible while typing.

### Answer a few questions

At `[Y/n]`, pressing Enter means **Yes**. At `[y/N]`, it means **No**. You can always type `y` or `n` yourself.

| Question | What to choose |
| --- | --- |
| Freshly flashed, dedicated Pi? | Type `y` if you prepared this card for radar as above. |
| Enable Device Power? | Press Enter for **Yes** to add shutdown/restart controls in the app. A PIN can be set later. |
| Enable MQTT display controls? | For a first build without Home Assistant, type `n`. Radar works fully without it. If you already have Home Assistant and an MQTT broker, choose `y` and follow the optional section below. |
| Official Touch Display 2? | Confirm the actual screen you connected. |
| Landscape orientation and touch correct? | Look at the Pi: it should be **wide, not tall**, with text the right way up. Tap a desktop control and check that touch lands where your finger does. Answer `n` if either is wrong so it can try the other rotation. |

The installer updates a single progress line while working. `OK` means that stage completed. Updates may take much longer than the other stages; this is not a race.

### First reboot: reconnect and resume

After the initial OS update, choose **Yes** to reboot. SSH disconnects and your computer's own prompt returns. A message such as `Connection reset` is expected here.

Wait for the Pi desktop to return. **On your computer**, reconnect:

```sh
ssh pi-admin@pi-rain-radar.local
```

Enter your Pi password. **Once you see the Pi prompt again**, run the same installer command:

```sh
curl -fsSL https://raw.githubusercontent.com/alex-soul/pi-rain-radar/main/install-pi.sh -o /tmp/pi-rain-radar-install.sh && bash /tmp/pi-rain-radar-install.sh
```

Your choices are saved. This continues the installation after the OS update. It installs the radar app, makes the desktop log in automatically, and sets the browser to open radar full-screen when the Pi starts.

## 6. Optional: connect Home Assistant

**Chose No to MQTT? Skip straight to [Make it yours](#7-make-it-yours).**

MQTT is the connection used to let Home Assistant control this screen. You need an **existing MQTT broker** (for example, Mosquitto) and Home Assistant's MQTT integration already connected to it. This installer does not set either of those up.

When asked, supply:

| Field | Meaning |
| --- | --- |
| Broker address | The hostname or IP of your MQTT broker. If Mosquitto runs on your Home Assistant machine, this will normally be that machine's address. Do not include `http://`. |
| TLS encryption | Choose **No** if you have not configured certificates/encryption on your broker. Choose Yes only for a broker already configured to use TLS. |
| Port | Keep `1883` for a usual unencrypted connection, or use your broker's configured port. TLS normally uses `8883`. |
| MQTT username and password | The account allowed to connect to your broker. These may be different from both your Home Assistant website login and your Pi login. |
| Connect and save these settings? | Yes tests the connection, then saves the settings on the Pi and enables the adapter. No cancels this MQTT setup. |

With TLS enabled, setup may ask for a CA certificate file. Publicly trusted certificates can use the system's existing trust; a private certificate authority needs its CA file on the Pi. If this is unfamiliar and your broker has no TLS setup, return to the ordinary No-TLS route. Plain MQTT is unencrypted on your home network.

After setup, Home Assistant should discover a new device through its MQTT integration. Look under **Settings → Devices & services → MQTT**. It provides six controls/entities: **brightness, idle timeout, Wake, Sleep, screen state and Automatic screen blanking**.

![Pi Rain Radar MQTT device in Home Assistant, showing automatic blanking, idle timeout, brightness, Sleep and Wake controls, and the screen-state sensor](images/ludicrous-quick-start/home-assistant-mqtt.png)

*Example after setup: five controls appear under Controls, and Screen state appears under Sensors. The Activity panel records recent changes. The 48% brightness shown is an example setting, not an installation default; your values and activity will differ.*

Automatic blanking starts **OFF**, so your new screen stays on. Turn it on in HA if you want the screen to sleep after inactivity; the saved starting timeout is 15 minutes. Explicit Sleep still works with automatic blanking off. Touch the screen or use Wake to wake it again.

## 7. Make it yours

When the installer says **Setup complete**, accept the **final reboot**. After this one, the radar should open by itself. **You do not need a third installer run.**

Give the first radar images roughly two or three minutes to arrive; your connection or the provider may take longer. A lack of coloured rain can simply mean it is dry at the displayed location.

![Pi Rain Radar on its first launch, showing the default Coventry map before personal configuration](images/ludicrous-quick-start/first-launch.jpg)

*First-launch example: the app is running with its starting map and settings. The weather, time and available frames will differ on your screen.*

**This is your first milestone: the hardware and installation work.** Now comes the easier part—making it yours through Settings. Choose your location and maps, add keys for any optional providers you want, and arrange the screen to suit you. Basic RainViewer radar needs no key, so you can personalise it a little at a time.

**On your computer or phone**, open this in a web browser while connected to the same home network:

```text
http://pi-rain-radar.local:3080
```

Change the hostname if you chose another one. Tap the page or move the pointer to reveal the settings cog at the bottom right. Open **Settings → Map**. Enter a place label, latitude, longitude and time zone, then **Apply**. The label alone does not look up your location: use coordinates from your preferred map service, or keep the Coventry default while trying the app. Start with the included RainViewer radar; optional weather providers and keys can wait. You can set a six-digit settings PIN under **Settings → System → PIN**. The [user guide](manual.md) explains the maps, buttons and optional features.

Shared map/provider settings apply to the installation. Button visibility and layout are remembered by each browser, so adjust the Pi's own screen layout on the Pi.

A useful order for personalising it:

1. **Your place:** set the map coordinates, label, zoom and time zone.
2. **Your data:** keep RainViewer to begin with, or follow the [provider guide](radar-providers.md) to add optional radar/cloud sources and their keys. See the [user guide](manual.md) for optional weather readings and other integrations.
3. **Your screen:** open **Settings → Interface → Buttons** on the Pi to choose and order its controls, then arrange the widgets you want.
4. **Your preferences:** choose your theme, units and optional settings PIN. You can return to Settings whenever you want to adjust things.

![Personalised Coventry radar with rain and clouds on both maps, weather readings and charts, rain forecast, Sun and Moon, and a camera view](images/pi-rain-radar.jpg)

*Here is my screen after adding optional provider API keys and integrations, choosing my readings and arranging the widgets to suit me—with plenty of rain nearby. Compare it with the first-launch view above: the same app, made personal through Settings. Your screen can be as simple or as full as you like; the clouds, weather readings and camera need their respective optional sources configured, and the rain depends on the actual weather.*

Check the installation milestone before moving on:

- Radar opens automatically after the final reboot.
- The screen is landscape, text is the right way up, and touch works.
- Radar frames arrive and play.
- If you chose MQTT, the six HA controls appear and respond.

You can close the SSH window; the app keeps going. Continue personalising through the app whenever you like—there is no need to run the installer again for map, provider or layout changes.

### Turning it off and keeping it updated

Use the app's Device Power shutdown control if you enabled it, or reconnect over SSH and run `sudo poweroff`. Wait for shutdown to finish before unplugging the power. To start again, use the Pi 5 power button or reconnect its power supply.

The installer performs one full initial OS update. **Future OS and app updates are manual**; it adds no scheduled maintenance. Rerunning the installer checks the completed installation rather than upgrading the app. For later changes, see [app upgrades](upgrading.md) and the [installer options](../host/installer/README.md#version-and-retry-contract). This installer records a fixed app version, so review those instructions before changing versions.

## If something gets stuck

| What you see | What to do |
| --- | --- |
| `Could not resolve hostname` or no connection | Wait for the desktop; check power, Wi-Fi and that both devices share the same home network. Find the Pi in your router's connected-device list and use its IP in place of `pi-rain-radar.local`. |
| `Connection refused` | Wait a little longer. If it persists, check that SSH was enabled in Imager. |
| `Permission denied` | Check the username and **Pi login password** from Imager, including keyboard layout. The Wi-Fi password will not log you in. |
| PowerShell complains about `&&` or `bash` | You pasted the installer command into Windows. Run the SSH command first, wait for the `pi-admin@...:~ $` prompt, then paste it again. |
| Desktop is portrait | Expected before installation. Let the installer rotate it, then physically confirm landscape and touch. |
| Installer asks you to wait for a desktop | Wait until the Pi screen shows the desktop. If it shows a login screen, log in there first, then retry. |
| Progress takes a long time | Leave power and the connection alone while updates run. Elapsed time updates; detailed output is in the log path printed at the start. |
| Installer stops with an error | Save the error and log path. Resolve the reported problem before retrying the same command; saved checkpoints are kept. Do not reflash just to hide an error. |
| SSH disconnects at a requested reboot | Normal. Follow the first-reboot reconnect steps, or wait for radar after the final reboot. |
| HA controls do not appear | Check that HA's MQTT integration uses the same broker, and review the MQTT details. Radar can still work without HA. |

<details>
<summary>I deliberately reflashed this Pi and SSH reports a changed host key</summary>

A freshly flashed OS creates a new SSH identity. **Only if you deliberately reflashed this same Pi**, remove its old saved entry on your computer, then connect again:

```sh
ssh-keygen -R pi-rain-radar.local
ssh pi-admin@pi-rain-radar.local
```

Use the actual hostname or IP you connect with. If you did not reflash the Pi, investigate the changed identity before accepting it.

</details>

Still stuck? See [troubleshooting](troubleshooting.md) or [open an issue](https://github.com/alex-soul/pi-rain-radar/issues) with your Pi model, OS, installer stage and error. Leave passwords and private connection details out of screenshots and logs you share.
