# relvista

Open-source entity-relationship diagrams from [DBML](https://dbml.dbdiagram.io/) — the same language
dbdiagram.io uses.

- **[Editor](https://uncovered-songs.github.io/relvista/editor/)** — open a `.dbml` file or folder,
  edit it with a live diagram, arrange tables, save it back byte for byte. Static site, no account,
  no backend.
- **Docusaurus plugin** — `plugins: ['@relvista/docusaurus-plugin']` renders ` ```dbml ` code fences
  and `.dbml` files in your docs with zoom, pan, fullscreen, print and export. It only adds
  diagrams; your site keeps its own theme and styling.
- **Core libraries** — parser wrapper, diagram model, layout file and renderer, usable in any React app.

> Status: phase 2 (editor). Nothing is published on npm yet.
> Editor: <https://uncovered-songs.github.io/relvista/editor/> ·
> Docs and live gallery: <https://uncovered-songs.github.io/relvista/>

## Editor

Monaco DBML editing (diagnostics, completion, hover, go to definition, quick fixes) next to a live,
editable diagram: drag tables, notes and groups, pin, collapse, auto-layout, per-view layouts, undo.
Files are yours: open a file or a whole folder (multi-file `use` projects), save straight back with
the File System Access API (Chromium) or as downloads elsewhere. An unedited file saves back
byte for byte, and an edited one keeps its BOM and line endings; table positions go to a
`schema.dbml.layout.json` sidecar only when you move something. Share links carry the schema, layout
and view in the URL hash; export to SVG, PNG, print/PDF, DBML, layout JSON or SQL; import from SQL.
Every diagram in the docs has an "Open in editor" button. See the
[editor docs](https://uncovered-songs.github.io/relvista/docs/editor) and
[`apps/editor`](apps/editor/README.md).

## Principles

- `.dbml` stays 100% compatible with dbdiagram.io: a file valid there opens here unchanged and saves
  back unchanged apart from what you edit. Parsing uses `@dbml/parse`, Holistics' open-source DBML
  parser.
- Anything DBML cannot express (table positions, per-view layout) lives in a sidecar
  `schema.dbml.layout.json`, versioned by a [JSON Schema](schemas/layout.schema.json).
- One renderer draws the same picture in the editor, in the docs, and in exports.

## Repository layout

```text
apps/
  editor/              Vite SPA: the editor, deployed at /relvista/editor/ (phase 2)
  docs/                Docusaurus site: project docs + live demo of the plugin; its build includes the editor
packages/
  core/                @relvista/core: parse, model, layout file, auto-layout
  renderer/            @relvista/renderer: SVG components, viewer, editable canvas, export, share links
  docusaurus-plugin/   @relvista/docusaurus-plugin: adds DBML diagrams to a Docusaurus site (phase 1)
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
pnpm editor:dev       # the editor, http://localhost:5173/relvista/editor/
pnpm docs:start       # docs site with the plugin, http://localhost:3000/relvista/
pnpm docs:build       # the whole Pages site: docs + editor in apps/docs/build/
pnpm test:e2e         # docs + editor + docs-compat e2e, after `pnpm build`;
                      # needs `pnpm --filter relvista-docs exec playwright install chromium`
```

## Credits

The interactive viewer is built on [React Flow](https://reactflow.dev) by xyflow (MIT); the editor
uses [Monaco](https://microsoft.github.io/monaco-editor/) (MIT). Auto-layout
uses [ELK](https://eclipse.dev/elk/) (elkjs, used under EPL-2.0) and [dagre](https://github.com/dagrejs/dagre);
DBML parsing uses [@dbml/parse](https://github.com/holistics/dbml) (Apache-2.0).
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) lists every package bundled into the editor and the
docs site, with its licence ([on the site](https://uncovered-songs.github.io/relvista/third-party-notices)).
Regenerate it after dependency changes with `pnpm build && pnpm notices`; CI fails when it is stale.

relvista is an independent open-source project, not affiliated with Holistics or dbdiagram.io.
DBML is an open-source language by Holistics.

## License

[MIT](LICENSE)
