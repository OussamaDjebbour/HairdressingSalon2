/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        // Form controls are admin-only; keep them out of the public first download.
        // react-direction is a tiny context the app shell uses, so it stays in the entry.
        manualChunks(id) {
          if (id.includes('/node_modules/@radix-ui/react-direction/')) return undefined;
          if (
            id.includes('/node_modules/@radix-ui/') ||
            id.includes('/node_modules/react-day-picker/') ||
            id.includes('/node_modules/date-fns/')
          ) {
            return 'admin-ui';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  test: {
    // The app, the Supabase edge function's shared code, the Cloudflare Pages Functions and the
    // product owner's scripts.
    include: [
      'src/**/*.test.{ts,tsx}',
      'supabase/functions/**/*.test.ts',
      'functions/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
