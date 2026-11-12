/**
 * pnpm new-salon <slug> [--dry-run] [--yes]
 *
 * Launches (or updates) the salon described by salons/<slug>.json: validates the config, makes
 * its colour palette, uploads its photos, creates the owner's login, provisions the salon in the
 * database and attaches its domains in Cloudflare. Safe to re-run: every step is idempotent.
 * Secrets come from the git-ignored .env.admin (see .env.admin.example). See salons/README.md.
 *
 *   --dry-run  validate and print the provision payload; writes nothing
 *   --yes      re-run on an existing salon without asking (its listed values are re-applied)
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generatePalette } from '../src/lib/palette';
import { addDomain, ensureCname, findZone, pagesHostnames, pagesTarget, type Cloudflare } from './lib/cloudflare';
import { ConfigError, parseSalonConfig, type SalonConfig } from './lib/config';
import { buildProvisionPayload, localPhotos, storagePath } from './lib/provision';

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

/** What provision_salon's error codes mean for the person running the script. */
const PROVISION_ERRORS: Record<string, string> = {
  invalid_id: 'the salon id is invalid',
  invalid_name: 'a name, address or city is too short or too long',
  invalid_palette: 'the palette is invalid',
  invalid_domain: 'a domain name is invalid',
  invalid_hours: 'the opening hours are invalid',
  invalid_phone: 'the WhatsApp number is not an Algerian mobile number',
  invalid_url: 'the Instagram/Facebook link must start with https://',
  invalid_service: 'a service is invalid (id, category, name, price or duration)',
  invalid_stylist: 'a stylist is invalid (id, name or workdays)',
  unknown_service: "a stylist offers a service that is not this salon's",
  domain_taken: 'a domain already belongs to another salon',
  id_taken: 'a service or stylist id is already used by another salon (ids are shared by all salons: prefix them with the salon id)',
  staff_taken: "the owner's email is already the login of another salon's staff",
};

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

function parseArgs(argv: string[]) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const unknown = [...flags].filter((f) => f !== '--dry-run' && f !== '--yes');
  const [slug, ...rest] = argv.filter((a) => !a.startsWith('--'));
  if (!slug || rest.length || unknown.length || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error('Usage: pnpm new-salon <slug> [--dry-run] [--yes]   (reads salons/<slug>.json)');
    process.exit(2);
  }
  return { slug, dryRun: flags.has('--dry-run'), yes: flags.has('--yes') };
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

async function confirmRerun(slug: string, config: SalonConfig, yes: boolean) {
  warn(
    `Salon "${config.id}" already exists. Re-running re-applies every value salons/${slug}.json lists ` +
      '(hours, address, WhatsApp, services and prices, stylists and their days, …) over the owner\'s own edits in Réglages. ' +
      'Values the file leaves out are kept.',
  );
  if (yes) return;
  if (!process.stdin.isTTY) fail('Not re-applying without confirmation: run again with --yes');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Continue? [y/N] ');
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) fail('Stopped: nothing was changed');
}

async function uploadPhotos(supabase: SupabaseClient, slug: string, config: SalonConfig) {
  const urls: Record<string, string> = {};
  for (const ref of localPhotos(config)) {
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
  ok(`Owner login ${email} created`);
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
            (host.split('.').length === 2 ? '  (a bare domain needs CNAME flattening/ALIAS, or move its nameservers to Cloudflare)' : ''));
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

async function main() {
  const { slug, dryRun, yes } = parseArgs(process.argv.slice(2));

  // 1. environment and config
  loadEnv(!dryRun);
  const config = loadConfig(slug);

  // 2. palette
  const { palette, warnings } = generatePalette(config.color);
  ok(`Palette from ${config.color.toUpperCase()}: ${Object.values(palette).join(' ')}`);
  for (const w of warnings) warn(w);

  if (dryRun) {
    const base = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
    const urls = Object.fromEntries(localPhotos(config).map((ref) => [ref,
      base ? `${base}/storage/v1/object/public/${BUCKET}/${storagePath(config.id, ref)}` : `<upload of ${ref}>`]));
    console.log(JSON.stringify(buildProvisionPayload(config, palette, urls), null, 2));
    ok('Dry run: the payload above is valid (owner_user_id is added once the login exists); nothing was written');
    return;
  }

  const supabaseUrl = env('SUPABASE_URL');
  const supabase = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    // Realtime is never used here; Node 20 has no global WebSocket for it to find.
    realtime: { transport: NoRealtime as never },
  });
  const { data: existing, error: existsError } = await supabase.from('salons').select('id').eq('id', config.id).maybeSingle();
  if (existsError) fail(`Reading salons failed: ${existsError.message}`);
  if (existing) await confirmRerun(slug, config, yes);

  // 3. photos
  const photoUrls = await uploadPhotos(supabase, slug, config);

  // 4. owner login
  const owner = await ensureOwner(supabase, config.owner.email);

  // 5. salon
  const payload = buildProvisionPayload(config, palette, photoUrls, owner.id);
  const { error } = await supabase.rpc('provision_salon', { p: payload });
  if (error) {
    const code = error.message.trim();
    fail(`provision_salon: ${PROVISION_ERRORS[code] ? `${PROVISION_ERRORS[code]} (${code})` : error.message}`);
  }
  ok(`Salon "${config.id}" ${existing ? 'updated' : 'created'} (${payload.domains.length} domains, ${payload.services.length} services, ${payload.stylists.length} stylists)`);

  // 6. domains
  let todo: string[] = [];
  let cfFailed = false;
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!payload.domains.length) {
    warn('No domains in the config: the salon has no web address yet');
  } else if (!token) {
    warn('Cloudflare step skipped: CLOUDFLARE_API_TOKEN is not set (domains not attached to the Pages project)');
  } else {
    ({ todo, failed: cfFailed } = await attachDomains(
      { accountId: env('CLOUDFLARE_ACCOUNT_ID'), apiToken: token, project: env('CLOUDFLARE_PAGES_PROJECT') },
      payload.domains,
    ));
  }

  // 7. summary
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(supabaseUrl);
  const sites = local ? [`http://localhost:5173/?salon=${config.id}`] : payload.domains.map((d) => `https://${d}`);
  console.log('\nSummary');
  for (const s of sites) info(`Site:   ${s}`);
  if (sites.length) info(`Admin:  ${sites[0].replace(/\/?(\?.*)?$/, '/admin$1')}`);
  info(`Owner:  ${config.owner.email}`);
  if (owner.password) info(`Password (shown once, give it to the owner): ${owner.password}`);
  const left = [
    ...(payload.domains.length ? [] : ['Buy the domain (Cloudflare Registrar), add it to "domains" and re-run']),
    ...(payload.domains.length && !token ? ['Buy the domain if not done, set the Cloudflare variables in .env.admin and re-run to attach it'] : []),
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
