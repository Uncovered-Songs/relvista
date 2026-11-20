# 0003 — Viewer bundle and ELK worker

- Status: proposed
- Date: 2026-11-20
- Source: phase 1 review round 1 (decision 0001 asked to revisit the viewer engine after measuring
  the bundle in phase 1)

## Measurements

Production build of `apps/docs`, served locally; JavaScript a page with one diagram
(`/docs/gallery/02-ecommerce`) downloads on top of a page without one (`/docs/layout-file`),
captured with Playwright. Gzip sizes are `gzip -9` of the emitted files.

| Chunk                                                  | Before (raw / gz)   | After (raw / gz)                 |
| ------------------------------------------------------ | ------------------- | -------------------------------- |
| elkjs                                                  | 1,525,997 / 442,436 | — (no longer loaded)             |
| ELK Web Worker script (`elk-worker.min.*.js`)          | —                   | 1,548,701 / 450,019, in a worker |
| `@dbml/parse` + `@xyflow/react` + dagre + ajv + lodash | 907,324 / 257,711   | 907,324 / 258,324                |
| `relvista-viewer` (renderer + theme glue)              | 66,075 / 22,703     | 72,195 / 25,059                  |
| small shared chunk                                     | —                   | 4,228 / 1,662                    |
| **Total extra JS**                                     | ~2.5 MB / ~723 KB   | 2,532,448 / 735,064              |

- `react-dom/server` (202,559 / 60,736) loads only on the first export, as before.
- The renderer's `styles.css` (with React Flow's CSS) adds 30,205 / 5,995 to the global stylesheet.
- Main-thread long tasks while laying out `14-large` (74 tables): before 87 ms and 56 ms (ELK
  in-process); after one 58 ms task (parse and first render), ELK runs in the worker. None on
  `02-ecommerce`.

## Decision

- Keep React Flow for the viewer (decision 0001). The bytes are dominated by ELK and the official
  DBML parser, which an own SVG + d3-zoom viewer would also need; React Flow itself is a minor part
  of the 258 KB chunk.
- Run ELK in a Web Worker on docs sites. The theme emits `elkjs/lib/elk-worker.min.js` as an asset
  (webpack rule for `?relvista-worker`) and passes its URL to `DbmlViewer` (`workerUrl`). The worker
  script downloads in parallel and never blocks the main thread; the in-process `elk.bundled.js`
  chunk loads only as a fallback (no `Worker`, or the worker fails).
- The first picture never waits for ELK: the viewer draws the synchronous dagre layout first and swaps
  in the ELK result when it arrives.

## Not done (yet)

- Skipping ELK for small diagrams (dagre only below N tables) would save the worker download on most
  docs pages, at the cost of ELK's column ports and orthogonal routes. Revisit if page weight matters
  more than route quality; a saved layout file with every position already skips ELK.
- Splitting `@dbml/parse` further is not possible without forking it.
