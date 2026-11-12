import { randomBytes } from 'node:crypto';

export const DEFAULT_DEMO_DOMAIN = 'demo.invalid';
const USAGE = 'Usage: pnpm setup-demo <salon-id> [--dry-run] [--domain=<email domain, default demo.invalid>]';

/** The shared demo login of a salon. */
export const demoEmail = (salonId: string, domain: string = DEFAULT_DEMO_DOMAIN) => `demo+${salonId}@${domain}`;

/** 128 random bits in base64url: 22 characters, URL-safe. */
export const generateDemoPassword = () => randomBytes(16).toString('base64url');

export function parseDemoArgs(argv: string[]) {
  const flags = argv.filter((a) => a.startsWith('--'));
  const [salonId, ...rest] = argv.filter((a) => !a.startsWith('--'));
  let domain = DEFAULT_DEMO_DOMAIN;
  let dryRun = false;
  for (const f of flags) {
    if (f === '--dry-run') dryRun = true;
    else if (f.startsWith('--domain=')) domain = f.slice('--domain='.length);
    else throw new Error(`${USAGE}\nUnknown option ${f}`);
  }
  if (!salonId || rest.length || !/^[a-z0-9][a-z0-9-]*$/.test(salonId)) {
    throw new Error(`${USAGE}\nGive the id of one salon (lowercase letters, digits, dashes).`);
  }
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]+$/i.test(domain)) throw new Error(`${USAGE}\nInvalid email domain "${domain}".`);
  return { salonId, dryRun, domain };
}

/** setup_demo's refusals in words. */
export function demoErrorMessage(message: string, salonId: string, email: string): string {
  if (message.includes('not_found')) return `There is no salon "${salonId}" in the database (launch it with pnpm new-salon first)`;
  if (message.includes('staff_taken')) return `${email} is already staff of another salon; the demo login must be a dedicated user`;
  if (message.includes('owner_account')) return `${email} is a salon owner's account; the demo login must never be an owner (use a dedicated demo address)`;
  if (message.includes('email_mismatch')) return `The email passed to setup_demo does not match the auth user's email for ${email}`;
  return message;
}
