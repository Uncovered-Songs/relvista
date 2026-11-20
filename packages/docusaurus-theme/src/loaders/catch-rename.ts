/**
 * Webpack loader applied to `@dbml/parse`'s bundle: renames every `catch (x)` parameter that
 * shadows an outer binding.
 *
 * Why: terser (Docusaurus' default minifier, at least up to 5.51) miscompiles
 *   let t = () => make(e);
 *   try { ... } catch (t) { ... }
 *   return t();
 * into `return (() => {})()` when `reduce_vars` and `unused` are on. `@dbml/parse` uses exactly this
 * shape in its parser (`useDeclaration`), so every `use` statement parsed to `undefined` in a
 * production Docusaurus build. Renaming the catch parameter sidesteps the bug without touching
 * the site's minifier settings.
 */
import { transformAsync, type PluginObj } from '@babel/core';

interface LoaderContext {
  async(): (err: Error | null, content?: string, map?: unknown) => void;
  resourcePath: string;
  sourceMap: boolean;
}

export function renameShadowingCatchParams(): PluginObj {
  return {
    name: 'relvista-rename-shadowing-catch-params',
    visitor: {
      CatchClause(path) {
        const param = path.node.param;
        if (param?.type !== 'Identifier') return;
        const outer = path.parentPath.scope;
        if (!outer.hasBinding(param.name, { noGlobals: true })) return;
        path.scope.rename(param.name, path.scope.generateUid(param.name));
      },
    },
  };
}

export default function catchRenameLoader(
  this: LoaderContext,
  source: string,
  map?: unknown,
): void {
  const callback = this.async();
  transformAsync(source, {
    filename: this.resourcePath,
    babelrc: false,
    configFile: false,
    compact: false,
    retainLines: true,
    sourceMaps: this.sourceMap,
    inputSourceMap: (map as never) ?? undefined,
    sourceType: 'unambiguous',
    plugins: [renameShadowingCatchParams],
  }).then(
    (result) => callback(null, result?.code ?? source, result?.map ?? undefined),
    (err: unknown) => callback(err instanceof Error ? err : new Error(String(err))),
  );
}
