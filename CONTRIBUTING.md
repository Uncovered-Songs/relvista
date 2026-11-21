# Contributing to relvista

Thanks for helping. relvista is MIT-licensed; by contributing you agree your work is released under
the same licence.

## Setup

Requirements: Node 24 (see `.nvmrc`; Node >= 20 is supported) and pnpm 9.15 (pinned through
`packageManager`, so `corepack enable` picks the right version).

```sh
nvm use
corepack enable
pnpm install
```

## Scripts

Run from the repository root:

| Script                   | What it does                                          |
| ------------------------ | ----------------------------------------------------- |
| `pnpm build`             | Build every package that has a `build` script         |
| `pnpm typecheck`         | `tsc --noEmit` in every package                       |
| `pnpm test`              | Run the Vitest suites                                 |
| `pnpm lint`              | ESLint (flat config, `typescript-eslint` recommended) |
| `pnpm format`            | Format everything with Prettier                       |
| `pnpm format:check`      | Check formatting without writing                      |
| `pnpm validate:examples` | Parse every file in `examples/` and validate layouts  |
| `pnpm changeset`         | Describe a change to a published package              |

CI runs `format:check`, `lint`, `typecheck`, `test`, `build` and `validate:examples` on every push
and pull request to `main`. Run them locally before you open a pull request.

To work on one package: `pnpm --filter @relvista/core test`.

## Code style

- TypeScript strict, ESM only, `NodeNext` module resolution: relative imports end in `.js`.
- Prettier decides formatting (single quotes, 100 columns, trailing commas). Do not argue with it.
- Exact pins for `@dbml/*`: their output defines compatibility, so upgrades are deliberate and
  tested against `examples/`.

## DBML compatibility rule

relvista must never change a user's `.dbml` file beyond the edit they made. A file that is valid on
dbdiagram.io opens here unchanged and saves back byte-identical apart from the edited span:
comments, whitespace, ordering, quoting and unknown settings are preserved. Anything DBML cannot
express goes in the sidecar `schema.dbml.layout.json`, never in the `.dbml`. Changes that touch
saving must include a round-trip test.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(core): resolve composite foreign keys
fix(renderer): keep edge labels inside the viewport
docs: explain the layout sidecar
chore(deps): bump @dbml/parse to 12.2.0
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`. Scopes are
package or app names (`core`, `renderer`, `docusaurus-plugin`, `editor`, `docs`).

## Changesets

Published packages are versioned with [Changesets](https://github.com/changesets/changesets). If
your pull request changes the behaviour or API of a published `@relvista/*` package, run
`pnpm changeset`, choose the bump, write a one-line summary, and commit the generated file. Docs,
tests, CI and the private apps do not need one.

## Pull requests

- Keep them focused; one concern per pull request.
- Fill in the template checklist.
- For a bug, include the DBML snippet that triggers it, ideally as a test fixture.

## Reporting bugs

Open an issue with the bug template and include the smallest DBML snippet that reproduces the
problem, plus whether it works on dbdiagram.io.
