# 0006 — Licence split: MIT libraries, AGPL editor

- Status: accepted (owner, 2026-11-21)
- Date: 2026-11-21
- Source: owner decision 2026-11-21: "keep MIT for the libraries, AGPL for the editor"

## Context

Decision 0001 put the whole repository under MIT. The repository holds two kinds of code:

- Libraries that other people build into their own sites: `@relvista/core`, `@relvista/renderer`
  and `@relvista/docusaurus-plugin`, published to npm. Docs sites and products of every kind,
  closed ones included, should be able to use them without legal review.
- The editor (`apps/editor`), a complete web app hosted at `https://relvista.org/editor/`. It is
  not published to npm. Under MIT anyone can take it, improve it and run it as a hosted service
  without sharing those changes.

## Decision

1. `packages/core`, `packages/renderer`, `packages/docusaurus-plugin`, `apps/docs`,
   `apps/docs-compat`, `docs`, `examples`, `schemas`, `scripts` and everything else outside
   `apps/editor` stay MIT. The root `LICENSE` stays MIT, and each published package keeps its
   copy of it.
2. `apps/editor` is AGPL-3.0-or-later: `apps/editor/LICENSE` holds the official AGPL-3.0 text
   (from `https://www.gnu.org/licenses/agpl-3.0.txt`), and `apps/editor/package.json` has
   `"license": "AGPL-3.0-or-later"`.
3. AGPL §13: the editor's Help dialog states the licence and has a visible "Source code" link to
   `https://github.com/relvista/relvista/tree/main/apps/editor`, so every user of a hosted copy
   can get its source.
4. Contributions are licensed under the licence of the directory they change (CONTRIBUTING.md).

## Alternatives considered

| Option                         | Why not                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------- |
| MIT everywhere (decision 0001) | A fork can offer the editor as a service and keep its changes closed              |
| AGPL everywhere                | Docs sites and companies avoid AGPL libraries; the plugin would lose its audience |
| GPL-3.0 for the editor         | No §13: running a changed copy as a website triggers no duty to share the source  |

## Consequences

- The libraries stay permissive, so they can be adopted in any docs site.
- Forks that offer the editor as a service must share their changes with its users.
- The editor imports the MIT libraries. MIT code can be used in AGPL code, so nothing changes for
  the libraries; the combined editor bundle is distributed under the AGPL.
- `scripts/copy-license.mjs --check` and `pnpm packages:check` fail if `apps/editor/LICENSE` stops
  being the AGPL text or the editor's `license` field changes. The published-package checks still
  require MIT for every package in `packages/`.
- The root README "Licence" section lists the licence per directory; the docs site footer, the
  landing page, the 1.0 post and `THIRD_PARTY_NOTICES.md` name both licences.
- The decision 0001 "Licence: MIT" row is superseded for `apps/editor` only.
