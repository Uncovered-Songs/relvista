# Tooling

| Concern      | Tool                                                                         | Config                                  |
| ------------ | ---------------------------------------------------------------------------- | --------------------------------------- |
| Packages     | pnpm 9.15 workspace (`apps/*`, `packages/*`)                                 | `pnpm-workspace.yaml`, `packageManager` |
| Node         | Node 24 (>= 20 supported)                                                    | `.nvmrc`, `engines`                     |
| Types        | TypeScript strict, ESM, `NodeNext`                                           | `tsconfig.base.json`                    |
| Formatting   | Prettier 3                                                                   | `.prettierrc.json`, `.prettierignore`   |
| Linting      | ESLint 9 flat config + `typescript-eslint` (non-type-checked recommended)    | `eslint.config.js`                      |
| Tests        | Vitest                                                                       | per package                             |
| Releases     | Changesets, public `@relvista/*` packages                                    | `.changeset/config.json`                |
| CI           | GitHub Actions on GitHub-hosted `ubuntu-latest`                              | `.github/workflows/ci.yml`              |
| Dependencies | Dependabot: npm weekly (`@dbml/*` grouped, exact pins kept), actions monthly | `.github/dependabot.yml`                |

CI order: install (`--frozen-lockfile`) → `format:check` → schema sync check → `lint` → `build` → `typecheck` → `test` →
`validate:examples` → `docs:build` → `test:e2e` (Playwright, the phase-1 gate). `deploy-docs.yml` publishes
`apps/docs` to GitHub Pages on every push to `main`. Contributor-facing details are in [CONTRIBUTING.md](../CONTRIBUTING.md).
