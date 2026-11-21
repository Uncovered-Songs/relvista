# 0002 — Layout schema URL

- Status: accepted
- Date: 2026-11-20
- Source: phase 0 review (owner agreed to all review fixes on 2026-11-20)

## Context

The layout schema's `$id`, and the `$schema` value **relvista** writes into every
`schema.dbml.layout.json`, pointed at `https://relvista.dev/schemas/layout-1.json`. Decision 0001 only
records that relvista.dev was free on 2026-11-20; nobody has registered it, and it does not resolve.
Editors that fetch `$schema` (VS Code JSON support) would fail, and whoever registers the domain would
control the schema those editors load for users' files.

## Decision

The schema URL is `https://uncovered-songs.github.io/relvista/schemas/layout-1.json`, on the GitHub
Pages site of `Uncovered-Songs/relvista` that decision 0001 already chose for hosting.

- The Pages deployment (phase 1/2) must publish `schemas/layout.schema.json` at
  `schemas/layout-1.json`. Until it does, the URL is an identifier only; validation in `@relvista/core`
  never fetches it.
- A future breaking format change gets `layout-2.json` next to it; `layout-1.json` stays published.
- If a custom domain is registered later, the `$id` does not change: GitHub Pages redirects the
  `github.io` URL, and existing files keep validating.

## Alternatives considered

| Option                                         | Why not                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Register relvista.dev now and serve it there   | Costs money and a renewal to keep forever; can be added later as a mirror |
| `raw.githubusercontent.com/.../main/schemas/…` | Tied to a branch name and file path, served as `text/plain`               |
| No `$schema` in written files                  | Loses editor completion and validation for hand edits                     |

## Amendment 2026-11-21 — repository moved to the `relvista` organisation

The repository moved from `Uncovered-Songs/relvista` to `relvista/relvista` before 1.0 was published.
GitHub Pages does not redirect a project site after a transfer: `https://uncovered-songs.github.io/relvista/`
now answers 404 for every path, and the site lives at `https://relvista.github.io/relvista/`. The
"`$id` never changes" rule above assumed a custom domain on the same Pages site, not a new owner.

- The `$id` (and `LAYOUT_SCHEMA_ID`, written into new layout files) is now
  `https://relvista.github.io/relvista/schemas/layout-1.json`. No layout-1 file was published with
  the old id outside this repository, so the switch happens before any user file depends on it.
- The old id stays valid. `$schema` is any string and is never fetched by relvista; a file that
  names `https://uncovered-songs.github.io/relvista/schemas/layout-1.json` parses, and saves
  byte-identical unless edited (relvista does not rewrite `$schema`). For such files the old URL is
  an identifier only.
- Every published URL (editor default, package `homepage`/`bugs`/`repository`, READMEs, docs config)
  moves to `relvista.github.io/relvista` and `github.com/relvista/relvista`.
  `apps/docs/e2e/site-urls.spec.ts` fails if a shipped file (package `dist`, `package.json`,
  `README.md`, layout schema, or anything in the built docs site and editor) still contains
  `uncovered-songs.github.io`.
