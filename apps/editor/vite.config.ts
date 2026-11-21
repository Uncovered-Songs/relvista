import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// Served at https://uncovered-songs.github.io/relvista/editor/ (copied into the docs build).
export default defineConfig({
  base: process.env.RELVISTA_EDITOR_BASE ?? '/relvista/editor/',
  plugins: [react()],
  worker: {
    format: 'es',
    // No source maps for worker bundles: the SQL worker inlines @dbml/core (15 MB, every SQL
    // grammar) and its 45 MB map exhausts Node's default heap during the build. Vite copies
    // `build.sourcemap` over `worker.rollupOptions.output`, so a plugin hook turns it off.
    plugins: () => [
      {
        name: 'relvista:no-worker-sourcemaps',
        outputOptions: (options) => ({ ...options, sourcemap: false }),
      },
    ],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        // Monaco changes far less often than the app: its own chunk caches across deploys.
        manualChunks(id) {
          if (id.includes('/node_modules/') && id.includes('/monaco-editor/')) return 'monaco';
          return undefined;
        },
      },
    },
  },
  server: { fs: { allow: [repoRoot] } },
});
