---
sidebar_position: 2.5
title: Colours and fonts
description: Diagrams take your site's Infima colours and fonts by default; every colour is a --rv-* CSS variable you can override.
---

Diagrams look like part of your site. By default they take its colours and fonts from the
[Infima](https://infima.dev/) variables the classic theme uses, in light and dark mode:

- **table headers** from your primary colour (`--ifm-color-primary` and its `-dark`, `-darker`,
  `-darkest` shades), always with readable header text;
- **highlights** (the selected table, highlighted refs, the focus ring) from your primary colour,
  adjusted until they stand out from the canvas;
- **surfaces and text** from `--ifm-background-surface-color` and `--ifm-font-color-base`: table
  cards on your surface colour, muted tones mixed from your text colour;
- **sticky notes** and **error banners** from your warning and danger colours;
- **fonts**: names in `--ifm-font-family-base`, column types in `--ifm-font-family-monospace`.

Colours written in the DBML always win: a table's `headercolor` and the colours of table groups,
notes and refs. On a dark canvas, a group colour that would be too dark to read (a navy group on a
dark page) is lightened just enough, keeping its hue.

Exports match the page: SVG and PNG files exported from a diagram use the colours and fonts it
shows, including your overrides. Printing always uses light colours.

## relvista's own palette

To draw diagrams in relvista's blue-grey palette instead, as the [editor](./editor.md) does, set
`palette` in `themeConfig.dbml`:

```ts title="docusaurus.config.ts"
themeConfig: {
  dbml: {
    palette: 'relvista', // default: 'site'
  },
},
```

One diagram can choose for itself with the component: `<DbmlDiagram palette="relvista" … />`.

## Overriding colours in `custom.css`

Every colour a diagram draws is a CSS variable named `--rv-*`. Set any of them in your site's
`custom.css`; your rules win over both palettes, whatever their specificity or load order:

```css title="src/css/custom.css"
/* All diagrams, both modes */
.rv-viewer {
  --rv-header-bg: #334155;
  --rv-font: 'IBM Plex Sans', sans-serif;
}

/* Dark mode only */
[data-theme='dark'] .rv-viewer {
  --rv-canvas-bg: #0b0d12;
}

/* One diagram: give it a class with <DbmlDiagram className="billing" … /> */
.billing .rv-viewer {
  --rv-header-bg: #7c2d12;
}
```

The site palette is the class `rv-palette-site` on `.rv-viewer`, so `.rv-viewer.rv-palette-site`
targets only diagrams that follow the site.

### Diagram

| Variable              | What it colours                                               |
| --------------------- | ------------------------------------------------------------- |
| `--rv-canvas-bg`      | Canvas background                                             |
| `--rv-grid-dot`       | Dots of the canvas grid                                       |
| `--rv-table-bg`       | Table card background                                         |
| `--rv-table-border`   | Table card border                                             |
| `--rv-table-shadow`   | Table and note shadow                                         |
| `--rv-header-bg`      | Table header band (unless the table has a `headercolor`)      |
| `--rv-header-text`    | Table name in the header band                                 |
| `--rv-row-text`       | Column names                                                  |
| `--rv-type-text`      | Column types                                                  |
| `--rv-row-divider`    | Lines between columns                                         |
| `--rv-row-highlight`  | Background of highlighted columns (the ends of a hovered ref) |
| `--rv-pk-marker`      | Primary key icon                                              |
| `--rv-fk-marker`      | Foreign key arrow                                             |
| `--rv-badge-bg`       | Background of column badges (`unique`, `not null`, ...)       |
| `--rv-badge-text`     | Text of column badges                                         |
| `--rv-note-indicator` | Dot marking columns that have a note                          |
| `--rv-ref-stroke`     | Ref lines and their cardinality markers                       |
| `--rv-ref-highlight`  | Ref lines of the hovered or selected table                    |
| `--rv-group-default`  | Table groups without a colour                                 |
| `--rv-note-bg`        | Sticky note background (unless the note has a colour)         |
| `--rv-note-border`    | Sticky note border                                            |
| `--rv-note-text`      | Sticky note text                                              |
| `--rv-selection`      | Ring around a selected or highlighted table                   |

### Toolbar, title, cards and messages

| Variable            | What it colours                                          |
| ------------------- | -------------------------------------------------------- |
| `--rv-ui-bg`        | Toolbar and title chip (slightly translucent)            |
| `--rv-ui-solid`     | Minimap, menus and the table details card                |
| `--rv-ui-border`    | Diagram frame and the borders of toolbar, menus and card |
| `--rv-ui-text`      | Text and icons of toolbar, menus and card                |
| `--rv-ui-muted`     | Secondary text (types and notes in the details card)     |
| `--rv-ui-hover`     | Hovered buttons and menu items                           |
| `--rv-ui-active`    | Pressed buttons                                          |
| `--rv-ui-shadow`    | Shadow of toolbar, menus and card (a `box-shadow` value) |
| `--rv-ui-focus`     | Keyboard focus ring                                      |
| `--rv-error-bg`     | DBML error banner background                             |
| `--rv-error-border` | DBML error banner border                                 |
| `--rv-error-text`   | DBML error banner text                                   |

### Fonts

| Variable    | What it sets                                                |
| ----------- | ----------------------------------------------------------- |
| `--rv-font` | Table, column, group and note names, toolbar and card text  |
| `--rv-mono` | Column types, and code in the details card and error banner |

Tables are sized for relvista's own font metrics; a much wider font can make long names reach the
edge of their table.
