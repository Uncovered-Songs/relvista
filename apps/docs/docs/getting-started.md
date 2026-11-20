---
sidebar_position: 1
title: Getting started
description: Add the relvista theme to a Docusaurus site and draw your first DBML diagram.
---

**relvista** renders [DBML](https://dbml.dbdiagram.io/docs/), the schema language of dbdiagram.io,
as interactive entity-relationship diagrams. The Docusaurus theme turns every ` ```dbml ` code fence
into a diagram and adds a `<DbmlDiagram>` component for `.dbml` files.

## Requirements

- Docusaurus 3.6 or later (tested with 3.10) with the classic theme or preset
- React 18 or 19

## Install

```bash npm2yarn
npm install @relvista/docusaurus-theme
```

## Configure

Add the theme to `docusaurus.config.ts`:

```ts title="docusaurus.config.ts"
import type { Config } from '@docusaurus/types';

const config: Config = {
  // ...
  themes: ['@relvista/docusaurus-theme'],
  themeConfig: {
    // Optional: defaults for every diagram on the site.
    dbml: {
      height: 480, // px, or any CSS length such as '60vh'
      detailLevel: 'all', // 'all' | 'keys' | 'names'
      toolbar: ['view', 'zoom', 'fit', 'fullscreen', 'export', 'print'],
    },
  },
};

export default config;
```

| `themeConfig.dbml` | Default      | Meaning                                                                                             |
| ------------------ | ------------ | --------------------------------------------------------------------------------------------------- |
| `height`           | `480`        | Height of each diagram. A number is pixels; a string is any CSS length.                             |
| `detailLevel`      | `'all'`      | `all` columns, `keys` only (primary and foreign keys, unique columns), or table `names` only.       |
| `toolbar`          | every button | Toolbar buttons in order: `view`, `zoom`, `fit`, `fullscreen`, `export`, `print`, `open-in-editor`. |
| `editorUrl`        | none         | Base URL of a relvista editor; shows an "Open in editor" button that passes the DBML along.         |

## Your first diagram

Write a fenced code block with the language `dbml` in any Markdown or MDX page:

````md title="docs/schema.md"
```dbml
Table users {
  id integer [pk]
  email varchar [unique]
}

Table posts {
  id integer [pk]
  author_id integer [ref: > users.id]
  title varchar
}
```
````

It renders as:

```dbml height=300
Table users {
  id integer [pk]
  email varchar [unique]
}

Table posts {
  id integer [pk]
  author_id integer [ref: > users.id]
  title varchar
}
```

Drag the tables, scroll to zoom, hover a table to trace its relationships and click it for details.

## TypeScript

To import `.dbml` files and `@theme/DbmlDiagram` with types, add the theme's client types to your
site's `tsconfig.json`:

```json title="tsconfig.json"
{
  "extends": "@docusaurus/tsconfig",
  "compilerOptions": {
    "types": ["@docusaurus/module-type-aliases", "@relvista/docusaurus-theme/client"]
  }
}
```

Next: [all the ways to use it](./usage.mdx).
