/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /** Dev server only: serve this salon whatever the address (ignored in production builds). */
  readonly VITE_SALON_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
