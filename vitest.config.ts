import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      // Mirror tsconfig baseUrl so test imports match source imports
      // e.g. import { isExcluded } from 'lib/exclusions' works in tests too
    },
  },
});
