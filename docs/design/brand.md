# relvista brand system and look-and-feel brief

Status: brief for the brand pass after phase 3 (94b3465). Logo B ("r-link") is final: it is already
the GitHub org avatar and profile banner. This document is the single reference for how relvista's
own sites look. Three builders implement the change list in §9 in parallel; the packages touch
disjoint files.

The brand name is always lowercase: **relvista** (bold in Markdown and HTML prose, plain in UI
labels, titles and code). Never "Relvista" or "RelVista" in copy. Code identifiers such as
`pluginRelvista` are not copy and stay as they are.

## 1. Scope

The brand applies to relvista's own surfaces: the docs site (`apps/docs`), the editor
(`apps/editor`), the READMEs and the `brand/` folder.

It does **not** apply to consumers' sites. The Docusaurus plugin's default palette `site` keeps
inheriting the host site's Infima colours and fonts (decision 0005). The plugin and renderer must
not ship brand colours, fonts or logos into a host page. `apps/docs-compat` is a consumer fixture
and gets no branding (see `shots/compat-home-*.png`: purple navbar, serif fonts, all its own).

This is a look-and-feel pass only. No feature work, no new npm dependencies.

## 2. Brand assets (`brand/`)

| File                                                 | What                                                                   | Use                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `mark.svg`                                           | r-link mark: blue `#2f6fed` stroke, teal `#14a38b` dot, transparent    | mark on light backgrounds, 20 px and up                               |
| `mark-white.svg`                                     | white stroke, teal dot                                                 | mark on dark or navy backgrounds                                      |
| `favicon.svg`                                        | gradient rounded tile with a white mark (and white dot)                | favicons, app icons, any mark below 20 px                             |
| `avatar.svg` / `avatar.png`                          | full-bleed gradient square, white mark                                 | GitHub/npm avatars, blog author image, apple-touch and maskable icons |
| `logo-light.svg`                                     | lockup: mark + "relvista" wordmark (Manrope Bold, outlined), navy text | light backgrounds                                                     |
| `logo-dark.svg`                                      | lockup: white mark, teal dot, white text                               | dark and navy backgrounds                                             |
| `banner.svg` / `banner.png`                          | 1280×400 gradient, white lockup + tagline                              | GitHub org profile, README hero if ever needed                        |
| `social-preview.svg`/`.png`                          | 1280×640, same design                                                  | `og:image` / `twitter:image` for docs and editor, repo social preview |
| `source/final.mjs`, `outline.mjs`, `MANROPE-OFL.txt` | generator and font licence                                             | regeneration (§9.3)                                                   |

Raster icon set (to be added, §8): `favicon-32.png` (from `favicon.svg`), `apple-touch-icon.png`
180 (from `avatar.svg`, opaque, iOS rounds it), `icon-192.png` and `icon-512.png` (from
`favicon.svg`, `purpose: any`), `icon-maskable-512.png` (from `avatar.svg`, `purpose: maskable`;
the mark stays inside the 80 % safe circle). Ready-made copies, rendered with the repo's Playwright,
are in `/private/tmp/claude-501/-Users-uncovered-mac-Documents-projects/2a6d35d1-4398-4e12-8cd2-5d0c08652199/scratchpad/final-pass/icons/`
(script: `../icons.cjs <brandDir> <outDir>` in the same scratch folder). Builders may copy them or
re-render them with that script.

## 3. Logo usage

- **Light backgrounds** (white, `#f6f7f9`): `logo-light.svg`, or `mark.svg` alone.
- **Dark backgrounds** (`#0f1217`, `#12161c`, navy `#0e1a33`): `logo-dark.svg` or `mark-white.svg`.
  Never put the light lockup on a dark surface: the navy text disappears
  (`shots/brand-logo-sizes.png`, bottom row).
- **On the gradient**: white mark and white text only (as in `banner`, `social-preview`, `favicon`).
- **Minimum sizes**: lockup 20 px tall on screen (about 90 px wide); bare mark 20 px; below 20 px
  use the `favicon.svg` tile, because the teal dot becomes a speck (`shots/brand-logo-sizes.png`,
  16 px mark).
- **Clear space**: at least 25 % of the lockup's height (or of the mark's box) on every side. No
  other element, border or text inside it.
- **The wordmark is artwork.** Always use the outlined SVG. Never set "relvista" in live Manrope
  text as a logo, never as gradient text, never stretched, recoloured, outlined, shadowed or rotated.
  Live text "relvista" in prose and UI is plain body text.
- Accessible name: `alt="relvista"` on a lockup that is the only label of a link; decorative marks
  next to the word get `alt=""` / `aria-hidden="true"`.

## 4. Colour tokens

Brand constants (same in both modes): blue `#2f6fed`, teal `#14a38b`, navy `#0e1a33`, gradient
`linear-gradient(135deg, #2f6fed, #14a38b)`.

UI tokens. The names are the docs' `--relvista-*` custom properties; the editor maps them onto its
`--ed-*` tokens (§9.2). Do not use the `--rv-*` prefix for brand tokens: it belongs to the renderer.

| Token                  | Light                             | Dark                              | Use                                                                                |
| ---------------------- | --------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `--relvista-blue`      | `#2f6fed`                         | `#5b9bff`                         | primary fills (buttons), focus ring, selection, the mark                           |
| `--relvista-blue-text` | `#2560d6`                         | `#5b9bff`                         | links and blue text, in particular on tinted or grey backgrounds                   |
| `--relvista-teal`      | `#14a38b`                         | `#3cc7ae`                         | graphic accents only: dots, icons, rules, chart marks. **Not for light-mode text** |
| `--relvista-teal-text` | `#0f7b6c`                         | `#3cc7ae`                         | teal text (eyebrows, success text)                                                 |
| `--relvista-navy`      | `#0e1a33`                         | `#0e1a33`                         | wordmark text, docs footer band                                                    |
| `--relvista-gradient`  | gradient                          | gradient                          | brand moments only (§5)                                                            |
| page background        | `#ffffff` docs / `#f6f7f9` editor | `#0f1217`                         | unchanged                                                                          |
| surface                | `#ffffff`                         | `#161a21` docs / `#1a1f28` editor | unchanged                                                                          |
| body text              | `#1c1e21` docs / `#1f2633` editor | `#e3e3e3` docs / `#e4e8ef` editor | unchanged                                                                          |

One dark-mode blue: `#5b9bff`. The editor accent and the renderer's dark `selection` /
`refHighlight` already use it; the docs use `#6f9bff` today and move to `#5b9bff` (§9.1). Monaco
and code-block syntax keep `#6f9bff` for keywords (a syntax colour, not the UI blue).

Dark surfaces stay neutral grey-black (`#0f1217` family). They must match the renderer's dark
`canvasBg #0f1217` so diagrams sit flush. Navy is a brand band (footer), not a page background.

### Contrast (WCAG 2.x, computed)

| Foreground on background                                   | Ratio                     | Verdict                                       |
| ---------------------------------------------------------- | ------------------------- | --------------------------------------------- |
| `#2f6fed` on `#ffffff`                                     | 4.55                      | pass, barely: fills and links on white only   |
| `#2f6fed` on `#f6f7f9`                                     | 4.24                      | **fail** for text → use `#2560d6`             |
| `#2f6fed` on `#eaf1ff` (accent-soft)                       | 4.01                      | **fail** for text → use `#2560d6`             |
| `#2560d6` on `#ffffff` / `#f6f7f9` / `#eaf1ff`             | 5.64 / 5.26 / 4.98        | pass                                          |
| `#ffffff` on `#2f6fed` (primary button)                    | 4.55                      | pass                                          |
| `#14a38b` on `#ffffff`                                     | 3.16                      | **fail** for text (graphics ≥ 3:1 only)       |
| `#0f7b6c` on `#ffffff` / `#f6f7f9`                         | 5.16 / 4.81               | pass                                          |
| `#0e1a33` on `#ffffff`                                     | 17.3                      | pass                                          |
| `#5b9bff` on `#0f1217` / `#161a21` / `#1a1f28` / `#12161c` | 6.77 / 6.29 / 5.96 / 6.55 | pass                                          |
| `#0b1220` on `#5b9bff` (dark primary button)               | 6.76                      | pass                                          |
| `#3cc7ae` on `#0f1217` / `#1a1f28`                         | 8.91 / 7.85               | pass                                          |
| `#ebedf0` on `#0e1a33` (footer links)                      | 14.8                      | pass                                          |
| `#ffffff` on gradient midpoint `#1f88c0` / teal end        | 3.93 / 3.16               | large text only (≥ 24 px, or ≥ 19 px bold)    |
| `#2f6fed` mark on `#0e1a33`                                | 3.80                      | graphic only; use `mark-white` on navy anyway |

## 5. Gradient rules

The blue→teal gradient (135°) is for **brand moments** only: favicon and app icons, avatar,
banner, social preview, and (optionally) a very soft tint behind the docs home hero (the existing
radial tints at ≤ 14 % alpha are fine). Never for UI chrome: not on navbars, top bars, buttons,
focus rings, menus, tabs, borders, diagram headers, or as gradient **text** (the current hero
wordmark is gradient text and goes, §9.1). Text on the full-strength gradient is white and large
(≥ 24 px, or ≥ 19 px bold).

## 6. Typography

- **Display / headings (docs only): Manrope**, weights 600–800, from Google Fonts with
  `display=swap`:
  `https://fonts.googleapis.com/css2?family=Manrope:wght@600..800&display=swap` plus `preconnect` to
  `fonts.googleapis.com` and `fonts.gstatic.com`. Apply through `--ifm-heading-font-family` (h1–h6,
  hero tagline, section titles). Owner question (§10): self-hosting one Manrope woff2 under
  `apps/docs/static/fonts/` avoids the third-party request (GDPR) and needs no npm dependency.
- **Body and UI: unchanged system stack**
  `Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. Inter is not
  loaded by us (users with Inter installed get it, everyone else gets the system UI font). Keep it
  that way: this is also `METRICS.fontFamily` in `@relvista/core`, which the layout engine uses to
  measure text, and the site palette maps `--rv-font` to `--ifm-font-family-base`. **Do not change
  `--ifm-font-family-base`, `--ed-font` or `METRICS`**: diagram sizes would change.
- **Code**: `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` (editor `--ed-mono`, renderer
  `METRICS.monoFontFamily`). The docs keep Infima's monospace stack; no font change.
- **Editor**: no web font at all. The wordmark in the top bar and Help is the outlined SVG.

## 7. UI elements

- **Buttons**: primary = solid `--relvista-blue`, white text (light) / `#0b1220` text (dark).
  Secondary = neutral surface with border. No gradients, no shadows beyond the existing ones.
- **Focus ring**: 2 px solid blue (`#2f6fed` light, `#5b9bff` dark), 2 px offset, everywhere: docs
  (new rule), editor (`--ed-focus`, already), renderer toolbar (`--rv-ui-focus`, already).
- **Links**: `--relvista-blue-text`.
- **Code blocks (docs)**: a relvista Prism theme with the editor's Monaco colours (§9.1), so a DBML
  or JS snippet looks the same in the docs and the editor. Light: background `#f6f7f9`, text
  `#1f2633`, keyword `#2560d6`, string `#0f7b6c`, comment `#5f6b7e`, number `#b45309`, operator /
  punctuation `#c2410c`. Dark: background `#1a1f28`, text `#e4e8ef`, keyword `#6f9bff`, string
  `#3cc7ae`, comment `#8d98ab`, number `#e6b836`, operator `#ff9e64`. All ≥ 4.5:1 on their
  background (lowest: keyword light 5.26, comment dark 5.68).
- **Diagrams**: the renderer's built-in `relvista` palette (slate-blue headers `#3d5a80` /
  `#2f4a6e`, blue selection) stays. It is in the brand's blue family and does not clash; changing it
  would change a documented, published palette and every consumer's diagrams for no gain.

## 8. Icons, manifest and social cards

Each site ships its own copy (the editor is deployable on its own with `RELVISTA_EDITOR_BASE`):

- `favicon.svg` (`<link rel="icon" type="image/svg+xml">`), `favicon-32.png`
  (`<link rel="icon" type="image/png" sizes="32x32">`), `apple-touch-icon.png` (180),
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `site.webmanifest`.
- Manifest: `name`, `short_name: "relvista"`, `icons` (192/512 `any`, 512 `maskable`),
  `theme_color: "#ffffff"`, `background_color` = page background, `display: "browser"` (no
  install/PWA claims in this pass). Icon paths relative to the manifest.
- `<meta name="theme-color">` twice, with `media="(prefers-color-scheme: light)"` (`#ffffff`) and
  `dark` (docs `#12161c`, editor `#1a1f28`).
- `og:image` / `twitter:image` = `social-preview.png` (1280×640), absolute URL,
  `twitter:card = summary_large_image`, `og:image:alt` "relvista: DBML entity-relationship
  diagrams, open source".

## 9. Change list

Evidence paths are relative to the screenshot folder
`/private/tmp/claude-501/-Users-uncovered-mac-Documents-projects/2a6d35d1-4398-4e12-8cd2-5d0c08652199/scratchpad/final-pass/shots/`
(1360×900 light/dark and 390×844 light, taken from the production build).

The three packages are disjoint: DOCS owns `apps/docs/**`, EDITOR owns `apps/editor/**`,
LIBS+READMES owns `brand/**`, `packages/**`, `README.md`, `CONTRIBUTING.md`, `schemas/README.md`.
Nobody edits another package's files. Each package copies what it needs from `brand/` (read-only
for DOCS and EDITOR) and from the scratch `icons/` folder. The working tree has uncommitted phase-3
follow-up changes in many of these files; build on them, do not revert them. Every package ends
with the full pipeline green.

### 9.1 DOCS (`apps/docs/**`)

**Wrong now**

1. Old two-table-cards logo in the navbar, light and dark; dark mode shows white cards on a dark
   bar (`home-desktop-light.png`, `home-desktop-dark.png`, `getting-started-*.png`). Navbar title
   is live text, not the wordmark.
2. Old favicon (`static/img/favicon.svg`); no PNG icons, no apple-touch icon, no manifest, no
   theme-color.
3. No `og:image` / `twitter:image`: the built `index.html` has `twitter:card=summary_large_image`
   but no image, so links unfurl without a picture.
4. Hero wordmark is gradient **text** in the system font, not the logo
   (`home-desktop-light.png`, `home-mobile-light.png`).
5. Hero eyebrow is teal `#14a38b` on white: 3.16:1, fails AA for its 0.8 rem text.
6. Headings use the system font (Inter is declared but never loaded); no Manrope anywhere.
7. Dark primary `#6f9bff` differs from the editor/renderer dark blue `#5b9bff`.
8. Light links/active menu/breadcrumb use `#2f6fed` on tinted backgrounds (breadcrumb chip, active
   sidebar item): about 4.0–4.2:1, below AA (`getting-started-desktop-light.png`).
9. Code blocks use Prism `github` (light) and `dracula` (dark, purple `#282a36`) which match neither
   the brand nor the editor (`getting-started-desktop-dark.png`, Install block).
10. Footer is a generic grey-black band with no logo (`home-desktop-light-full.png`,
    `404-desktop-light.png`).
11. 404 is the stock Docusaurus "Page Not Found" with no way back (`404-desktop-*.png`).
12. Blog author image is `/img/logo.svg` (the old logo).
13. No focus-ring rule; Infima/browser defaults.

**Target and files**

- `static/img/`: delete `logo.svg`. Replace `favicon.svg` with `brand/favicon.svg`. Add
  `logo-light.svg`, `logo-dark.svg`, `mark.svg`, `mark-white.svg`, `avatar.svg` (copies from
  `brand/`), `social-preview.png` (copy of `brand/social-preview.png`), `favicon-32.png`,
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`.
- `static/site.webmanifest`: `name: "relvista"`, `short_name: "relvista"`, `start_url: "/"`,
  icons `img/icon-192.png`, `img/icon-512.png` (`any`), `img/icon-maskable-512.png` (`maskable`),
  `theme_color: "#ffffff"`, `background_color: "#ffffff"`, `display: "browser"`.
- `docusaurus.config.ts`:
  - `themeConfig.image: 'img/social-preview.png'`;
  - `themeConfig.metadata`: `og:image:alt`, `twitter:image:alt`, two `theme-color` entries (§8);
  - `headTags`: PNG icon 32, `apple-touch-icon`, `manifest`, `preconnect` to Google Fonts;
  - `stylesheets`: the Manrope URL from §6;
  - `navbar.logo: { alt: 'relvista', src: 'img/logo-light.svg', srcDark: 'img/logo-dark.svg',
height: 28 }` and **no** `navbar.title` (the lockup carries the name; keep `title:
'relvista'` at the config root for `<title>`);
  - `footer.logo: { alt: 'relvista', src: 'img/logo-dark.svg', href: '/', height: 32 }` (the
    footer is navy in both modes);
  - `prism.theme` / `prism.darkTheme`: a relvista theme in a new `src/prismThemes.ts` (plain
    `PrismTheme` objects from `prism-react-renderer`, colours from §7).
- `src/css/custom.css`:
  - add `--relvista-blue`, `--relvista-blue-text`, `--relvista-teal`, `--relvista-teal-text`,
    `--relvista-navy`, `--relvista-gradient` for both modes (§4); keep `--relvista-accent` as an
    alias of `--relvista-teal` or replace its two uses;
  - `--ifm-heading-font-family: Manrope, var(--ifm-font-family-base)`,
    `--ifm-heading-font-weight: 700`. Leave `--ifm-font-family-base` unchanged;
  - light: keep `--ifm-color-primary: #2f6fed` and its scale (buttons, and the `site` palette
    reads it); set `--ifm-link-color`, `--ifm-menu-color-active` and
    `--ifm-breadcrumb-color-active` to `#2560d6`;
  - dark: `--ifm-color-primary: #5b9bff`, dark `#3886ff`, darker `#277bff`, darkest `#005ff2`,
    light `#7eb0ff`, lighter `#8fbbff`, lightest `#c3daff`;
    `--docusaurus-highlighted-code-line-bg: rgba(91, 155, 255, 0.15)`;
  - `.footer--dark { --ifm-footer-background-color: var(--relvista-navy); }` in both modes;
  - `:focus-visible { outline: 2px solid var(--ifm-color-primary); outline-offset: 2px; }`;
  - code-block background tokens to match the Prism theme (`--ifm-code-background` stays Infima's
    for inline code unless it clashes).
- `src/pages/index.tsx` + `index.module.css`: the hero `<h1>` shows the lockup through
  `@theme/ThemedImage` (`img/logo-light.svg` / `img/logo-dark.svg`, `alt="relvista"`, height
  `clamp(48px, 8vw, 80px)`); delete `.wordmark` (gradient text). Eyebrow colour
  `var(--relvista-teal-text)`. Tagline in Manrope 600. Keep the soft radial tints; no full
  gradient band behind the live diagram.
- `src/theme/NotFound/Content/index.tsx` (swizzle, safe): mark (`img/mark.svg` / `mark-white.svg`
  via ThemedImage, 56 px, decorative), heading "Page not found", one line "This page does not
  exist or has moved.", and links "Docs home" (`/docs/getting-started`), "Open the editor"
  (`pathname:///editor/`, `target="_self"`), "Home" (`/`). Primary button + secondary + link, like
  the hero.
- `blog/authors.yml`: `image_url: /img/avatar.svg`.
- `apps/docs-compat`: **no change** (consumer fixture; it must stay unbranded).

**Acceptance**

- No file under `apps/docs/` references `img/logo.svg`; `grep -r "M13 13h3v10h3" apps/docs/static
apps/docs/src` (old logo path) finds nothing.
- Built `build/index.html` has `og:image` and `twitter:image` =
  `https://relvista.org/img/social-preview.png`, `og:image:alt`, `apple-touch-icon`, a 32 px PNG
  icon, `manifest`, two `theme-color` metas; `build/site.webmanifest` is valid JSON and every icon
  it lists exists.
- Screenshots (1360×900 light/dark, 390×844 light) of home, getting started, 404, blog post:
  lockup in the navbar (light lockup on light, dark lockup on dark), lockup in the hero, navy
  footer with the white lockup, Manrope headings, no gradient text.
- Contrast: eyebrow ≥ 4.5:1 in both modes; links, active sidebar item and breadcrumb chip
  ≥ 4.5:1 in light mode (check computed colours in the browser).
- Diagrams unchanged except the dark-mode accent: the `site` palette still reads
  `--ifm-color-primary*` and `--ifm-font-family-base` (no diagram font change; `ssr.spec` and
  `viewer-v1.spec` pass).
- The 404 page is reachable at any unknown URL, has one `<h1>`, and its links work.
- Full pipeline green, including `pnpm test:e2e` (docs, editor and compat).

### 9.2 EDITOR (`apps/editor/**`)

**Wrong now**

1. Top bar logo is the old two-cards mark plus live bold text "relvista"
   (`editor-example-desktop-light.png`, `editor-empty-desktop-dark.png`, mobile
   `editor-empty-mobile-light.png`).
2. `public/favicon.svg` is the old logo. No PNG icons, apple-touch icon, manifest or theme-color.
3. `index.html` has a description but no `og:*` / `twitter:*` tags, so shared editor links unfurl
   bare.
4. Help ("relvista editor") has no logo; the version line is plain text
   (`editor-help-desktop-light.png`).
5. Empty state card has no brand cue (`editor-empty-desktop-*.png`).
6. Links use `--ed-accent #2f6fed`, which is 4.24:1 on `--ed-bg #f6f7f9` and 4.01:1 on
   `--ed-accent-soft`.

**Target and files**

- `public/`: replace `favicon.svg` with `brand/favicon.svg`; add `favicon-32.png`,
  `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `social-preview.png` (copy of `brand/social-preview.png`), `site.webmanifest`
  (`name: "relvista editor"`, `short_name: "relvista"`, `start_url: "./"`, `scope: "./"`, icons
  relative, `theme_color: "#ffffff"`, `background_color: "#f6f7f9"`, `display: "browser"`).
- `index.html`: add the 32 px PNG icon, `apple-touch-icon`, `manifest` (Vite rewrites
  `/…` public paths with the base), two `theme-color` metas (`#ffffff` / `#1a1f28`), and
  `og:type=website`, `og:site_name=relvista`, `og:title="relvista editor"`, `og:description` (reuse
  the meta description), `og:url=https://relvista.org/editor/`,
  `og:image=https://relvista.org/editor/social-preview.png`, `og:image:alt`,
  `twitter:card=summary_large_image`. Keep the theme bootstrap script as is.
- `src/components/icons.tsx`: `Logo` becomes the r-link mark (path and dot from `brand/mark.svg`,
  `viewBox="0 0 32 32"`), stroke `var(--ed-logo-mark)`, dot `#14a38b`, 22 px. Add `Wordmark`: the
  outlined wordmark path from `brand/logo-light.svg` (the `<path transform="translate(150 84)">`;
  bounding box `viewBox="150 10 366 76"`), `fill="var(--ed-logo-text)"`, height 15 px (about
  72 px wide), `aria-hidden`.
- `src/components/TopBar.tsx`: `.ed-logo` = `<Logo/>` + `<Wordmark className="ed-logo__text"/>`,
  link keeps `title="relvista docs"` and gets `aria-label="relvista docs"`. The narrow layout keeps
  hiding `.ed-logo__text` (mark only). The logo must not get wider than today (`review.spec`
  top-bar overlap tests at 780–1360 px).
- `src/styles/tokens.css`: add `--ed-logo-mark` (`#2f6fed` / `#ffffff`), `--ed-logo-text`
  (`#0e1a33` / `#ffffff`), `--ed-brand-teal` (`#14a38b` / `#3cc7ae`), `--ed-link` (`#2560d6` /
  `#5b9bff`). Existing accent, focus and surface values stay (they already match §4).
- `src/styles/app.css`: `a { color: var(--ed-link) }`; `.ed-logo` font rules no longer needed for
  the text; Help brand row and empty-state mark styles.
- `src/components/HelpDialog.tsx`: replace the last line's "**relvista** editor {version}" with a
  brand row: lockup (mark + wordmark, 20 px tall, `role="img" aria-label="relvista"`) followed by
  "editor {version}". Keep the AGPL text, links and the not-affiliated sentence word for word
  (`licence.spec`).
- `src/components/EmptyState.tsx`: decorative `mark` (40 px, `aria-hidden`) above the title. No
  copy change.
- Do not touch `src/monaco/themes.ts` colours (already on-brand) or the diagram palette.

**Acceptance**

- `grep -rn "M13 13h3v10h3\|x=\"1.5\" y=\"3.5\"" apps/editor/src apps/editor/public` finds nothing
  (old logo gone).
- `dist/index.html` contains the icon, manifest, theme-color and og/twitter tags; `og:image` is
  absolute; `dist/site.webmanifest` lists icons that exist in `dist/`.
- Screenshots at 1360×900 light/dark and 390×844: r-link mark + wordmark in the top bar (white
  mark in dark mode), mark only on mobile; Help shows the lockup; empty state shows the mark.
- `review.spec` top-bar tests, `a11y.spec` (axe, light and dark, Help open), `licence.spec`,
  `mobile.spec` pass.
- Links in dialogs and on the page background are ≥ 4.5:1.
- Full pipeline green.

### 9.3 LIBS + READMES (`brand/**`, `packages/**`, `README.md`, `CONTRIBUTING.md`, `schemas/README.md`)

**Wrong now**

1. `brand/source/final.mjs` and `outline.mjs` fail `pnpm format:check` (Prettier), so adding
   `brand/` to git breaks the pipeline.
2. The generator is not reproducible from the repo: it reads `../fonts/Manrope.ttf` (not in the
   repo), imports `fontkit` (not a dependency), writes to `brand/final/` instead of `brand/`, and
   does not make the PNGs (`avatar.png`, `banner.png`, `social-preview.png`). There is no
   `brand/README.md`.
3. No raster icon set in `brand/`.
4. The root README starts with a plain `# relvista` heading: no logo. Package READMEs have no
   brand cue.
5. Licence badge colour is shields' generic `blue`.

**Target and files**

- `brand/source/*.mjs`: run Prettier; keep the output identical (byte-compare the regenerated
  SVGs). Make output paths relative to the script (`new URL('..', import.meta.url)`) so it writes
  into `brand/` directly, and take the font path from an argument or `MANROPE_TTF` env var.
  `fontkit` stays out of `package.json`: document a throwaway install (below).
- `brand/source/rasterize.mjs`: renders `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`,
  `icon-512.png`, `icon-maskable-512.png` into `brand/icons/`, and `avatar.png` (500),
  `banner.png`, `social-preview.png` into `brand/`, with the repo's Playwright (resolve it with
  `createRequire` from `apps/docs/package.json`; no new dependency). The scratch
  `final-pass/icons.cjs` is a working starting point.
- `brand/icons/`: commit the five PNGs.
- `brand/README.md`: what each file is for (table from §2), logo rules (§3), colours and contrast
  summary (§4, link to this doc), gradient rule (§5), fonts (§6), "the brand is for relvista's own
  sites, not consumers' (decision 0005)", and regeneration steps: download Manrope variable TTF
  (OFL, Google Fonts), `npm i --no-save fontkit@2` in a temporary folder or run with
  `npx -p fontkit@2`, `node brand/source/final.mjs <Manrope.ttf>`, `node brand/source/rasterize.mjs`,
  then copy changed files into `apps/docs/static/img/` and `apps/editor/public/` (list the copies).
  Font licence: `source/MANROPE-OFL.txt`.
- `README.md`: replace `# relvista` with a centred `<h1>` holding
  `<picture><source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg"><img
src="brand/logo-light.svg" alt="relvista" width="280"></picture>`; keep badges, set the licence
  badge colour to `2f6fed`; add a short "Brand" line linking `brand/README.md`.
- `packages/core/README.md`, `packages/renderer/README.md`,
  `packages/docusaurus-plugin/README.md`: one small tile above the H1, absolute URL so npm renders
  it: `<img src="https://raw.githubusercontent.com/relvista/relvista/main/brand/icons/icon-192.png"
width="48" height="48" alt="">` (PNG, not SVG: raw SVG is served as `text/plain`). H1 stays the
  package name. No other copy change.
- `CONTRIBUTING.md`: no logo; add one line under the intro: "Logo, colours and fonts:
  [brand/README.md](brand/README.md)."
- `schemas/README.md`: no logo (technical reference); check lowercase brand only.
- `packages/renderer` palette and `packages/docusaurus-plugin` defaults: **no change** (§7,
  decision 0005). Verify only: no brand colour leaks into `site-palette.css`; `PALETTES` unchanged;
  `test/theme.test.ts` passes.

**Acceptance**

- `pnpm format:check` and `pnpm lint` pass with `brand/` present.
- Regenerating from a clean checkout with the README steps reproduces `brand/*.svg` byte for byte
  and the PNGs at the same sizes.
- GitHub renders the README logo in light and dark mode (check the README preview, or render the
  Markdown with GitHub's API). The npm README tile URL returns `image/png` once merged.
- `pnpm packages:check` passes (README, LICENSE, files).
- `git diff packages/*/src` is empty.
- Full pipeline green.

## 10. Owner follow-ups (not in any package)

- GitHub settings (not changed by builders): the repo website field says
  `https://relvista.github.io/relvista/`; set it to `https://relvista.org` once the domain serves.
  Upload `brand/social-preview.png` as the repo social preview.
- The org profile README (`relvista/.github`) links to `relvista.github.io/relvista/…`; update to
  `relvista.org` with the domain.
- Fonts: Google Fonts link (default in this brief) or self-hosted Manrope woff2 (no third-party
  request; then add Manrope to `THIRD_PARTY_NOTICES`).
- Seen during the audit, out of scope here: `/blog` shows "Recent posts" with an empty list while
  the 1.0 post is unlisted (`blog-desktop-light.png`); the API index page's "Previous" link points
  at `TOOLBAR_ITEMS` (`api-desktop-light.png`).
