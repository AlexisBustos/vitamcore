import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup-env.ts'],
    // Los tests comparten una BD real: evitar concurrencia entre archivos.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
  },
});
