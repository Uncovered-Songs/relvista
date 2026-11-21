import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const stub = (name: string) => fileURLToPath(new URL(`./test/stubs/${name}`, import.meta.url));

// Docusaurus provides these modules at site build time; tests use minimal stand-ins.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@docusaurus\/BrowserOnly$/, replacement: stub('BrowserOnly.tsx') },
      { find: /^@docusaurus\/useBaseUrl$/, replacement: stub('useBaseUrl.ts') },
      { find: /^@docusaurus\/useDocusaurusContext$/, replacement: stub('useDocusaurusContext.ts') },
      { find: /^@theme\/CodeBlock$/, replacement: stub('CodeBlock.tsx') },
      { find: /^@theme-init\/MDXComponents\/Code$/, replacement: stub('MDXCode.tsx') },
      { find: /^@theme\/DbmlDiagram$/, replacement: stub('DbmlDiagram.tsx') },
      { find: /^@theme\/Tabs$/, replacement: stub('Tabs.tsx') },
      { find: /^@theme\/TabItem$/, replacement: stub('TabItem.tsx') },
      {
        find: /^elkjs\/lib\/elk-worker\.min\.js\?relvista-worker$/,
        replacement: stub('elkWorker.ts'),
      },
    ],
  },
});
