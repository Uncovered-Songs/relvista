# relvista brand

The logo, icons and brand colours for **relvista**'s own sites: the docs site, the editor and the
READMEs. The full brief, with contrast numbers and screenshots, is
[docs/design/brand.md](../docs/design/brand.md).

The brand is for relvista's own sites, not for consumers'. The Docusaurus plugin and the renderer do
not ship relvista colours, fonts or logos into a host site; the plugin's `site` palette uses the host
site's theme ([decision 0005](../docs/decisions/0005-plugin-name.md)).

## Files

| File                                     | What                                                                   | Use                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `mark.svg`                               | r-link mark: blue `#2f6fed` stroke, teal `#14a38b` dot, transparent    | mark on light backgrounds, 20 px and up                               |
| `mark-white.svg`                         | white stroke, teal dot                                                 | mark on dark or navy backgrounds                                      |
| `favicon.svg`                            | the mark, transparent, cropped; lighter blue in dark browser chrome    | favicons                                                              |
| `avatar.png`, `avatar-soft.png` (500)    | the mark on white / on the banner's soft blue-teal wash                | GitHub org avatar (owner's choice), npm avatar                        |
| `logo-light.svg`                         | lockup: mark + "relvista" wordmark (Manrope Bold, outlined), navy text | light backgrounds                                                     |
| `logo-dark.svg`                          | lockup: white mark, teal dot, white text                               | dark and navy backgrounds                                             |
| `banner-light.png`, `banner-dark.png`    | 1280×400, the relvista.org home-page hero (light and dark)             | GitHub org profile (`<picture>` per colour scheme)                    |
| `social-preview.png`                     | 1280×640, the home-page hero, light                                    | `og:image` / `twitter:image` for docs and editor, repo social preview |
| `icons/favicon-32.png`                   | 32 px, from `favicon.svg`                                              | PNG favicon                                                           |
| `icons/apple-touch-icon.png`             | 180 px, the mark on white, opaque (iOS rounds it)                      | `apple-touch-icon`                                                    |
| `icons/icon-192.png`, `icon-512.png`     | the mark on white                                                      | web manifest, `purpose: any`; npm README tile                         |
| `icons/icon-maskable-512.png`            | the mark on white, inside the 80 % safe circle                         | web manifest, `purpose: maskable`                                     |
| `source/final.mjs`, `source/outline.mjs` | SVG generator                                                          | regeneration, below                                                   |
| `source/rasterize.mjs`                   | PNG renderer (the repo's Playwright)                                   | regeneration, below                                                   |
| `source/render-org.mjs`                  | site-style banners, social preview and avatars (the repo's Playwright) | `node brand/source/render-org.mjs <out-dir>` from the repo root       |
| `source/MANROPE-OFL.txt`                 | Manrope font licence (SIL OFL 1.1)                                     | the wordmark is outlined from Manrope                                 |

## Logo rules

- Light backgrounds: `logo-light.svg`, or `mark.svg` alone.
- Dark and navy backgrounds: `logo-dark.svg` or `mark-white.svg`. Never the light lockup: its navy
  text disappears.
- On the gradient: white mark and white text only.
- Minimum size: 20 px tall for the lockup. The bare mark works down to 16 px (`favicon.svg`).
- Clear space: at least 25 % of the logo's height on every side.
- The wordmark is artwork. Always use the outlined SVG. Never set "relvista" in live text as a logo,
  never as gradient text, and never stretch, recolour, outline, shadow or rotate it. In prose and UI,
  "relvista" is plain text, always lowercase.
- A lockup that is the only label of a link gets `alt="relvista"`. A mark next to the word is
  decorative: `alt=""` or `aria-hidden="true"`.

## Colours

| Token                  | Light                                  | Dark      | Use                                         |
| ---------------------- | -------------------------------------- | --------- | ------------------------------------------- |
| `--relvista-blue`      | `#2f6fed`                              | `#5b9bff` | buttons, focus ring, selection, the mark    |
| `--relvista-blue-text` | `#2560d6`                              | `#5b9bff` | links and blue text                         |
| `--relvista-teal`      | `#14a38b`                              | `#3cc7ae` | graphic accents only, never light-mode text |
| `--relvista-teal-text` | `#0f7b6c`                              | `#3cc7ae` | teal text                                   |
| `--relvista-navy`      | `#0e1a33`                              | `#0e1a33` | wordmark text, docs footer                  |
| `--relvista-gradient`  | 135°, blue `#2f6fed` to teal `#14a38b` | same      | brand moments only (see below)              |

Contrast: `#2f6fed` passes AA on white only (4.55:1); on grey or tinted backgrounds use `#2560d6`.
Teal `#14a38b` on white is 3.16:1, so it is for graphics, not text. The full table is in
[docs/design/brand.md §4](../docs/design/brand.md#4-colour-tokens).

The look follows relvista.org: white (or dark) surfaces with a soft blue-and-teal wash, as in the home
hero, the docs and editor top bars, the org banner and the social preview. The full 135° gradient is
not used in the UI: not for navbars, buttons, focus rings, borders or text.

## Fonts

- Wordmark and docs headings: [Manrope](https://fonts.google.com/specimen/Manrope) (SIL OFL 1.1),
  weights 600–800. The wordmark in the SVGs is outlined, so no file here needs the font.
- Body and UI: the system stack `Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto,
sans-serif`. Do not change it: the layout engine measures text with it.
- Code: `ui-monospace, 'SF Mono', Menlo, Consolas, monospace`.

## Regenerate

You need Node 24, `pnpm install` and Playwright's Chromium
(`pnpm --filter relvista-docs exec playwright install chromium`). fontkit is not a repo dependency;
install it in a temporary folder.

```sh
# 1. Manrope variable font from Google Fonts (sha256 3ae11c49…9d6ae6 gives byte-identical SVGs)
curl -L -o /tmp/Manrope.ttf \
  'https://github.com/google/fonts/raw/main/ofl/manrope/Manrope%5Bwght%5D.ttf'

# 2. fontkit in a throwaway folder
npm i --prefix /tmp/relvista-fontkit --no-save fontkit@2

# 3. SVGs, written into brand/
NODE_PATH=/tmp/relvista-fontkit/node_modules node brand/source/final.mjs /tmp/Manrope.ttf
# or: MANROPE_TTF=/tmp/Manrope.ttf NODE_PATH=… node brand/source/final.mjs

# 4. PNG icons, written into brand/icons/
node brand/source/rasterize.mjs

# 5. avatars, banners and social preview (site style), written into brand/
node brand/source/render-org.mjs brand
```

With that font file, step 3 reproduces every SVG byte for byte. Step 4 makes the PNGs at the same
sizes; edge pixels can differ slightly between Chromium versions, so commit a PNG only when its SVG
changed.

Then copy what changed into the two sites (each ships its own copy):

| From `brand/`                              | To `apps/docs/static/img/` | To `apps/editor/public/` |
| ------------------------------------------ | -------------------------- | ------------------------ |
| `favicon.svg`                              | yes                        | yes                      |
| `icons/*.png` (all five)                   | yes                        | yes                      |
| `social-preview.png`                       | yes                        | yes                      |
| `logo-light.svg`, `logo-dark.svg`          | yes                        | no                       |
| `mark.svg`, `mark-white.svg`, `avatar.png` | yes                        | no                       |

The editor draws the mark and the wordmark inline in `apps/editor/src/components/icons.tsx`
(the paths from `mark.svg` and `logo-light.svg`). Update those paths too if the artwork changes.
