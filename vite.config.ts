import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { parseFrontendEnv } from './lib/env-schema';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const parsed = parseFrontendEnv(env);
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(parsed.geminiApiKey ?? ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(parsed.geminiApiKey ?? ''),
        'process.env.VITE_API_URL': JSON.stringify(parsed.apiBaseUrl),
        'process.env.VITE_DEMO_MODE': JSON.stringify(String(parsed.demoMode)),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
