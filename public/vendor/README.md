# Browser GIF dependencies

Vendored from npm: `html-to-image@1.11.13` (MIT, bubkoo/html-to-image) and
`gifenc@1.0.3` (MIT, mattdesl/gifenc). Licences accompany the source.
No CDN, runtime installation or third-party request is used.

html-to-image uses the published `es/*.js` sources with explicit `.js` imports.
Local changes: recursively clone SVG children to preserve computed styles and
filters; skip empty SVG image URLs; keep exact font sizes; add `onCloneNode` and `resourceResolver` hooks.
The resolver uses a bounded export-owned asset store and fails closed on missing
assets instead of the library's unbounded global cache/blank image fallback.
Source-map references are removed from both packages; no runtime dependency tree.
