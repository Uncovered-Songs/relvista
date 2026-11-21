// Node only: the build-time ELK layout, loaded by Node itself rather than bundled (the server
// module that src/index.ts generates requires it with `__non_webpack_require__`).
//
// Docusaurus evaluates its server bundle in a VM context of its own. Bundled, @relvista/core would
// build ELK graphs there and hand them to elkjs, loaded by Node in the main context (the import
// ends up a plain `require`); elkjs (GWT code) recognises objects and arrays with `instanceof`,
// which fails across contexts, and returns the graph unlaid. Run here, core and elkjs share the
// main context.
import type * as Core from '@relvista/core';
import type { AutoLayoutOptions, DiagramGeometry, DiagramModel } from '@relvista/core';

let core: Promise<typeof Core> | null = null;

async function layoutDiagram(
  model: DiagramModel,
  options: AutoLayoutOptions,
): Promise<DiagramGeometry> {
  core ??= import('@relvista/core');
  return (await core).layoutDiagram(model, options);
}

export = { layoutDiagram };
