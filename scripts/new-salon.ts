/**
 * pnpm new-salon <slug> [--dry-run] [--reapply-settings] [--add-owner] [--yes]
 *
 * Launches (or updates) the salon described by salons/<slug>.json: validates the config, makes
 * its colour palette, uploads its photos, creates the owner's login, provisions the salon in the
 * database and attaches its domains in Cloudflare. Safe to re-run: every step is idempotent, and on
 * an existing salon only the product owner's keys are sent (the owner's Réglages edits are kept).
 * Secrets come from the git-ignored .env.admin (see .env.admin.example). See salons/README.md.
 *
 * When the salon id already exists, it prints that salon's name and domains and asks before
 * writing anything (a reused id would otherwise overwrite another salon).
 *
 *   --dry-run            validate and print the provision payload; writes nothing
 *   --reapply-settings   existing salon: also overwrite hours, contact info, services and stylists
 *                        with the file
 *   --add-owner          existing salon that already has staff: add the file's owner email as
 *                        another login (else provision_salon refuses with owner_conflict)
 *   --yes                answer yes to the "salon already exists" question
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generatePalette } from '../src/lib/palette';
import { addDomain, ensureCname, findZone, isRegisteredDomain, pagesHostnames, pagesTarget, type Cloudflare } from './lib/cloudflare';
import { ConfigError, parseSalonConfig, type SalonConfig } from './lib/config';
import { confirmContinue, existingSalonLines, type CurrentSalon } from './lib/existing';
import { buildProvisionPayload, localPhotos, provisionErrorMessage, storagePath } from './lib/provision';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUCKET = 'salon-photos';

const ok = (msg: string) => console.log(`✓ ${msg}`);
const warn = (msg: string) => console.log(`! ${msg}`);
const info = (msg: string) => console.log(`  ${msg}`);
class StepFailed extends Error {}
function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  throw new StepFailed(msg);
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const unknown = [...flags].filter((f) => !['--dry-run', '--yes', '--reapply-settings', '--add-owner'].includes(f));
  const [slug, ...rest] = argv.filter((a) => !a.startsWith('--'));
  if (!slug || rest.length || unknown.length || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error('Usage: pnpm new-salon <slug> [--dry-run] [--reapply-settings] [--add-owner] [--yes]   (reads salons/<slug>.json)');
    process.exit(2);
  }
  return {
    slug,
    dryRun: flags.has('--dry-run'),
    yes: flags.has('--yes'),
    reapply: flags.has('--reapply-settings'),
    addOwner: flags.has('--add-owner'),
  };
}

function loadEnv(required: boolean) {
  const file = join(ROOT, '.env.admin');
  if (existsSync(file)) {
    process.loadEnvFile(file); // variables already set in the shell win
    ok('Loaded .env.admin');
  } else if (required) {
    fail('.env.admin not found: copy .env.admin.example to .env.admin and fill it in');
  }
}

function loadConfig(slug: string): SalonConfig {
  const file = join(ROOT, 'salons', `${slug}.json`);
  if (!existsSync(file)) fail(`salons/${slug}.json not found`);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`salons/${slug}.json is not valid JSON: ${(e as Error).message}`);
  }
  let config: SalonConfig;
  try {
    config = parseSalonConfig(json);
  } catch (e) {
    if (e instanceof ConfigError) fail(`salons/${slug}.json: ${e.message}`);
    throw e;
  }
  const missing = localPhotos(config).filter((ref) => !existsSync(photoFile(slug, ref)));
  if (missing.length) fail(`Photos not found in salons/${slug}/photos/: ${missing.join(', ')}`);
  ok(`salons/${slug}.json is valid (salon "${config.id}", ${config.services.length} services, ${config.stylists.length} stylists)`);
  return config;
}

/** Stands in for WebSocket: the script never opens a realtime channel. */
class NoRealtime {
  constructor() {
    throw new Error('realtime is not used by this script');
  }
}

const photoFile = (slug: string, ref: string) => join(ROOT, 'salons', slug, 'photos', ref);

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) fail(`${name} is not set (in .env.admin)`);
  return v;
}

/**
 * The salon id already exists: show which salon that is and what this run changes, then ask
 * before anything is written (--yes answers for the product owner; a dry run writes nothing).
 */
async function confirmExisting(slug: string, id: string, current: CurrentSalon, reapply: boolean, yes: boolean, dryRun: boolean) {
  const [first, ...rest] = existingSalonLines(id, current, { slug, reapply });
  warn(first);
  for (const line of rest) info(line);
  if (dryRun) return;
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  try {
    const answer = await confirmContinue({ yes }, { interactive: rl !== null, ask: (q) => rl!.question(q) });
    if (answer === 'needs-yes') fail(`Not changing the existing salon "${id}" without confirmation: run again with --yes`);
    if (answer === 'stopped') fail('Stopped: nothing was changed');
  } finally {
    rl?.close();
  }
}

async function uploadPhotos(supabase: SupabaseClient, slug: string, config: SalonConfig, settings: boolean) {
  const urls: Record<string, string> = {};
  for (const ref of localPhotos(config, { settings })) {
    const path = storagePath(config.id, ref);
    const { error } = await supabase.storage.from(BUCKET).upload(path, readFileSync(photoFile(slug, ref)), {
      upsert: true,
      contentType: CONTENT_TYPES[extname(ref).toLowerCase()] ?? 'application/octet-stream',
    });
    if (error) fail(`Upload of ${ref} failed: ${error.message}`);
    urls[ref] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    ok(`Photo ${ref} → ${BUCKET}/${path}`);
  }
  if (!Object.keys(urls).length) ok('No local photos to upload');
  return urls;
}

/** The owner's auth user: found by email, or created (confirmed) with a generated password. */
async function ensureOwner(supabase: SupabaseClient, email: string): Promise<{ id: string; password?: string }> {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) fail(`Listing users failed: ${error.message}`);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) {
      ok(`Owner login ${email} already exists`);
      return { id: found.id };
    }
    if (data.users.length < perPage) break;
  }
  const password = randomBytes(12).toString('base64url');
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) fail(`Creating the owner login failed: ${error?.message ?? 'no user returned'}`);
  // Printed now: if a later step fails, a re-run finds the login and can't show the password again.
  ok(`Owner login ${email} created, password (shown once, give it to the owner): ${password}`);
  return { id: data.user.id, password };
}

/** Attaches every domain; returns the DNS records to add by hand. */
async function attachDomains(cf: Cloudflare, domains: string[]): Promise<{ todo: string[]; failed: boolean }> {
  const todo: string[] = [];
  let failed = false;
  for (const domain of domains) {
    for (const host of pagesHostnames(domain)) {
      try {
        const added = await addDomain(cf, host);
        ok(`${host} ${added === 'added' ? 'attached to' : 'already on'} the Pages project "${cf.project}"`);
        const zone = await findZone(cf, host);
        if (!zone) {
          warn(`${host}: its domain is not in this Cloudflare account`);
          todo.push(`At the domain's DNS provider: CNAME  ${host}  →  ${pagesTarget(cf)}` +
            (isRegisteredDomain(host) ? '  (a bare domain needs CNAME flattening/ALIAS, or move its nameservers to Cloudflare)' : ''));
          continue;
        }
        const dns = await ensureCname(cf, zone.id, host);
        if (dns.status === 'conflict') {
          warn(`${host}: DNS already has ${dns.existing}; left untouched`);
          todo.push(`In Cloudflare DNS (${zone.name}): replace ${host} (${dns.existing}) with CNAME → ${pagesTarget(cf)} (proxied)`);
        } else {
          ok(`DNS ${host} → ${pagesTarget(cf)} ${dns.status === 'created' ? 'created' : 'already set'}`);
        }
      } catch (e) {
        console.error(`✗ ${host}: ${(e as Error).message}`);
        failed = true;
      }
    }
  }
  return { todo, failed };
}

function supabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Realtime is never used here; Node 20 has no global WebSocket for it to find.
    realtime: { transport: NoRealtime as never },
  });
}

/** The salon stored under this id (name and domains), or null when the id is free. */
async function currentSalon(supabase: SupabaseClient, id: string): Promise<CurrentSalon | null> {
  const { data, error } = await supabase.from('salons').select('name').eq('id', id).maybeSingle();
  if (error) fail(`Reading salons failed: ${error.message}`);
  if (data === null) return null;
  const domains = await supabase.from('salon_domains').select('domain').eq('salon_id', id).order('domain');
  if (domains.error) fail(`Reading salon_domains failed: ${domains.error.message}`);
  return { name: data.name as string, domains: domains.data.map((d) => d.domain as string) };
}

async function main() {
  const { slug, dryRun, yes, reapply, addOwner } = parseArgs(process.argv.slice(2));

  // 1. environment and config (every variable is checked before anything is written)
  loadEnv(!dryRun);
  const config = loadConfig(slug);
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const cloudflare: Cloudflare | null =
    dryRun || !token
      ? null
      : { accountId: env('CLOUDFLARE_ACCOUNT_ID'), apiToken: token, project: env('CLOUDFLARE_PAGES_PROJECT') };
  const supabaseUrl = dryRun ? process.env.SUPABASE_URL?.trim() : env('SUPABASE_URL');
  const serviceKey = dryRun ? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() : env('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = supabaseUrl && serviceKey ? supabaseClient(supabaseUrl, serviceKey) : null;

  // 2. palette
  const { palette, warnings } = generatePalette(config.color);
  ok(`Palette from ${config.color.toUpperCase()}: ${Object.values(palette).join(' ')}`);
  for (const w of warnings) warn(w);

  // A new salon gets everything; an existing one only the product owner's keys, unless asked.
  const current = supabase ? await currentSalon(supabase, config.id) : null;
  const existing = current !== null;
  const settings = !existing || reapply;
  if (current) await confirmExisting(slug, config.id, current, reapply, yes, dryRun);

  if (dryRun) {
    if (!supabase) warn('No database access (.env.admin): showing the payload for a new salon');
    const base = supabaseUrl?.replace(/\/+$/, '');
    const urls = Object.fromEntries(localPhotos(config, { settings }).map((ref) => [ref,
      base ? `${base}/storage/v1/object/public/${BUCKET}/${storagePath(config.id, ref)}` : `<upload of ${ref}>`]));
    console.log(JSON.stringify(buildProvisionPayload(config, palette, urls, undefined, { settings, addOwner }), null, 2));
    ok('Dry run: the payload above is valid (owner_user_id is added once the login exists); nothing was written');
    return;
  }
  if (!supabase || !supabaseUrl) return fail('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set (in .env.admin)');

  // 3. photos
  const photoUrls = await uploadPhotos(supabase, slug, config, settings);

  // 4. owner login
  const owner = await ensureOwner(supabase, config.owner.email);

  // 5. salon
  const payload = buildProvisionPayload(config, palette, photoUrls, owner.id, { settings, addOwner });
  const domains = payload.domains ?? [];
  const { error } = await supabase.rpc('provision_salon', { p: payload });
  if (error) fail(`provision_salon: ${provisionErrorMessage(error.message, config.id)}`);
  ok(existing
    ? `Salon "${config.id}" updated: name, colours, photo, story, claims, ${domains.length ? 'domains, ' : ''}owner` +
        (settings ? ', and hours, contact, services and stylists re-applied' : " (the owner's settings are kept)")
    : `Salon "${config.id}" created (${domains.length} domains, ${config.services.length} services, ${config.stylists.length} stylists)`);

  // 6. domains
  let todo: string[] = [];
  let cfFailed = false;
  if (!domains.length) {
    warn(existing ? 'No domains in the config: the salon keeps its current domains' : 'No domains in the config: the salon has no web address yet');
  } else if (!cloudflare) {
    warn('Cloudflare step skipped: CLOUDFLARE_API_TOKEN is not set (domains not attached to the Pages project)');
  } else {
    ({ todo, failed: cfFailed } = await attachDomains(cloudflare, domains));
  }

  // 7. summary
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(supabaseUrl);
  const sites = local ? [`http://localhost:5173/?salon=${config.id}`] : domains.map((d) => `https://${d}`);
  console.log('\nSummary');
  for (const s of sites) info(`Site:   ${s}`);
  if (sites.length) info(`Admin:  ${sites[0].replace(/\/?(\?.*)?$/, '/admin$1')}`);
  info(`Owner:  ${config.owner.email}`);
  if (owner.password) info(`Password (shown once, give it to the owner): ${owner.password}`);
  const left = [
    ...(domains.length ? [] : ['Buy the domain (Cloudflare Registrar), add it to "domains" and re-run (the owner\'s settings are kept)']),
    ...(domains.length && !cloudflare ? ['Buy the domain if not done, set the Cloudflare variables in .env.admin and re-run to attach it'] : []),
    ...todo,
    ...(cfFailed ? ['Fix the Cloudflare errors above and re-run'] : []),
  ];
  if (left.length) {
    console.log('\nLeft to do by hand');
    for (const l of left) info(`- ${l}`);
  }
  if (cfFailed) process.exitCode = 1;
}

main().catch((e) => {
  if (!(e instanceof StepFailed)) console.error(`✗ ${(e as Error).stack ?? e}`);
  process.exitCode = 1;
});
