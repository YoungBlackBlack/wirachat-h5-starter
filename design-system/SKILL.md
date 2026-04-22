---
name: starter-design
description: Design tokens + icons + font for the H5/WebView starter. Use to generate branded screens or throwaway mocks that stay visually consistent with the starter shell. Business projects are expected to fork this file and change `name` + brand-specific language.
user-invocable: true
---

Read `README.md` and `colors_and_type.css` first. The tokens there are the source of truth; do not hard-code hex values in screens — `@import "/design-system/colors_and_type.css"` and use the CSS custom properties.

If you produce visual artifacts (static HTML mocks, slides, prototypes): copy the icons you need out of `assets/icons/` and inline the stylesheet. For production code: import the stylesheet at the page root and reference tokens by name.

## Quick orientation

- **Canvas**: pure black (`var(--color-bg)`), transparent-white surfaces, paired capsule CTAs. Display in Alimama ShuHeiTi (falls back to Noto Sans SC 900), body in PingFang SC, numerals in Montserrat.
- **Copy**: no emoji. Keep consumer copy terse. Localize per project.
- **Iconography**: the SVGs in `assets/icons/` are filled, white-on-dark. On dark background render them as `<img>` with `filter: invert(0)` (they already ship white); on light background apply `filter: invert(1)`.

## Files

- `colors_and_type.css` — tokens (colors, type, spacing, radii, shadows, motion). `@import` this.
- `preview/*.html` — standalone specimens you can open in a browser to eyeball each token category.
- `assets/icons/*.svg` — icon set.
- `assets/logo-rounded.svg` — placeholder logo. Replace per brand.
- `fonts/` — licensed font files + `README.md` with substitution rules.

## Extending

- Add new tokens by editing `colors_and_type.css`. Never introduce a parallel stylesheet in `web/`.
- Add new icons by dropping SVGs into `assets/icons/`. Keep them filled, single-color (white), 24×24 viewBox.
- Per-project brand tweaks belong in a business stylesheet that imports the tokens; do not mutate the tokens file.
