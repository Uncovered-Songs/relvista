# 0005 — Docusaurus package name: `@relvista/docusaurus-plugin`

- Status: accepted
- Date: 2026-11-21
- Source: owner decision 2026-11-21; registration order checked against `@docusaurus/core` 3.10.2
  (`lib/server/plugins/configs.js`, `lib/webpack/aliases/index.js`) and with docs-site builds

## Context

Phase 1 shipped the Docusaurus integration as `@relvista/docusaurus-theme`, registered with
`themes: ['@relvista/docusaurus-theme']` (decision 0001: "theme package"). In Docusaurus a "theme"
reads as a whole look: navbar, colours, fonts, layout. People choosing a theme expect to switch
from the one they have. relvista does nothing of the kind. It adds diagrams and leaves the site's
look alone:

- Theme components: `@theme/DbmlDiagram` is new, and `@theme/MDXComponents/Code` wraps
  `@theme-init/MDXComponents/Code`, changing only `language-dbml` fences (originally a
  `@theme/CodeBlock` wrapper, see the amendment). No other component is swizzled.
- CSS: `@relvista/renderer/styles.css` targets only `.rv-*`, React Flow (`.react-flow*`) and
  `[data-rv-*]` selectors. No element, `:root` or Infima rules. The diagram follows the site's
  `data-theme` light or dark mode and has its own `--rv-*` variables.
- Build: a webpack rule for `.dbml` and `?relvista-worker` imports, a loader for `@dbml/parse` and
  an optional Prism grammar for `dbml`.

The package is unpublished, so it can still be renamed at no cost.

## Decision

1. Rename the package and folder: `packages/docusaurus-theme` → `packages/docusaurus-plugin`,
   `@relvista/docusaurus-theme` → `@relvista/docusaurus-plugin`, plugin instance name
   `relvista-docusaurus-plugin`. There is no compatibility package or alias, because nothing was
   ever published.
2. The recommended registration is `plugins: ['@relvista/docusaurus-plugin']`, with options as
   `plugins: [['@relvista/docusaurus-plugin', { highlight: false }]]`. The docs site uses this exact
   form.
3. Keep the diagram defaults in `themeConfig.dbml`, validated by the exported
   `validateThemeConfig`. Docusaurus calls `validateThemeConfig` for plugins as well as themes,
   so nothing changes for users or for validation. The plugin option `highlight` stays a plugin
   option.
4. Sites without preset-classic, which list `@docusaurus/theme-classic` in `themes` themselves,
   register relvista in `themes` after the classic theme. The plugin detects the problem case and
   prints a `[relvista]` warning at build time.

## Why `plugins` works, and when it does not

Docusaurus orders plugin instances as preset plugins, then preset themes, then `siteConfig.plugins`,
then `siteConfig.themes`. Any plugin can provide theme components through `getThemePath()`; the
`themes` key only changes the position in that order and the module-name shorthand. Theme aliases
are built in this order. When a later instance provides a component an earlier one already
provided, `@theme-init/<Component>` is pinned to the first provider and `@theme/<Component>` moves
to the later one.

- With preset-classic, theme-classic is a preset theme. It loads before any `plugins` entry, so
  `@theme/CodeBlock` resolves to relvista's wrapper and `@theme-init/CodeBlock` to the classic one.
  This is the case the recommended form covers.
- With `themes: ['@docusaurus/theme-classic']` and relvista in `plugins`, theme-classic loads last.
  Its `CodeBlock` shadows relvista's, and fences silently render as code. In
  `themes: ['@docusaurus/theme-classic', '@relvista/docusaurus-plugin']` relvista loads last and
  works.

`@theme-original` is not an alternative. Every plugin's own components register under it, so in
the last provider it points back to the file itself; it is meant for site swizzles in
`src/theme`. `@theme-init` is the documented mechanism for a theme component that enhances
another one, and `@docusaurus/theme-live-codeblock` uses it too. Only one `@theme-init` wrapper
of a component can be active, so relvista's wrapper and live-codeblock's exclude each other in
any registration order. That was already true under the old name.

Checked with production builds of `apps/docs` (counting server-rendered diagram placeholders on
`/docs/getting-started`, where one ` ```dbml ` fence renders):

| Config                                                                               | Diagram rendered |
| ------------------------------------------------------------------------------------ | ---------------- |
| preset-classic + `plugins: ['@relvista/docusaurus-plugin']` (the docs site)          | yes              |
| `themes: ['@docusaurus/theme-classic']` + `plugins: ['@relvista/docusaurus-plugin']` | no (warning)     |
| `themes: ['@docusaurus/theme-classic', '@relvista/docusaurus-plugin']`               | yes              |

`pnpm test:e2e` covers the first row on every build. Unit tests cover the warning rule.

## Consequences

- The npm name, the `plugins` key and the docs ("it only adds diagrams; your site keeps its own
  styling") all tell users the same thing.
- `themes: ['@relvista/docusaurus-plugin']` still works with preset-classic, since the order
  rules are the same. It is documented only for sites without the preset.
- One side effect of the shorthand rules: under `plugins`, the scope alone, `'@relvista'`, also
  resolves to `@relvista/docusaurus-plugin`. The docs always use the full name.
- The decision 0001 "theme package" row is superseded by this record; the mechanism
  (`@theme-init/CodeBlock` wrapper and the `DbmlDiagram` component) is unchanged. The wrapper
  later moved to `@theme-init/MDXComponents/Code`; see the amendment below.
- Changesets and design docs now refer to `@relvista/docusaurus-plugin`.

## Amendment (2026-11-21): MDX `code` instead of `CodeBlock`

The coexistence fixture (`apps/docs-compat`: preset-classic, `@docusaurus/theme-mermaid`,
`@docusaurus/theme-live-codeblock`, a site's own `swizzle CodeBlock --wrap`) showed the exclusion
above in practice: with relvista in `plugins` and live-codeblock in `themes`, live-codeblock's
`@theme/CodeBlock` won and every ` ```dbml ` fence rendered as code (0 diagrams in the build).

relvista now wraps `@theme-init/MDXComponents/Code` (the MDX `code` element, which decides between
inline code and `CodeBlock`) and no longer provides `CodeBlock`. ` ```dbml ` fences become diagrams
before `CodeBlock` is reached; every other fence goes on to whatever `@theme/CodeBlock` the site
has (live-codeblock's, the site's own wrapper, the classic one). Mermaid fences are separate MDX
elements and never reach either. Nothing else wraps `MDXComponents/Code`, so the order of relvista,
mermaid and live-codeblock does not matter. The classic-theme-in-`themes` rule above is unchanged
(the classic `MDXComponents/Code` would replace relvista's), and so is the warning.
`pnpm test:e2e:compat` checks every fence type in light and dark mode, and that the site's own
styles are identical with and without relvista.
