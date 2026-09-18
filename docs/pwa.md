# Optional app installation and private remote access

Pi Rain Radar includes standard Progressive Web App (PWA) metadata and icons. You can install it from a supported browser when it is served through trusted HTTPS. There is no extra app package, in-app installation switch or requirement to use Tailscale. Ordinary HTTP browser access and Pi kiosk operation remain available.

HTTPS and remote access are optional host/network configuration, outside the base app setup. Installation does not add offline radar storage or notifications: the app still needs to reach your running radar server.

See [Android and Windows screenshots](pwa-gallery.md) for the installed app, phone orientations and Chrome installation steps.

## Tailscale Serve

Tailscale provides a convenient private HTTPS address and access away from home. Install and connect Tailscale on the radar host and each device you want to use, under your own tailnet. Access follows your tailnet's access rules. See [Tailscale installation](https://tailscale.com/download) and [Serve documentation](https://tailscale.com/docs/features/tailscale-serve).

### What has been tested

I installed the app through Chrome on Windows and Android during development. With published 0.5.0 running on my Pi 4 / 2 GB, I then tested the installed Android app over home Wi-Fi and mobile data, and switching away and returning. All worked. HTTPS page, manifest, health and version checks passed from Windows with normal certificate verification. The Pi used Debian 13 Trixie ARM64 and Tailscale 1.102.4. A Pi reboot with Serve configured has not yet been tested.

This remains a dedicated radar display for a configured location: the map does not offer drag-to-pan or pinch-to-change-location. Narrow phones receive best-effort layout support; tablets can be useful remote displays. The radar host must remain running, but a Pi-hosted installation does not depend on a laptop.

### 1. Install Tailscale on the radar host

These commands run **on the Pi**, through its terminal or SSH, not on the phone. Confirm ordinary radar access works first. Install Tailscale on the phone/laptop too using the [official downloads](https://tailscale.com/download).

Check the Pi operating system with `cat /etc/os-release`. The following commands use the [official Debian Trixie repository](https://pkgs.tailscale.com/stable/#debian-trixie), tested on the 64-bit reference Pi. For a different OS/release, select its instructions on that page instead of reusing this repository name. If Tailscale is already installed, skip installation and check its connection in step 2.

```sh
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/debian/trixie.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list
sudo apt-get update
sudo apt-get install tailscale
sudo systemctl enable --now tailscaled
```

### 2. Sign in and approve the Pi

```sh
sudo tailscale up
```

Open the printed sign-in link on your phone or laptop and use the account/tailnet used by your client devices. If your tailnet requires device approval, approve the new Pi in the Tailscale admin console as well. Signing in alone does not complete that approval step. Then check:

```sh
tailscale status
```

The Pi should be connected. Connect Tailscale on the phone/laptop too. This setup does not require Tailscale SSH, subnet routing or an exit node.

**Optional:** an administrator can disable device key expiry for an unattended Pi. This avoids periodic reauthentication but leaves the device authorized until revoked; it is a personal administration choice, not a requirement. Keeping expiry enabled is also valid—reauthenticate when needed.

### 3. Enable private HTTPS with Serve

First inspect existing routes:

```sh
sudo tailscale serve status
```

For the standard radar port 3080, add:

```sh
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3080
```

Use the actual local app port if yours differs. If HTTPS port 8443 already serves another application, choose an unused supported port instead of replacing it. The `--bg` configuration continues after the terminal closes.

If an enablement link is printed, open it and enable **HTTPS certificates**. Leave optional **Tailscale Funnel** unchecked: Serve is private to your tailnet; Funnel is not needed. Certificate names appear in public certificate-transparency logs without making the application public. See [HTTPS certificate setup](https://tailscale.com/docs/how-to/set-up-https-certificates).

The first HTTPS request may wait while a certificate is issued. Inspect `sudo tailscale serve status` and, on Linux, `sudo journalctl -u tailscaled --since "5 minutes ago"` if it does not become ready. Keep ordinary local access available while checking.

### 4. Install and test on your phone or laptop

Use the **exact HTTPS URL printed by Serve**, including its port. With Tailscale connected, open it in Chrome, choose **Install app** or **Add to Home screen**, then launch the icon. Browser wording varies. Use the ordinary URL without the Pi launcher's `?kiosk=1` flag.

Check live data, switch away and return, then turn phone Wi-Fi off to test mobile data. Check that new data loads rather than only viewing cached imagery. Keep Tailscale connected on the client and keep the Pi powered on.

If moving from a laptop preview, install from the new Pi URL: the old app shortcut continues to use the old host. Different addresses have separate local display preferences; shared radar settings stay on the Pi. Remove the old shortcut when you no longer need it.

### Remove this HTTPS route

```sh
sudo tailscale serve --https=8443 off
```

This leaves radar and normal LAN/kiosk access running. Do not reset unrelated Serve routes or disable account-wide HTTPS to remove this route. To disconnect the Pi itself, use `sudo tailscale down`; reconnect with `sudo tailscale up` when wanted.

## Other HTTPS options

The app is not coupled to Tailscale. These are alternatives, not setups validated in the test above:

| Option | What you configure outside the app |
| --- | --- |
| Existing HTTPS reverse proxy | Route a trusted HTTPS hostname to the radar server, preserving its paths and same-origin requests. |
| Your own domain and publicly trusted certificate | Arrange DNS, certificate issuance/renewal and a reverse proxy. A publicly trusted certificate does not require making the radar app publicly accessible. |
| Private certificate authority | Configure HTTPS and install trust for your CA on every client device. This takes more device administration. |

Merely dismissing a self-signed certificate warning is not a substitute for trusted HTTPS. Remote access is a separate network choice; HTTPS alone does not make a home server reachable away from home. Keep access restricted to your intended users rather than assuming app installation supplies access control.

Normal PWA installation uses HTTPS, with exceptions for local development addresses such as `localhost`. A phone accessing a Pi's LAN IP over HTTP is not accessing its own localhost. Browser-specific HTTP shortcuts may exist, but are not promised to behave like the tested HTTPS installation. See [PWA installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Preferences and updates

HTTP and HTTPS addresses have separate browser storage. Moving to a different hostname, port or browser profile may require arranging your local display preferences again; shared server settings remain on the same radar server.

The installed app uses the same server release as the browser UI. There is no service-worker app-shell cache. Existing version-change reload behaviour remains in place, including deferring reload while Settings is open.
