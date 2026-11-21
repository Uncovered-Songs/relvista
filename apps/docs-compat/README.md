# relvista-docs-compat

Private test fixture, never deployed: a minimal Docusaurus 3.10.2 site that looks nothing like the
default theme (custom Infima colours and fonts, `custom.css`), with
`@docusaurus/theme-mermaid`, `@docusaurus/theme-live-codeblock` and its own swizzled
`CodeBlock` wrapper (`src/theme/CodeBlock`), and relvista registered the recommended way:
`plugins: ['@relvista/docusaurus-plugin']`. A second docs instance (`id: 'catalog'`, routes under
`/catalog`) reads CommonMark sheets from `../docs-compat-catalog/docs`, outside the site directory
(see that folder's README); the site sets `markdown.format: 'detect'`.

`pnpm build` builds it twice: `build/site` with relvista and `build/baseline` without it. The e2e
(`pnpm test:e2e`, also run by the root `pnpm test:e2e`) checks that every fence type renders
(DBML diagram, mermaid SVG, live editor, highlighted code carrying the site's wrapper attribute) in
light and dark mode, that the site's own styles are the same with and without relvista, and that
the catalog pages render and their `dbml` fence becomes a diagram (the build also checks the
static diagram is in the page's HTML).

The fixture has no `browserslist` on purpose (the docs site has one): Docusaurus then transpiles
relvista to ES5 in Babel's loose mode, which turns `[...set]` into `[].concat(set)`. relvista
code must not spread Sets, Maps, iterators or strings (use `Array.from`); the e2e checks that the
diagrams still draw their ref lines.
