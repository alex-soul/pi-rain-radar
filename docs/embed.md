# Embedded Radar

Enable **Settings → Map → Embed** to display the main radar inside an iframe, such as a Home Assistant Webpage card. It fills the frame and contains only radar, a small status light and clickable credits. There are no labels, location marker, buttons, docks, widgets or Settings. Window, speed and theme are shared embed settings; there are no display profiles.

## Setup and addresses

1. Add your dashboard's exact origin under **Trusted iframe origins**, one per line. For example, `http://homeassistant.local:8123`. Replace the example with the address you actually use. Include the scheme and any non-default port, but no dashboard path, trailing slash or wildcard.
2. Enable embedding and choose the presentation. Controls save automatically; the origins field saves when you leave it.
3. In your dashboard's iframe/Webpage card, use the radar server's address followed by `/embed`, for example `http://radar.local:3080/embed` or `https://radar.example-tailnet.ts.net:8443/embed`. These are illustrative addresses: use whichever LAN, Tailscale or other configured address reaches your Pi Rain Radar from the viewing device, including its port if needed. HTTPS dashboards require an HTTPS radar address. There is no server URL to save in Embed settings.

The two addresses have different jobs: **Embed URL points to the radar; trusted origins identify the dashboards allowed to contain it.** Multiple HTTP and HTTPS dashboard origins can be listed. Ordinary radar pages remain non-frameable. The allowlist controls framing, not direct access to the radar URL; network access rules still matter.

Radar and status update automatically. Reload the iframe after changing its presentation or trusted origins. Disabling embedding makes new `/embed` requests return 404; it cannot erase images already loaded in an open browser.

## HTTP, HTTPS and remote access

I tested the Pi-hosted embed in Home Assistant over HTTP on the local network and through Nabu Casa on a phone outside the LAN with Tailscale connected. The HTTPS embed worked remotely; the local HTTP embed showed Home Assistant's expected HTTPS/HTTP restriction. This followed an earlier test with a synthetic laptop preview. Certificate verification passed separately. These are functional checks, not prolonged reliability tests. The existing [PWA/HTTPS guide](pwa.md) also records normal-app HTTPS tests on the Pi.

An HTTPS Home Assistant dashboard cannot embed an HTTP radar URL. A VPN can make the server reachable, but an `http://` address remains HTTP from the browser's perspective. See [Home Assistant's Webpage card documentation](https://www.home-assistant.io/dashboards/iframe/).

### Private HTTPS with Tailscale Serve

Tailscale Serve provides private HTTPS in front of the radar's existing HTTP server. The mobile iframe test above used the normal Pi radar service. Follow the [existing setup guide](pwa.md#tailscale-serve) for installation, certificates and client access. Reuse an existing radar Serve route if you already have one.

For a new route, inspect existing configuration first. On the radar host, with Tailscale connected and ordinary radar access working:

```sh
sudo tailscale serve status
# Only if HTTPS port 8443 is unused; adjust the local radar port if needed:
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3080
sudo tailscale serve status
```

Enable HTTPS certificates if prompted. Use Serve for private tailnet access; Funnel is unnecessary. The command proxies the whole radar app, including its normal Settings routes, so retain appropriate tailnet access rules and the optional Settings PIN. It does not expose only `/embed`. See the [Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

Then:

1. Connect the viewing phone/laptop to Tailscale and open the exact HTTPS address printed by Serve, including its port. Check that it works without certificate warnings.
2. In radar Settings, allow the origin actually used to view HA. For Nabu Casa, copy your own HA HTTPS origin from the address bar and remove the dashboard path. Keep the LAN HA origin too if you use both.
3. Put the Serve address plus `/embed` into HA's Webpage card, for example `https://radar.example-tailnet.ts.net:8443/embed` (illustrative only).
4. Check the iframe from that same device, including fresh radar updates, reload and reconnection. The browser loads the radar directly: Nabu Casa does not relay this separate iframe, and Tailscale on HA alone does not give the phone access.

If it fails, first open the HTTPS embed directly. A connection failure points to reachability, certificates or the server; 404 usually means embedding is disabled. If direct viewing works but the iframe fails, check the exact HA origin and browser framing restrictions. Mobile app/webview behaviour may differ and needs its own check.

To remove only the new example route, use `sudo tailscale serve --https=8443 off`. Do not remove a pre-existing route used by other displays. Other trusted HTTPS reverse proxies may also work: preserve the app's root paths, assets and security headers. HTTPS and remote networking remain optional host configuration, with no extra proxy bundled into Pi Rain Radar.
