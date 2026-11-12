import { randomBytes } from 'node:crypto';

export const DEFAULT_DEMO_DOMAIN = 'demo.invalid';
const USAGE =
  'Usage: pnpm setup-demo <salon-id> [--dry-run] [--domain=<email domain, default demo.invalid>] [--yes=<salon-id>] [--force]';

/** The shared demo login of a salon. */
export const demoEmail = (salonId: string, domain: string = DEFAULT_DEMO_DOMAIN) => `demo+${salonId}@${domain}`;

/** 128 random bits in base64url: 22 characters, URL-safe. */
export const generateDemoPassword = () => randomBytes(16).toString('base64url');

export function parseDemoArgs(argv: string[]) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const [salonId, ...rest] = argv.filter((a) => !a.startsWith('--'));
  let domain = DEFAULT_DEMO_DOMAIN;
  let dryRun = false;
  let yes: string | null = null;
  let force = false;
  for (const f of flags) {
    if (f === '--dry-run') dryRun = true;
    else if (f === '--force') force = true;
    else if (f.startsWith('--domain=')) domain = f.slice('--domain='.length);
    else if (f.startsWith('--yes=') && f.length > '--yes='.length) yes = f.slice('--yes='.length);
    else throw new Error(`${USAGE}\nUnknown option ${f}`);
  }
  if (!salonId || rest.length || !/^[a-z0-9][a-z0-9-]*$/.test(salonId)) {
    throw new Error(`${USAGE}\nGive the id of one salon (lowercase letters, digits, dashes).`);
  }
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]+$/i.test(domain)) throw new Error(`${USAGE}\nInvalid email domain "${domain}".`);
  return { salonId, dryRun, domain, yes, force };
}

/** What public.demo_preflight returns: the salon as it is before setup-demo touches it. */
export interface DemoPreflight {
  name: string;
  future_bookings: number;
  future_online_bookings: number;
  owner_staff: number;
  demo: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The lines setup-demo prints before asking for confirmation. */
export function describePreflight(salonId: string, p: DemoPreflight): string[] {
  return [
    `Salon "${salonId}": "${p.name}"`,
    `${plural(p.future_bookings, 'future booking')} (${p.future_online_bookings} online)`,
    `${plural(p.owner_staff, 'owner account')}`,
    p.demo ? 'It is already the demo salon' : 'It is not the demo yet',
  ];
}

/**
 * Why setup-demo must not touch this salon, or null. A salon that is not the demo yet and has future
 * online bookings looks like a real salon with real clients: the first reset would delete them.
 */
export function preflightRefusal(salonId: string, p: DemoPreflight, force: boolean): string | null {
  if (force || p.demo || p.future_online_bookings === 0) return null;
  return `"${salonId}" is not the demo and has ${plural(p.future_online_bookings, 'future online booking')} ` +
    `(real clients?). The demo reset deletes every booking of the demo salon. ` +
    `If this really is the salon to turn into the demo, re-run with --force.`;
}

export type ConfirmationStep = { kind: 'confirmed' } | { kind: 'prompt' } | { kind: 'refuse'; message: string };

/** --yes=<salon-id> confirms (it must be this salon); otherwise ask in a terminal, refuse without one. */
export function confirmationStep({ salonId, yes, isTTY }: { salonId: string; yes: string | null; isTTY: boolean }): ConfirmationStep {
  if (yes !== null) {
    return yes === salonId
      ? { kind: 'confirmed' }
      : { kind: 'refuse', message: `--yes=${yes} does not match "${salonId}": nothing was written` };
  }
  if (isTTY) return { kind: 'prompt' };
  return { kind: 'refuse', message: `No terminal to confirm in: re-run with --yes=${salonId} to confirm. Nothing was written` };
}

/** The operator must type the salon id exactly (surrounding spaces ignored). */
export const typedConfirmationMatches = (input: string, salonId: string) => input.trim() === salonId;

/** The Supabase calls configureDemoLogin needs; each returns an error message instead of throwing. */
export interface DemoLoginOps {
  findUser(email: string): Promise<{ id: string } | null>;
  createUser(email: string, password: string): Promise<{ id: string } | { error: string }>;
  /** setup_demo(salon, user, email, password): null on success, else the error message. */
  setupDemo(userId: string, password: string): Promise<string | null>;
  /** Sets the auth user's password: null on success, else the error message. */
  setPassword(userId: string, password: string): Promise<string | null>;
}

export type DemoLoginResult =
  | { ok: true; userId: string; created: boolean; passwordError: string | null }
  | { ok: false; step: 'create' | 'setup_demo'; error: string };

/**
 * Creates or reuses the demo auth user and makes it the salon's demo account with `password`.
 * New user: created with the password, then setup_demo. Existing user: setup_demo FIRST (it refuses
 * an owner, another salon's staff or a mismatched email before anything changes, and stores the new
 * password), then the auth password is set to the same value. If that last step fails, the stored
 * password is still restored on the auth user by the next reset (passwordError says so).
 */
export async function configureDemoLogin(ops: DemoLoginOps, email: string, password: string): Promise<DemoLoginResult> {
  const found = await ops.findUser(email);
  if (found) {
    const setupError = await ops.setupDemo(found.id, password);
    if (setupError) return { ok: false, step: 'setup_demo', error: setupError };
    const passwordError = await ops.setPassword(found.id, password);
    return { ok: true, userId: found.id, created: false, passwordError };
  }
  const created = await ops.createUser(email, password);
  if ('error' in created) return { ok: false, step: 'create', error: created.error };
  const setupError = await ops.setupDemo(created.id, password);
  if (setupError) return { ok: false, step: 'setup_demo', error: setupError };
  return { ok: true, userId: created.id, created: true, passwordError: null };
}

/** setup_demo's refusals in words. */
export function demoErrorMessage(message: string, salonId: string, email: string): string {
  if (message.includes('not_found')) return `There is no salon "${salonId}" in the database (launch it with pnpm new-salon first)`;
  if (message.includes('staff_taken')) return `${email} is already staff of another salon; the demo login must be a dedicated user`;
  if (message.includes('owner_account')) return `${email} is a salon owner's account; the demo login must never be an owner (use a dedicated demo address)`;
  if (message.includes('email_mismatch')) return `The email passed to setup_demo does not match the auth user's email for ${email}`;
  return message;
}
