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
