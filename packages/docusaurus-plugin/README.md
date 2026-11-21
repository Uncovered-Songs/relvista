# @relvista/docusaurus-plugin

Docusaurus plugin from **relvista**: ` ```dbml ` code fences and `.dbml` files become interactive
entity-relationship diagrams, with zoom, pan, fullscreen, print and SVG/PNG export. DBML is parsed by
the official `@dbml/parse`, so anything dbdiagram.io accepts renders here.

It only adds diagrams: it is not a theme and does not replace yours. Your site keeps its own
styling (classic theme, colours, fonts, custom CSS); relvista's CSS targets only its own `.rv-*` and
React Flow classes. The diagrams fit in: they follow the site's light/dark mode and, by default,
its Infima colours and fonts. It works next to `@docusaurus/theme-mermaid`,
`@docusaurus/theme-live-codeblock` and your own swizzled `CodeBlock`.

Documentation and live gallery: <https://uncovered-songs.github.io/relvista/>

## Install

```sh
npm install @relvista/docusaurus-plugin
```

Requires Docusaurus 3.6 or later (tested with 3.10) with the classic theme, and React 18 or 19.

```ts title="docusaurus.config.ts"
export default {
  plugins: ['@relvista/docusaurus-plugin'], // or [['@relvista/docusaurus-plugin', { highlight: false }]]
  themeConfig: {
    dbml: {
      height: 480, // default diagram height: px, or any CSS length
      detailLevel: 'all', // 'all' | 'keys' | 'names'
      toolbar: ['view', 'zoom', 'fit', 'fullscreen', 'export', 'print', 'open-in-editor'],
      palette: 'site', // 'site': your Infima colours and fonts; 'relvista': relvista's own
      // editorUrl: false, // hides "Open in editor" (default: the hosted relvista editor)
    },
  },
};
```

`highlight` (default `true`) registers a Prism grammar for ` ```dbml static ` blocks and the Source
tab.

With `@docusaurus/preset-classic`, `plugins` is all you need, in any position and in any order
with other plugins and themes (mermaid, live code blocks). A site that lists
`@docusaurus/theme-classic` in `themes` (no preset) must register relvista in `themes` after it,
`themes: ['@docusaurus/theme-classic', '@relvista/docusaurus-plugin']`, because themes load after
plugins and the classic `MDXComponents/Code` would otherwise replace relvista's wrapper; the build
warns when it detects this.

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
`view`, `height`, `title`, `source`, `detailLevel`, `toolbar`, `editorUrl`, `palette`, `className`.

For TypeScript, add `"@relvista/docusaurus-plugin/client"` to `compilerOptions.types` to type `.dbml`
imports and `@theme/DbmlDiagram`.

## Colours and fonts

By default (`palette: 'site'`) diagrams take the site's Infima colours: table headers and
highlights from `--ifm-color-primary` (with readable header text, computed in the browser),
surfaces and text from `--ifm-background-surface-color` and `--ifm-font-color-base`, notes and
errors from the warning and danger colours, fonts from `--ifm-font-family-base` and
`--ifm-font-family-monospace`. Colours set in the DBML (`headercolor`, group, note and ref
colours) win; group colours too dark for a dark canvas are lightened, keeping their hue. SVG and PNG
exports use the colours and fonts the page shows. `palette: 'relvista'` (or the `palette` prop)
keeps relvista's own palette.

Every colour is a CSS variable you can set in `custom.css`. relvista declares its palettes with
zero specificity, so any rule of yours wins:

```css
.rv-viewer {
  --rv-header-bg: #334155;
}
[data-theme='dark'] .rv-viewer {
  --rv-canvas-bg: #0b0d12;
}
```

| Variables                                                                   | What they colour                      |
| --------------------------------------------------------------------------- | ------------------------------------- |
| `--rv-canvas-bg`, `--rv-grid-dot`                                           | Canvas and its dot grid               |
| `--rv-table-bg`, `--rv-table-border`, `--rv-table-shadow`                   | Table cards                           |
| `--rv-header-bg`, `--rv-header-text`                                        | Table header band and name            |
| `--rv-row-text`, `--rv-type-text`, `--rv-row-divider`, `--rv-row-highlight` | Column rows                           |
| `--rv-pk-marker`, `--rv-fk-marker`, `--rv-note-indicator`                   | Key icons and the note dot            |
| `--rv-badge-bg`, `--rv-badge-text`                                          | Column badges                         |
| `--rv-ref-stroke`, `--rv-ref-highlight`                                     | Ref lines, normal and highlighted     |
| `--rv-group-default`                                                        | Table groups without a colour         |
| `--rv-note-bg`, `--rv-note-border`, `--rv-note-text`                        | Sticky notes without a colour         |
| `--rv-selection`                                                            | Ring of a selected table              |
| `--rv-ui-bg`, `--rv-ui-solid`, `--rv-ui-border`, `--rv-ui-text`             | Toolbar, title, minimap, menus, card  |
| `--rv-ui-muted`, `--rv-ui-hover`, `--rv-ui-active`, `--rv-ui-shadow`        | Their secondary text, states, shadow  |
| `--rv-ui-focus`                                                             | Keyboard focus ring                   |
| `--rv-error-bg`, `--rv-error-border`, `--rv-error-text`                     | DBML error banner                     |
| `--rv-font`, `--rv-mono`                                                    | Names and UI text; column types, code |

Each one is described in the docs:
<https://uncovered-songs.github.io/relvista/docs/colours>.

## How it works

- The MDX `code` element is wrapped (`@theme-init/MDXComponents/Code`), not replaced; only
  ` ```dbml ` fences change, and every other fence goes on to the site's `CodeBlock` untouched.
  relvista does not wrap `CodeBlock`: that is where `@docusaurus/theme-live-codeblock` and sites'
  own `swizzle --wrap` wrappers hook in, and only one plugin's `@theme-init` wrapper of a component
  can be active. `@theme/DbmlDiagram` is a new component. No other theme component is swizzled.
- During server rendering a placeholder of the final height is emitted; the viewer (React Flow,
  `@dbml/parse`, ELK auto-layout) loads in a separate chunk only on pages that show a diagram.
- A small webpack loader renames shadowing `catch` parameters in `@dbml/parse`'s bundle, working around
  a terser miscompilation that otherwise breaks `use` statements in production builds.

## Licence

MIT
