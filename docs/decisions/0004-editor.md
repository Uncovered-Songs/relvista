# 0004 — Editor: Monaco bundling, deploy path, share format, save semantics

- Status: accepted (owner, 2026-11-21)
- Date: 2026-11-20
- Source: phase 2 design (`docs/design/phase2-editor.md`), research on `@dbml/parse` 12.1.0,
  `monaco-editor` 0.57.0 and a Vite 7 build probe

## Context

Phase 2 ships the editor website (decision 0001: Monaco, using the language services in
`@dbml/parse`; GitHub Pages hosting). Four choices shape every later phase: how Monaco reaches the
browser, where the editor is served, what a share link contains, and what "save" writes.

What `@dbml/parse` 12.1.0 ships, checked in `node_modules/@dbml/parse/dist` and with a Node probe:

| Export                                                 | Monaco hook                        | Notes                                                                         |
| ------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------- |
| `dbmlMonarchTokensProvider`, `dbmlLanguageConfig`      | `setMonarchTokensProvider`, config | The grammar dbdiagram uses: every keyword, `'''` strings, backticks, comments |
| `Compiler#initMonacoServices().autocompletionProvider` | `registerCompletionItemProvider`   | Context-aware: keywords, settings, types, tables, columns, `use` paths        |
| `.definitionProvider`                                  | `registerDefinitionProvider`       | Works across files; returns its own bundled `URI` class (map to `monaco.Uri`) |
| `.referenceProvider`                                   | `registerReferenceProvider`        | Works across files                                                            |
| `.codeActionProvider`                                  | `registerCodeActionProvider`       | Quick fixes for "info" diagnostics (e.g. nullable column with `>`)            |
| `.diagnosticsProvider.provideMarkers(filepath)`        | `setModelMarkers`                  | Severity numbers equal Monaco's (Info 2, Warning 4, Error 8)                  |
| (none)                                                 | hover, semantic tokens, formatting | Hover is ours; no formatter (we never rewrite text)                           |

The providers read the file from `Filepath.fromUri(String(model.uri))`, so a Monaco model at
`file:///schema.dbml` maps to the compiler file `/schema.dbml` — the same absolute path
`compileDbml` uses for the key `schema.dbml`. The bundle has no imports: `monaco-editor-core` is a
type-only dependency.

Build probe (Vite 7.3.8, base `/relvista/editor/`, Monaco `editor.api` + `features/register.all`,
`@dbml/parse`, ELK worker as `?url`, `@dbml/core` as a dynamic import), raw / `gzip -9`:

| Chunk                                        | Raw        | Gzip      | When                       |
| -------------------------------------------- | ---------- | --------- | -------------------------- |
| Main (Monaco editor + features, @dbml/parse) | 4,458,425  | 1,148,577 | page load                  |
| Monaco editor worker                         | 275,665    | 82,570    | first edit (Web Worker)    |
| ELK worker                                   | 1,631,868  | 472,219   | first auto-layout (Worker) |
| Monaco CSS                                   | 186,548    | 27,405    | page load                  |
| `@dbml/core` (all SQL parsers, ANTLR)        | 15,323,212 | 2,576,554 | first SQL import/export    |

## Decision

### Monaco: bundled by Vite, no CDN, no wrapper library

- `import * as monaco from 'monaco-editor/editor/editor.api'` plus
  `import 'monaco-editor/features/register.all'` (editor features without the 80 bundled languages
  and the TS/CSS/HTML/JSON language workers). The only worker is the editor worker:
  `import EditorWorker from 'monaco-editor/editor/editor.worker?worker'`, returned from
  `self.MonacoEnvironment.getWorker`.
- `@monaco-editor/react` is not used: its value is the AMD/CDN loader we do not want, and its
  controlled `value` prop invites `setValue` calls that drop undo history and could rewrite text.
  A ~100-line wrapper owns the editor instance; text flows from Monaco to the app, never back
  (except when a document is opened).
- DBML language: the official `dbmlMonarchTokensProvider` / `dbmlLanguageConfig`, and
  `@dbml/parse` providers for completion, definition, references and code actions on a long-lived
  `Compiler` over a `MemoryProjectLayout` kept in sync with the Monaco models. Diagnostics markers
  come from `compileDbml` (the same run that feeds the diagram), plus `@dbml/parse` "info"
  diagnostics as Info markers. Hover is our own, built from the diagram model.
- `@dbml/core` (SQL import/export) is a dynamic import inside a module Web Worker, loaded the first
  time SQL is used. It is pinned to 12.1.0, the version that depends on our pinned `@dbml/parse`
  12.1.0, so one parser copy exists. Its 2.6 MB gzip chunk never loads for users who do not touch SQL.

### Deploy path: `/relvista/editor/`, inside the docs Pages artifact

- Vite `base: '/relvista/editor/'`, output `apps/editor/dist`. The docs `build` script copies it to
  `apps/docs/build/editor/` after `docusaurus build`; `relvista-docs` lists `relvista-editor` as a
  `workspace:*` devDependency so `pnpm docs:build` (`--filter relvista-docs...`) builds the editor
  first. `deploy-docs.yml` keeps uploading one artifact, `apps/docs/build`, unchanged.
- The editor shares the origin `uncovered-songs.github.io` with the docs, so it reads and writes
  Docusaurus's `localStorage.theme` key: one theme choice for both.

### Share format: compressed URL hash

`<editorUrl>#dbml=<b64u>[&layout=<b64u>][&view=<name>]`

- `dbml`: `base64url(deflate-raw(UTF-8(text)))`, no padding. Text is the DBML without a BOM.
- `layout`: same encoding of `serializeLayout(layout)`; optional.
- `view`: `encodeURIComponent(DiagramView name)`; optional, absent for the default view.
- Parsed with `URLSearchParams(hash.slice(1))`; unknown keys are ignored (room for `files=` for
  multi-file projects later). A `dbml` value that is not valid base64url or does not inflate is
  read as phase-1 plain `encodeURIComponent` text, so old links keep working.
- `CompressionStream('deflate-raw')` (Chrome 103, Firefox 113, Safari 16.4, Node 21) — no library.
  Encoding is async, so the renderer's link builder becomes `createEditorLink(): Promise<string>`.
- The hash never reaches a server. Encoder and decoder live in `@relvista/renderer` (both the
  docs viewer and the editor import them), so the two sides cannot drift.
- Remote files: `?url=<https URL>` fetches raw DBML with CORS (GitHub `blob` URLs are rewritten to
  `raw.githubusercontent.com`), and tries `<url>.layout.json` next to it.

### Save semantics: bytes, not text

- A file is decoded as UTF-8 (`fatal: true`, `ignoreBOM: true`); a BOM is remembered and kept out
  of Monaco; the line-ending kind (LF, CRLF, CR, mixed) is recorded. Non-UTF-8 files are refused
  with a message, never mangled.
- Save of an unedited file (Monaco text equals its text right after opening, including after
  undoing every edit) writes the original bytes back verbatim.
- Save of an edited file writes the edited text with each unchanged line keeping its original
  terminator (line diff against the opened text) and new lines using the file's dominant
  terminator, the BOM restored, UTF-8. Uniform files (the normal case) reduce to "Monaco text with
  the file's EOL". Monaco's `unusualLineTerminators` is `off`, no formatter is registered, and no
  code path calls `setValue` on an open document.
- The sidecar `<entry>.layout.json` is written with `serializeLayout` only when the user changed
  the layout (move, auto-layout, pin, collapse). An unchanged or hand-formatted sidecar is never
  rewritten; an invalid one is never overwritten without confirmation.
- Gate (phase 2, decision 0001): every file in `examples/`, also as CRLF, BOM, BOM + CRLF, mixed
  line endings, lone CR and without a final newline, opens and saves byte-identical with no
  sidecar written — tested end-to-end through both the File System Access path and the download
  fallback.

## Alternatives considered

| Option                                                    | Why not                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `@monaco-editor/react` with `loader.config({monaco})`     | Extra layer whose main feature (CDN loader) we disable; controlled `value` risks rewrites |
| `monaco-editor/esm/vs/editor/editor.main` (all languages) | Ships 80 grammars and four language workers we never use                                  |
| `vite-plugin-monaco-editor`                               | Unmaintained against Vite 7; `?worker` does the same in one line                          |
| Separate Pages artifact / repo for the editor             | Pages serves one artifact per repo; two workflows would race                              |
| Vite `base: './'`                                         | Works, but absolute base keeps worker and font URLs obvious and matches the deploy URL    |
| Share via `encodeURIComponent` text (phase 1)             | 3–10× longer links; 14-large would exceed what chat apps keep                             |
| Share via `fflate` / `lz-string`                          | A dependency for what `CompressionStream` does natively                                   |
| Save `model.getValue()` as is                             | Loses BOM and normalises mixed line endings: breaks the round-trip gate                   |
| Always write the sidecar on save                          | Creates or reformats files the user did not touch                                         |

## Consequences

- First load is ~1.2 MB gzip of JavaScript (Monaco dominates). Trimming `register.all` to a
  curated feature list is a phase 3 option if it matters.
- Builders do not install anything: dependencies are already in `apps/editor/package.json` and
  the lockfile.
- `editorLink()` (sync, phase 1) is replaced by `createEditorLink()` (async); nothing is published
  on npm yet, so no deprecation period.
