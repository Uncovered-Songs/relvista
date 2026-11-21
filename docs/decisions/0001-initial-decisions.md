# 0001 — Initial decisions

- Status: accepted
- Date: 2026-11-20
- Source: proposal & first design doc (owner agreed to all defaults on 2026-11-20)

| Topic                  | Decision                                                                                                                                                                                                                                                      | Alternative considered                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Name                   | **relvista** (rel(ation) + vista). npm, `@relvista` scope, GitHub org, .com/.dev/.io all free on 2026-11-20                                                                                                                                                   | erdloom                               |
| Licence                | MIT                                                                                                                                                                                                                                                           | Apache-2.0 (matches `@dbml/*`)        |
| Language               | DBML exactly as dbdiagram.io; parsed by `@dbml/parse` (pinned exact), `@dbml/core` lazy-loaded for SQL import/export                                                                                                                                          | Own parser                            |
| Layout storage         | Sidecar `schema.dbml.layout.json`, JSON Schema in `schemas/`; optional single-file mode (trailing DBML comment) later                                                                                                                                         | Embedded comment only                 |
| Docs viewer engine     | React Flow read-only, same as the editor; revisit after measuring bundle size in phase 1                                                                                                                                                                      | Own SVG + d3-zoom                     |
| Shared drawing         | Own React SVG components, used for canvas nodes, SSR, print and export                                                                                                                                                                                        | Screenshot libraries                  |
| Code editor            | Monaco, using the language services shipped in `@dbml/parse`                                                                                                                                                                                                  | CodeMirror 6 (no DBML grammar exists) |
| Auto-layout            | ELK.js (layered, ports) in a Web Worker; dagre fallback                                                                                                                                                                                                       | d3-force                              |
| Docusaurus integration | Theme package wrapping `@theme-init/CodeBlock` for ` ```dbml ` fences + `DbmlDiagram` component; no remark config needed. Package renamed `@relvista/docusaurus-plugin`, registered under `plugins`, wrapper moved to `@theme-init/MDXComponents/Code` (0005) | Remark plugin only                    |
| Editor hosting         | GitHub Pages from this repo                                                                                                                                                                                                                                   | Firebase Hosting                      |
| Repo                   | `~/Documents/projects/relvista`, public GitHub repo `Uncovered-Songs/relvista` (personal account, no org)                                                                                                                                                     | New `relvista` org                    |
| Order of work          | Phase 0 foundations → phase 1 core + renderer + Docusaurus theme → phase 2 editor MVP → phase 3 v1 advanced                                                                                                                                                   | Editor first                          |

## Phase gates

- Phase 0: name and licence decided (done).
- Phase 1: demo docs site renders every file in `examples/`.
- Phase 2: dbdiagram files round-trip unchanged through the editor.
- Phase 3: 1.0 published on npm.
