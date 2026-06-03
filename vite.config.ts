import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { parseFrontendEnv } from './lib/env-schema';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const parsed = parseFrontendEnv(env);
  return {
    server: {
      port: 3005,
      host: '0.0.0.0',
    },
    test: {
      environment: 'jsdom',
      exclude: ['**/node_modules/**', '**/apps/api/**'],
      maxWorkers: 1,
      setupFiles: ['./lib/test-setup.ts'],
      coverage: {
        provider: 'v8',
        // Count ALL source files (not just test-imported ones) so the gate
        // reflects true coverage of the app and cannot be gamed by deleting tests.
        all: true,
        include: ['lib/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'store.ts', 'App.tsx'],
        exclude: [
          '**/*.test.{ts,tsx}',
          '**/*.d.ts',
          'lib/test-setup.ts',
          'lib/locales/**',
        ],
        reporter: ['text-summary', 'text'],
        // Coverage ratchet (same policy as the API jest gate): pinned just below
        // the current measured floor so CI cannot regress. Raise as the large
        // untested surface (page components) gets covered; never lower.
        // Measured with 621 tests: statements 90.80, branches 81.77,
        // functions 88.31, lines 91.59.
        thresholds: {
          statements: 89,
          branches: 80,
          functions: 87,
          lines: 90,
        },
      },
    },
    plugins: [react()],
    build: {
      // Split large third-party libraries into separate, cacheable chunks so
      // the initial JS payload is no longer one ~1.4 MB monolith. Charts
      // (recharts/d3) in particular only load on report screens.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (/[\\/]node_modules[\\/](recharts|d3-|victory-|internmap)/.test(id)) return 'charts';
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|react-is|scheduler)[\\/]/.test(id))
              return 'react-vendor';
            if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query-vendor';
            if (/[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id)) return 'forms-vendor';
            if (/[\\/]node_modules[\\/](i18next|react-i18next)[\\/]/.test(id)) return 'i18n-vendor';
            if (/[\\/]node_modules[\\/](lucide-react)[\\/]/.test(id)) return 'icons-vendor';
            if (/[\\/]node_modules[\\/](socket\.io-client|engine\.io-client)[\\/]/.test(id)) return 'realtime-vendor';
            return 'vendor';
          },
        },
      },
    },
    define: {
      'process.env.VITE_API_URL': JSON.stringify(parsed.apiBaseUrl),
      'process.env.VITE_DEMO_MODE': JSON.stringify(String(parsed.demoMode)),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        '@shared/types': path.resolve(__dirname, 'shared/types/index.ts'),
      },
    },
  };
});
