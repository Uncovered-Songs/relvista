# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): small Markdown files that
describe a change to one or more published `@relvista/*` packages and the semver bump it needs.

Add one with:

```sh
pnpm changeset
```

Pick the packages, the bump (patch, minor, major) and write a one-line summary for the changelog.
Commit the generated file with your change. Private packages (the apps) need no changeset.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for more.
