/**
 * Records the npm packages in the production client bundle for scripts/third-party-notices.mjs
 * (THIRD_PARTY_NOTICES.md, shown at /third-party-notices). Server (SSR) bundles never ship and
 * are skipped; `docusaurus start` is too.
 */
import type { LoadContext, Plugin } from '@docusaurus/types';
import { writePackageList } from '../../../scripts/third-party/collect.mjs';

type WebpackConfig = Parameters<NonNullable<Plugin['configureWebpack']>>[0];
type WebpackPlugin = NonNullable<WebpackConfig['plugins']>[number];
/** What is read off a webpack module: its file, and the modules a concatenated one holds. */
interface ModuleFile {
  resource?: string;
  modules?: Iterable<unknown>;
}

export default function thirdPartyModules(_context: LoadContext): Plugin {
  return {
    name: 'relvista-third-party-modules',
    configureWebpack(config, isServer) {
      if (isServer || config.mode !== 'production') return {};
      const plugin: WebpackPlugin = {
        apply(compiler) {
          compiler.hooks.afterEmit.tap('relvista-third-party', (compilation) => {
            const ids: string[] = [];
            const visit = (m: unknown) => {
              const { resource, modules } = m as ModuleFile;
              if (resource) ids.push(resource);
              for (const inner of modules ?? []) visit(inner);
            };
            for (const m of compilation.modules) {
              // Modules that made it into an emitted chunk (tree-shaken ones did not).
              if (compilation.chunkGraph.getNumberOfModuleChunks(m) > 0) visit(m);
            }
            writePackageList('docs', ids);
          });
        },
      };
      return { plugins: [plugin] };
    },
  };
}
