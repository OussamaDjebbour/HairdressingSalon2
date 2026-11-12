/** Helpers shared by the product owner's scripts (new-salon, setup-demo). */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const ok = (msg: string) => console.log(`✓ ${msg}`);
export const warn = (msg: string) => console.log(`! ${msg}`);
export const info = (msg: string) => console.log(`  ${msg}`);

/** A step failed and said why; the entry point only sets the exit code. */
export class StepFailed extends Error {}
export function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  throw new StepFailed(msg);
}

/** Loads the git-ignored .env.admin (variables already set in the shell win). */
export function loadEnv(required: boolean) {
  const file = join(ROOT, '.env.admin');
  if (existsSync(file)) {
    process.loadEnvFile(file);
    ok('Loaded .env.admin');
  } else if (required) {
    fail('.env.admin not found: copy .env.admin.example to .env.admin and fill it in');
  }
}

export function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) fail(`${name} is not set (in .env.admin)`);
  return v;
}

/** Stands in for WebSocket: the scripts never open a realtime channel. */
class NoRealtime {
  constructor() {
    throw new Error('realtime is not used by this script');
  }
}

export function supabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Realtime is never used here; Node 20 has no global WebSocket for it to find.
    realtime: { transport: NoRealtime as never },
  });
}

/** The auth user with this email (case-insensitive), paging through every user, or null. */
export async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<{ id: string } | null> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Listing users failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return { id: found.id };
    if (data.users.length < perPage) return null;
  }
}
