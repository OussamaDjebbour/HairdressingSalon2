/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/** Packages both the public page and the admin form controls use (see manualChunks). */
const SHARED_WITH_ADMIN_UI = ['react', 'react-dom', 'scheduler', 'tslib', '@radix-ui/react-direction'];

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        // Form controls are admin-only; keep them out of the public first download.
        // Rollup moves a manual chunk's unassigned dependencies into it, so the packages the public
        // page shares with them (React, tslib, and react-direction, a tiny context the app shell
        // uses) are named 'vendor'; otherwise the entry would import admin-ui to get React.
        // `pnpm check:bundle` fails if another shared package ends up in admin-ui.
        manualChunks(id) {
          if (SHARED_WITH_ADMIN_UI.some((p) => id.includes(`/node_modules/${p}/`))) return 'vendor';
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
