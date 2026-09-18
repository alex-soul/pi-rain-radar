# Installed app: Android and Windows

Screenshots from my phone and Windows laptop on 18 September 2026, using Pi Rain Radar 0.5.0 served by my Pi through private Tailscale HTTPS. These show recorded conditions, not live weather. See the [setup guide](pwa.md) to install your own.

## Android phone

The installed app appears in the launcher and has an Android App info entry. The separate RainViewer app is also visible in the launcher screenshot; it is not required for Pi Rain Radar.

| Launcher | Android App info |
| --- | --- |
| <img src="images/pwa/android-launcher.jpeg" alt="Android launcher showing Rain Radar beside the separate RainViewer app" width="300"> | <img src="images/pwa/android-app-info.jpeg" alt="Android App info for the installed Rain Radar web app" width="240"> |

### Portrait

<img src="images/pwa/android-portrait.jpeg" alt="Installed Android app in portrait with Overview, Rain forecast and playback controls" width="320">

*Portrait view over mobile data, with Overview and Rain forecast open. Narrow-screen layouts are best effort; this is a display for a configured location, not a map with pan and zoom gestures.*

### Landscape

![Installed Android app in landscape with Overview and the bottom dock tucked away](images/pwa/android-landscape.jpeg)

*Landscape gives the maps more horizontal space. The bottom dock is tucked away in this example.*

## Windows laptop

Open the Pi's HTTPS address in Chrome, install the app, then launch it from its shortcut. Private hostname portions in the supplied browser screenshots are obscured.

| Open in Chrome | Install app |
| --- | --- |
| ![Pi Rain Radar open in Chrome with its install control](images/pwa/windows-browser.png) | ![Chrome Install app confirmation for Pi Rain Radar](images/pwa/windows-install.png) |

<img src="images/pwa/windows-shortcut.png" alt="Pi Rain Radar shortcut on the Windows desktop" width="300">

*The desktop shortcut launches the installed app.*

![Pi Rain Radar running in its own Windows app window with Overview, Rain forecast and playback controls](images/pwa/windows-app.png)

*The installed app has its own window. The Pi collects the data; the laptop displays it.*

Radar imagery by [RainViewer](https://www.rainviewer.com/) and [Rainbow](https://rainbow.ai/); maps by [Natural Earth](https://www.naturalearthdata.com/); weather by [OpenWeather](https://openweathermap.org/). The screenshots preserve the app's displayed attribution. Android and Windows interface appearance may vary by device and browser version.
