# relvista

Open-source entity-relationship diagrams from [DBML](https://dbml.dbdiagram.io/) — the same language
dbdiagram.io uses.

- **Editor website** — open a `.dbml` file, edit it with a live diagram, arrange tables, save it back.
  Static site, no account, no backend.
- **Docusaurus theme** — render ` ```dbml ` code fences and `.dbml` files in your docs with zoom,
  pan, fullscreen, print and export.
- **Core libraries** — parser wrapper, diagram model, layout file and renderer, usable in any React app.

> Status: phase 1 (core, renderer, Docusaurus theme). Nothing is published on npm yet.
> Docs and live gallery: <https://uncovered-songs.github.io/relvista/>

## Principles

- `.dbml` stays 100% compatible with dbdiagram.io: a file valid there opens here unchanged and saves
  back unchanged apart from what you edit. Parsing uses the official `@dbml/parse`.
- Anything DBML cannot express (table positions, per-view layout) lives in a sidecar
  `schema.dbml.layout.json`, versioned by a [JSON Schema](schemas/layout.schema.json).
- One renderer draws the same picture in the editor, in the docs, and in exports.

## Repository layout

```text
apps/
  editor/              Vite SPA, deployed as the website (phase 2)
  docs/                Docusaurus site: project docs + live demo of the theme (phase 1)
packages/
  core/                @relvista/core: parse, model, layout file, auto-layout
  renderer/            @relvista/renderer: SVG components, canvas, export (phase 1)
  docusaurus-theme/    @relvista/docusaurus-theme (phase 1)
examples/              sample .dbml files used by tests and docs
schemas/               layout.schema.json
docs/decisions/        decision records
```

## Development

```sh
nvm use          # Node 24 (>= 20 supported)
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm validate:examples
pnpm docs:start       # docs site with the theme, http://localhost:3000/relvista/
pnpm test:e2e         # after `pnpm docs:build`; needs `pnpm --filter relvista-docs exec playwright install chromium`
```

## Credits

The interactive viewer is built on [React Flow](https://reactflow.dev) by xyflow (MIT). Auto-layout
uses [ELK](https://eclipse.dev/elk/) (elkjs, EPL-2.0) and [dagre](https://github.com/dagrejs/dagre);
DBML parsing uses the official [@dbml/parse](https://github.com/holistics/dbml).

## License

[MIT](LICENSE)
