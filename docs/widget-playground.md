# Widget playground framework

Use the scenario studio to design or refine a widget before connecting production data. Keep a realistic widget beside direct controls and repeatable synthetic scenarios, so visual feedback becomes a reproducible settings change. This is a retained development tool: keep the framework and reference examples after their release work finishes.

## Start and find the reference

Run `npm run dev:scenarios` from the product root with dependencies installed. Wait for the ready message and open [Scenario studio](http://127.0.0.1:3091/__dev). Its [cloud-layer example](http://127.0.0.1:3091/__cloud-layers) demonstrates this workflow. See [development](development.md#reusable-scenario-studio) for fixture behaviour and other playgrounds.

| Reusable part | Current reference |
| --- | --- |
| Loopback server, disposable backend, production CSP and assets | `scripts/dev-playback.mjs` |
| Discovery links and established scenarios | `scripts/dev-scenarios.mjs` |
| Preview stage, toolbar, scenario cards, settings and export layout | `scripts/dev-cloud-layers.html`, `scripts/dev-cloud-layers.css` |
| Control binding, persistence, rendering updates, settings tabs, resize integration | `scripts/dev-cloud-layers.js` |
| Example-specific report model, scenarios and cloud renderer | `scripts/dev-cloud-layers-model.js` |
| Example-specific semantic invariants | `test/dev-cloud-layers.test.js` |

These files are the working reference implementation. Keep the reusable layout/interaction contract below when adding another widget. Extract shared helpers when a second widget needs them; the present reference does not require a new application framework, service or dependency.

## Preview contract

1. **Realistic stage.** Show one actual-size widget over the radar map, with light/dark and plain/map choices. Display dimensions and diagnostic captions outside the widget. The widget itself should have only proposed production content.
2. **Clearly separated controls.** User settings mirror the widget's cog, including the same tabs. Put synthetic data, sizes for experiments, seeds and fault injection in a separately labelled DEV section. Do not let a useful developer knob silently become a product setting.
3. **Repeatable scenarios.** Provide named normal, boundary, crowded, missing, stale and error cases with short explanations. Include direct input and semantic editors where useful. A known scenario restores a useful state after an experiment; invalid input retains the last valid rendering and explains the error.
4. **Immediate feedback.** Changes repaint locally without a build/restart, provider request or deployment. Reload the browser when source files change. Sliders, the cog and direct resize must synchronize.
5. **Reproducibility.** Use deterministic fixture values and explicit seeds. Save only to a widget-specific DEV localStorage key; export readable JSON with an example/schema identifier, scenario and all visual/data controls. Provide a reset. Preserve the reviewed values when changing the implementation.
6. **Production interactions.** Reuse the standard resize handler and, where practical, production control components. Match their complete appearance: dimensions, hit areas, overlay positions, hover background, active brightness, keyboard focus, theme and touch behaviour. Settings tabs need normal keyboard/ARIA behaviour. Review non-destructive mock controls without giving them accidental actions.
7. **Minimal footprint.** Prefer static/event-driven rendering. Keep expensive effects bounded to small regions. Tooling belongs under `scripts/` and stays outside the production image. Use synthetic fixtures and production CSP; never copy real credentials or change live collection to obtain a preview.
8. **Accepted state lives in the spec.** Explore → review → revise → record the accepted design → settle data/state questions → implement. The latest slider value is not automatically a release default. Mark unaccepted examples and unresolved semantics explicitly.

## Add another widget

- Add a discoverable route/link to the existing studio, preserving earlier routes and stable scenario IDs. Use a descriptive `dev-<widget>` source name and separate storage key/export identifier.
- Reuse the reference page structure and interaction plumbing; replace its model, rendering, direct editors and scenario catalogue with the new widget's concerns. Keep model/data normalization separate from DOM controls. Do not build cloud assumptions into a shared helper.
- Identify the matching production widget for footer, controls and settings conventions. Inspect its rendered styles as well as source; an icon alone does not establish a match.
- Keep geometry consistent: card size includes footer/borders, while plot size may not. Measure populated content, preserve the opposite resize anchor in centred previews, and validate saved dimensions after reload.
- Describe each scenario's expected result and recovery path. Keep developer diagnostics outside the production-shaped widget.
- When a shared helper is extracted, migrate the retained example and check it still works; avoid maintaining divergent copies of shared control behaviour indefinitely.

## Review and validation

Check useful normal and minimum sizes, largest font, both themes, opacity extremes, dense content and missing/error states. Use actual pointer drags for all resize handles and keyboard navigation for settings tabs. Confirm mirrored controls, close/reopen, reload persistence, export/reset and last-valid-input recovery. Inspect the browser console.

Test semantic invariants that matter to the widget, such as unit conversion, data boundaries, deterministic rendering or category distinctions. Do not substitute implementation-mirroring tests for visual review. Laptop checks do not establish Pi performance or touchscreen acceptance.

A browser tab, temporary backend and synthetic data directory can be stopped/removed when no longer needed. Retain the source, entry point, documentation, stable scenarios and accepted settings/design record. Keep the cloud example as a regression reference for future widget work.
