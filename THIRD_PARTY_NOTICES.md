# Third-party data and software

The MIT licence in this repository covers Pi Rain Radar's original application code and documentation. It does not relicense third-party software or grant rights to weather-provider services, names or data.

## RainViewer

Radar imagery and metadata are provided by [RainViewer](https://www.rainviewer.com/). The app displays linked provider credit. Its public API is intended for personal, educational and small community use and is offered without availability guarantees. Commercial integrations must check eligibility with RainViewer; the application's MIT licence does not grant commercial API access. See the current [API terms](https://www.rainviewer.com/api.html).

Example radar images in the README show historical observations, not current conditions. RainViewer is credited alongside the preview and in the app.

## Rainbow Weather

Optional radar tiles and snapshot metadata come from [Rainbow Weather](https://rainbow.ai/), using the installation's own Tiles API key. Provider subscription, attribution and data terms apply separately; see [Rainbow terms](https://developer.rainbow.ai/terms-of-service) and [setup/usage assumptions](docs/radar-providers.md). Historical captures retain their provider credit. The local archive is not a grant of additional redistribution rights.

## Natural Earth

Bundled geography is derived from Natural Earth's public-domain datasets. See [Natural Earth's terms](https://www.naturalearthdata.com/about/terms-of-use/) and [the pinned source and regeneration instructions](assets/README.md).

## OpenWeather

Optional current conditions and minute precipitation forecasts come from [OpenWeather](https://openweathermap.org/). Users supply their own One Call 4.0 key. Subscription, attribution, usage limits and data terms apply separately: see [OpenWeather terms](https://openweathermap.org/terms). The app displays linked credit when this integration is configured.

## SunCalc

Sun and Moon calculations use [SunCalc](https://github.com/mourner/suncalc), copyright 2026 Volodymyr Agafonkin, distributed under the BSD-2-Clause licence. The pinned browser source is bundled locally with its complete [licence notice](public/suncalc-license.txt). No external astronomy service is contacted.

## Runtime dependencies

- [Sharp](https://github.com/lovell/sharp): Apache-2.0. Its native distributions include libvips and other libraries under their respective licences. Preserve their included notices when redistributing dependencies.
- [Node.js](https://github.com/nodejs/node/blob/main/LICENSE): MIT and bundled third-party notices.
- The container includes Debian and additional packages under their respective licences; installed package notices are available under `/usr/share/doc`.

`package-lock.json` pins JavaScript dependencies and records package licence metadata. Third-party notices distributed with dependencies remain applicable.

## On-screen credits and UI lock

Displayed RainViewer/Rainbow, Natural Earth and configured OpenWeather credits remain visible when the dock is hidden, and their links remain usable during UI lock through an external-page warning. No RainViewer exception to disable its link has been obtained or is relied upon. The app uses “Weather by OpenWeatherMap” as its weather credit.
