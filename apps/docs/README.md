# relvista docs

The **relvista** documentation site and live demo of `@relvista/docusaurus-plugin`, published at
<https://relvista.github.io/relvista/> by `.github/workflows/deploy-docs.yml`.

```sh
pnpm docs:start      # builds the packages, then the dev server
pnpm docs:build      # packages + static site in apps/docs/build
pnpm test:e2e        # Playwright: serves the build and checks every gallery page
```

`scripts/sync-assets.mjs` runs before `start` and `build` and generates (git-ignored):

- `docs/gallery/*.mdx` — one page per project in `examples/`;
- `static/schemas/layout-1.json` — copy of `schemas/layout.schema.json` (decision 0002);
- `static/dbml/01-minimal.dbml` — used by the Usage page's `src` example.

The e2e test (`e2e/gallery.spec.ts`) is the phase-1 gate: every gallery page renders, in light and
dark mode, with the table count `compileDbml` gives for each view, a minimap and no errors. It also
checks fullscreen, SVG export and the colour-mode toggle. Screenshots go to
`test-results/screenshots/` (or `$RELVISTA_SHOTS`).
