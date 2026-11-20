# Spike: `@dbml/parse` 12.1.0 → diagram model

- Phase: 1 (core)
- Date: 2026-11-20
- Code: `packages/core/src/model/` (`compileDbml`, `selectView`), tests in `packages/core/test/model*.test.ts`

Question: is the official parser enough to build relvista's renderer-agnostic diagram model, and what does
it cost? Short answer: **yes**. The parser does the hard parts (syntax, binding, multi-file `use`,
diagnostics, Monaco services). We add about 600 lines of mapping, partial expansion, FK detection and view
resolution. It costs ~127 KB gzip, and tree-shaking cannot reduce that.

## API we built

```ts
compileDbml(input: string | { files: Record<string, string>; entry: string }): {
  model: DiagramModel | null;
  diagnostics: Diagnostic[]; // { severity, message, code?, file, start, end }, 1-based line/column
};
selectView(model, viewName): DiagramModel | null;
```

`compileDbml` never throws. A plain string is compiled as file `main.dbml`. Diagnostic `file` and every
`span.file` use the caller's key (`schema.dbml`, `/db/a.dbml`, …), not the parser's internal absolute path.
All model objects are plain JSON (no parser classes), so the model can be sent from a Web Worker.

## What the parser gives us for free

| Area                                   | Parser entry point                                                                                                                                                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lex, parse, validate, bind, interpret  | `new Compiler(new MemoryProjectLayout(files)).interpretFile(entry)` returns `Report<Database>`                                                                                                                                                                                                                                                            | `getValue()`, `getErrors()`, `getWarnings()`, `getInfos()`                                                                                                                                                                                                                                                           |
| Multi-file `use` / `reuse`             | same call; `MemoryProjectLayout` resolves `./x.dbml` relative to the importing file                                                                                                                                                                                                                                                                       | Interpreting the entry returns one merged `Database` with exactly what it imports (including refs declared in imported files between imported tables). `reachableFiles(entry)` lists the import graph. `interpretProject()` instead returns `{ files: { [path]: Database } }` with every file as its own entry point |
| Alias resolution                       | refs, inline refs and TableGroup members come back with the real table name (`U.id` → `users`)                                                                                                                                                                                                                                                            |                                                                                                                                                                                                                                                                                                                      |
| Inline refs                            | lifted into `Database.refs`                                                                                                                                                                                                                                                                                                                               | but not those from TablePartials (see below)                                                                                                                                                                                                                                                                         |
| Cardinality                            | each `RefEndpoint.relation` is a cardinality string: `1`, `*`, `0..1`, `0..*`                                                                                                                                                                                                                                                                             | Helpers exported: `getRelationshipOp`, `isEndpointManySide`, `isEndpointOptional`, `getMultiplicities`                                                                                                                                                                                                               |
| Diagnostics                            | `CompileError` / `CompileWarning` with `code` (`CompileErrorCode`), `diagnostic` text, `start`/`end` offsets, `filepath`, sometimes `details.quickFixes`                                                                                                                                                                                                  | Errors in imported files are reported against that file, plus a `5013 IMPORTED_FILE_HAS_ERRORS` on the `use` line                                                                                                                                                                                                    |
| DiagramView                            | `Database.diagramViews[].visibleEntities` as a tri-state `FilterConfig` per dimension                                                                                                                                                                                                                                                                     | `TableGroups { * }` is already expanded to every group name                                                                                                                                                                                                                                                          |
| Records                                | `Database.records[]` with typed values                                                                                                                                                                                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                      |
| Source positions                       | every element has `token: { start, end, filepath }` (0-based line/column + offset)                                                                                                                                                                                                                                                                        | We turn these into `span` on tables, columns, refs, enums, groups, notes and views (for "jump to source")                                                                                                                                                                                                            |
| **Monaco language services**           | `compiler.initMonacoServices()` → `definitionProvider`, `referenceProvider`, `autocompletionProvider` (incl. cross-file `use` suggestions), `diagnosticsProvider` (`provideMarkers(filepath)` gives Monaco markers directly), `codeActionProvider` (quick fixes); plus `dbmlMonarchTokensProvider` and `dbmlLanguageConfig` for highlighting and brackets | No hover, formatting, document symbols or rename provider. These could be built on `nodeAtPosition`, `renameTable`, `renameTableEdit`                                                                                                                                                                                |
| Source edits (for the editor, phase 2) | `renameTableEdit`, `createRefEdit`, `setNoteEdit`, `updateElementSettingEdit`, `createStickyNoteEdit`, `syncDiagramView`, `applyTextEdits`, …                                                                                                                                                                                                             | Text-preserving DBML edits. This matters for the "round-trips unchanged" phase-2 gate.                                                                                                                                                                                                                               |

## What we had to compute

- **Table ids, defaults.** `schemaName` is `null` for the default schema, so ids are `schema.table` with
  `public`. Quoted names may contain dots (`Table x."y.z"` and `Table "x.y".z` are both valid), so a
  segment containing `.` `"` `\` `:` `,` `(` `)`, or starting with `<` `>` `-` `?`, is double-quoted in
  the id (`x."y.z"`, `"x.y".z`); see `src/ids.ts`. Optional booleans (`pk`, `unique`, `not_null`, `increment`) become plain booleans. The colour
  literal `none` becomes `null`.
- **TablePartial expansion.** The parser only records `partials: [{ name, order }]` on the table. The
  partial's columns are **not** merged in. We ported `@dbml/core`'s `Table.processPartials` (12.1.0)
  exactly:
  - `order` is the position among fields and injections;
  - the table's own fields win, and among partials the later one wins;
  - note and `headerColor` come from the latest partial that sets them, unless the table sets them;
  - partial indexes and checks are appended, and named checks get a `<table>.` prefix.

  Columns, indexes and checks carry `fromPartial`.

- **Partial inline refs.** `ref:` settings on partial columns do not appear in `Database.refs`. We build
  them with the same endpoint order the parser uses for own inline refs. The parser's duplicate check
  (`References with same endpoints exist`) never sees them, so we drop a partial ref whose endpoint pair
  matches another ref and emit a warning.
- **`isFk` / `fkSide`.** The FK side is the `many` endpoint. For one-to-one it is the second endpoint, which
  is the rule `@dbml/core`'s SQL exporters use. For inline refs the parser puts the target first, so the
  holder column is the FK. Many-to-many has no FK side.
- **Ref ids.** Every ref, named or not, uses `ref:<from>(<cols>)<op><to>(<cols>)`, with a `#n` suffix
  only for exact endpoint collisions. Ref names are not unique (two `Ref r:` give no diagnostic, and an
  imported file can have its own `r`), so a name-based id would move to another ref when the first one is
  deleted or a `use` is added. The id stays the same across edits that don't touch the ref, so the layout
  file can key on it. Renaming a table changes the ids of its refs; `renameNode` re-keys those edge
  entries.
- **Diagnostics.** We take `start`/`end` offsets and recompute 1-based line/column against the source.
  This counts lines on `\n`, so CRLF works. We also deduplicate (`interpretProject()` reports every error
  twice) and map paths back to caller keys.
- **View resolution** (`resolveView`). `FilterConfig` is tri-state: `null` means hide all, `[]` means show
  all, items means only those. Tables, TableGroups and Schemas are one combined dimension. Once one of them
  has items, the parser sets the unmentioned ones to `[]`, and there `[]` means "contributes nothing".
  So:
  - visible tables = listed tables ∪ members of listed groups ∪ tables of listed schemas;
  - all tables are visible when no dimension has items and at least one is `[]` (`*`, `Tables { * }`,
    `Schemas { * }`);
  - no tables are visible when all three are `null` (an empty view);
  - `groupIds` = listed groups plus groups with a visible table.

  This matches the parser's own DiagramView serializer (`PO` in the bundle).

- **Import aliases in views.** See surprises.
- **Enums imported under an alias.** `use { enum status as st }` gives an enum `st`, but columns of
  imported tables still say `status`. We map `(declaring file, original id)` to the visible id through
  `Database.externals.enums`.
- **Records.** We return only the row count per table id.

## Bundle size

Measured with esbuild 0.28.2 (`--bundle --format=esm --platform=browser`) on an entry that imports only
`compileDbml` and `selectView`:

| Bundle                                      | Raw    | gzip -9 |
| ------------------------------------------- | ------ | ------- |
| model, minified                             | 496 KB | 129 KB  |
| model, unminified                           | 698 KB | 150 KB  |
| all of `@dbml/parse` (`export *`), minified | 491 KB | 127 KB  |
| our model code alone (from metafile)        | 8.8 KB | —       |

**Tree-shaking does nothing.** `dbml-parse.mjs` is a single pre-bundled 626 KB file. `Compiler` reaches
everything, so importing only `Compiler` and `MemoryProjectLayout` costs the same as importing the whole
package. In the unminified file, by `#region`, roughly:

- lodash-es: 135 KB (whole modules inlined)
- Monaco language services: 42 KB
- source transforms: 29 KB
- monaco-editor-core `URI` / `platform` / `process` shims: 25 KB
- `Arch` diagram support: 21 KB
- core: the rest

`luxon` (for record date values) is inlined too. There are no runtime `import`s. The only `require("util")`
is lodash's guarded Node detection, so the bundle runs in the browser.

Speed: 300 tables × 12 columns with 299 refs (92 KB of DBML) takes ~200–280 ms per `compileDbml`, with a
fresh `Compiler` each call (Node 24, M-series).

## Surprises

1. **The parser is newer than the DBML docs.** 12.x has `DiagramView`, `Records`, `TablePartial`,
   `checks`, multi-file `use` / `reuse`, `Dep` (`deps`, `inline_deps`), custom `metadata`, and a whole
   "arch" diagram dialect (`diagramType: 'arch'`, `nodes`, `groups`, `links`). Ref relations are cardinality
   strings, not just `> < - <>`, and `?` makes an endpoint optional (`>?` → `*` / `0..1`).
2. **Most errors mean no model.** `interpretFile` returns `undefined` as soon as there is a normal error, so
   the editor must keep the last good model while the user types. Some errors still return a database: a
   duplicate `Records` block gives one. We return the model whenever the parser does.
3. **Positions are 0-based** in `Position` (`line`, `column`). The diagnostics provider's `Diagnostic` is
   1-based (`startRow` / `startColumn`).
4. **A UTF-8 BOM is a syntax error** (`1000 Unexpected token`). We strip it. Line, column and offset we
   report all index the original string, so on line 1 the BOM counts as a column.
5. **A missing entry file is silent.** It gives an empty `Database` with no error, so we add a diagnostic.
6. **`interpretProject()` duplicates every error**, and it treats every file as an entry point.
   `interpretFile(entry)` is the right call for "the diagram of this file".
7. **Import aliases leak.** `use { table users as u }` gives a table named `u` and refs to `u`, but
   DiagramViews refer to it as `public.users`, which is ambiguous when the entry file declares its own
   `users`. We read the view's `Tables { ... }` entries as written from the syntax tree
   (`compiler.parse.ast`) and resolve those names; `Database.externals.tables[].visibleNames` is the
   fallback.
8. **TableGroups cannot list imported tables**, an error in 12.1.0 ("TableGroup cannot reference imported
   table").
9. **Types and data disagree in places.** Inline refs come back without `name` / `schemaName`, though
   `Ref.name: string | null` is declared non-optional. `ColumnType.isEnum` never appeared for enum-typed
   columns, so we resolve `enumId` ourselves. A boolean column default comes back as the string
   `'false'` (`{ type: 'boolean', value: 'false' }`).
10. **Schema-qualified TableGroup names** (`TableGroup s.g`) are an error, so group ids are `group:<name>`
    with no schema.
11. **The shipped `.d.ts` imports `monaco-editor-core` types**, which is only a devDependency of
    `@dbml/parse`. With `skipLibCheck` (set in `tsconfig.base.json`) tsc passes and the Monaco types resolve
    to `any`. We have not tested a build without `skipLibCheck`.

## Risks

- **Bundle weight.** ~127 KB gzip for parsing alone, before React Flow, ELK and Monaco. In the Docusaurus
  theme it should be lazy-loaded (dynamic `import()` on the first diagram) or run in a worker. Pre-compiling
  diagrams at build time (Node) and shipping only the JSON model is an option for static docs pages.
  Upstream tree-shaking would need `@dbml/parse` to ship unbundled ESM.
- **The parser API is broad and moving.** We rely on `Compiler`, `MemoryProjectLayout`, `Filepath`,
  `interpretFile`, `reachableFiles`, the `Database` JSON shape and four relation helpers. Internal fields
  like `externals.visibleNames` and the `FilterConfig` tri-state are not documented. The version is pinned
  exact (decision 0001), and the model tests double as an upgrade canary.
- **Partial semantics are copied, not shared.** If `@dbml/core` changes `processPartials`, our port drifts.
  We should add a cross-check test once `@dbml/core` is a (lazy) dependency for SQL import/export.
- **Monaco version coupling.** The services are typed against monaco-editor-core 0.44 and return Monaco
  shapes. The editor's Monaco must stay compatible, or we need a thin adapter.
- **Speed on big schemas.** ~0.2 s per compile for 300 tables. For live editing: run it in a worker,
  debounce, and keep one long-lived `Compiler` with `layout.setSource()`. The `Compiler` caches per source
  snapshot. That caching isn't measured yet.
- **The "arch" dialect and `Dep`** are ignored by the model. A file with `diagramType: 'arch'` front matter
  compiles to an empty ER model without an error.
- **The Windows / path model is POSIX.** Caller keys are prefixed with `/` and normalised by `Filepath`.
  Keys like `C:\x.dbml` are not handled.
