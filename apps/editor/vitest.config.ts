import { defineConfig } from 'vitest/config';

// Node environment by default; component tests opt into jsdom with `// @vitest-environment jsdom`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
