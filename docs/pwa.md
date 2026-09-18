# Optional app installation and private remote access

Pi Rain Radar includes standard Progressive Web App (PWA) metadata and icons. You can install it from a supported browser when it is served through trusted HTTPS. There is no extra app package, in-app installation switch or requirement to use Tailscale. Ordinary HTTP browser access and Pi kiosk operation remain available.

HTTPS and remote access are optional host/network configuration, outside the base app setup. Installation does not add offline radar storage or notifications: the app still needs to reach your running radar server.

## Tailscale Serve

Tailscale provides a convenient private HTTPS address and access away from home. Install and connect Tailscale on the radar host and each device you want to use, under your own tailnet. Access follows your tailnet's access rules. See [Tailscale installation](https://tailscale.com/download) and [Serve documentation](https://tailscale.com/docs/features/tailscale-serve).

### What has been tested

During development of the next release, I installed the app and confirmed its app-like experience on my Android phone using a Windows-hosted preview through Tailscale Serve. The preview used local port 3091 and HTTPS port 8443. HTTPS page and manifest requests also passed certificate verification from Windows. This establishes the preview installation path; it is not yet a completed Pi-hosted installation, mobile-data/reconnection or background-resume validation. Windows Chrome on the test host was 153.0.8010.52; the phone's exact Chrome version was not recorded.

### Set up your radar host

Run these commands on the machine hosting the radar server. First check that normal local access works and inspect any existing Serve configuration:

```sh
tailscale serve status
```

For the standard Pi installation listening on port 3080, the configuration is:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:3080
```

Use your actual local app port if different. The tested Windows preview used the same command with port `3091`. If 8443 already serves another application, choose a free supported HTTPS port rather than replacing it. The Pi command above is the corresponding setup recipe, awaiting Pi validation in this release.

If Tailscale supplies an enablement link, open it and enable **HTTPS certificates**. Leave the optional **Tailscale Funnel** unchecked: Serve is private to your tailnet; Funnel is not required. Certificate issuance places the host's certificate name in public certificate-transparency logs, without making the app public. See [Tailscale HTTPS certificates](https://tailscale.com/docs/how-to/set-up-https-certificates).

Use the exact HTTPS URL printed by the command. On the phone or laptop, connect Tailscale and open that URL in Chrome. Choose **Install app** or **Add to Home screen** from Chrome's menu, then launch the new icon. Browser wording varies. Keep the radar host running; using a Pi-hosted URL removes any dependency on your laptop.

Check launch, switching away and returning, and reconnecting. To test remote access, turn phone Wi-Fi off and use mobile data with Tailscale connected. Check that new data loads, rather than relying only on imagery already displayed.

To remove only this Serve route later:

```sh
tailscale serve --https=8443 off
```

This leaves the normal radar server running. Do not reset unrelated Serve routes or disable account-wide HTTPS just to remove this route.

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
