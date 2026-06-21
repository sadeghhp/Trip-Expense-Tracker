import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.test.ts'],
      setupFiles: ['./src/test/setup.ts'],
      coverage: {
        provider: 'v8',
        include: ['src/lib/**/*.ts'],
        exclude: ['src/lib/**/*.test.ts', 'src/lib/types.ts'],
        thresholds: {
          'src/lib/engine/**': {
            lines: 90,
            functions: 90,
            branches: 85,
            statements: 90
          },
          'src/lib/**': {
            lines: 80,
            functions: 80,
            branches: 75,
            statements: 80
          }
        }
      }
    }
  })
);
