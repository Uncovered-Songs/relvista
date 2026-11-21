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

## Amendment 2026-11-21 — custom domain `relvista.org`

The owner registered `relvista.org` and pointed it at GitHub Pages (A/AAAA records, `www` CNAME,
domain verified for the `relvista` organisation). The site moves to `https://relvista.org/`, with
the editor at `https://relvista.org/editor/`.

- The `$id` (and `LAYOUT_SCHEMA_ID`) is now `https://relvista.org/schemas/layout-1.json`. The docs
  build publishes `schemas/layout.schema.json` at exactly that path
  (`apps/docs/scripts/sync-assets.mjs` copies it to `static/schemas/layout-1.json`).
- relvista accepts three ids. `@relvista/core` never checks `$schema` (the schema types it as any
  string) and never rewrites it, so a file that names any of these parses and saves byte-identical
  unless edited:
  - `https://relvista.org/schemas/layout-1.json` (current, written into new files)
  - `https://relvista.github.io/relvista/schemas/layout-1.json` (first amendment)
  - `https://uncovered-songs.github.io/relvista/schemas/layout-1.json` (original decision)

  `packages/core/test/layout.test.ts` round-trips all three.

- With a custom domain set, GitHub Pages redirects `relvista.github.io/relvista/…` to
  `relvista.org/…`, so the first-amendment id keeps resolving for tools that fetch it.
- The domain is now under the project's control, so the rule of the original decision holds again
  from here on: the `$id` does not change when hosting changes.
- `apps/docs/e2e/shipped-urls.spec.ts` fails if a shipped file (built site and editor, package
  `dist`/`lib`, `package.json`, `README.md`, layout schema) contains `uncovered-songs.github.io` or
  `relvista.github.io/relvista`. The two legacy ids above, as exact strings, are the only
  exception (`LEGACY_SCHEMA_IDS` in that spec).
