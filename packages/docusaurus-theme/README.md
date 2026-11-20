# @relvista/docusaurus-theme

Docusaurus theme from **relvista**: ` ```dbml ` code fences and `.dbml` files become interactive
entity-relationship diagrams, with zoom, pan, fullscreen, print and SVG/PNG export. DBML is parsed by
the official `@dbml/parse`, so anything dbdiagram.io accepts renders here.

Documentation and live gallery: <https://uncovered-songs.github.io/relvista/>

## Install

```sh
npm install @relvista/docusaurus-theme
```

Requires Docusaurus 3.6 or later (tested with 3.10) with the classic theme, and React 18 or 19.

```ts title="docusaurus.config.ts"
export default {
  themes: ['@relvista/docusaurus-theme'],
  themeConfig: {
    dbml: {
      height: 480, // default diagram height: px, or any CSS length
      detailLevel: 'all', // 'all' | 'keys' | 'names'
      toolbar: ['view', 'zoom', 'fit', 'fullscreen', 'export', 'print', 'open-in-editor'],
      // editorUrl: 'https://…', // shows "Open in editor"
    },
  },
};
```

## Code fences

````md
```dbml title="Billing" height=420 view="billing" layout="/layouts/billing.dbml.layout.json" source
Table invoices {
  id integer [pk]
  customer_id integer [ref: > customers.id]
}
Table customers {
  id integer [pk]
}
```
````

| Meta     | Meaning                                                      |
| -------- | ------------------------------------------------------------ |
| `title`  | Caption and export file name                                 |
| `height` | `500` (px) or a CSS length such as `60vh`                    |
| `view`   | Start in a `DiagramView`                                     |
| `layout` | URL of a layout file in `static/` (saved positions)          |
| `source` | Diagram / Source tabs                                        |
| `detail` | `all`, `keys` or `names`                                     |
| `static` | Show the fence as highlighted DBML code instead of a diagram |

## Component

```mdx
import DbmlDiagram from '@theme/DbmlDiagram';
import schema from './schema.dbml'; // .dbml files import as text
import main from './db/main.dbml';
import billing from './db/billing.dbml';

<DbmlDiagram value={schema} title="schema.dbml" />
<DbmlDiagram src="/dbml/shop.dbml" layout="/layouts/shop.dbml.layout.json" />
<DbmlDiagram
  value={{ entry: 'main.dbml', files: { 'main.dbml': main, 'billing.dbml': billing } }}
/>
```

Props: `value` (string or `{ files, entry }`), `src` (URL, `baseUrl` is added), `layout` (object or URL),
`view`, `height`, `title`, `source`, `detailLevel`, `toolbar`, `editorUrl`.

For TypeScript, add `"@relvista/docusaurus-theme/client"` to `compilerOptions.types` to type `.dbml`
imports and `@theme/DbmlDiagram`.

## How it works

- `CodeBlock` is wrapped (`@theme-init/CodeBlock`); only `language-dbml` fences change.
- During server rendering a placeholder of the final height is emitted; the viewer (React Flow,
  `@dbml/parse`, ELK auto-layout) loads in a separate chunk only on pages that show a diagram.
- Colours follow the site's light/dark mode; restyle them with the `--rv-*` CSS variables.
- A small webpack loader renames shadowing `catch` parameters in `@dbml/parse`'s bundle, working around
  a terser miscompilation that otherwise breaks `use` statements in production builds.

## Licence

MIT
