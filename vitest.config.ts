import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    env: {
      // Default to development for most tests
      // Security-critical tests should explicitly override NODE_ENV to 'production'
      // to test production code paths (e.g., SENTRY_HASH_SALT validation, CSP enforcement)
      NODE_ENV: 'development',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        '.next/',
        'vitest.setup.ts',
        'vitest.config.ts',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/**',
        'supabase/**',
        'public/**',
        'scripts/**',
        '**/__tests__/**',
        '**/*.{test,spec}.*',
        'mobile/**',
      ],
      include: ['src/**/*.{ts,tsx}'],
      // @ts-expect-error - 'all' is a valid runtime option but not in Vitest 4.x types
      all: true,
      thresholds: {
        lines: 7,
        functions: 8,
        branches: 5,
        statements: 7,
      },
    },
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'supabase', 'e2e', 'mobile'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
