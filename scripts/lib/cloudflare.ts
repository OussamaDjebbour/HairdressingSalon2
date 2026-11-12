/**
 * The few Cloudflare API calls `pnpm new-salon` needs to put a salon's domain on the Pages
 * project that serves every salon. Each call is safe to repeat.
 * Token permissions: Account → Cloudflare Pages: Edit; Zone → Zone: Read and DNS: Edit.
 */
const API = 'https://api.cloudflare.com/client/v4';

export interface Cloudflare {
  accountId: string;
  apiToken: string;
  /** The Pages project name; the site is <project>.pages.dev. */
  project: string;
  fetch?: typeof fetch;
}

export class CloudflareError extends Error {
  constructor(
    message: string,
    readonly codes: number[] = [],
  ) {
    super(message);
    this.name = 'CloudflareError';
  }
}

type Envelope<T> = { success: boolean; errors?: Array<{ code: number; message: string }>; result: T };

async function call<T>(cf: Cloudflare, path: string, init?: { method: string; body: unknown }): Promise<T> {
  const res = await (cf.fetch ?? fetch)(`${API}${path}`, {
    method: init?.method ?? 'GET',
    headers: { Authorization: `Bearer ${cf.apiToken}`, 'Content-Type': 'application/json' },
    ...(init && { body: JSON.stringify(init.body) }),
  });
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    // not JSON: reported below with the HTTP status
  }
  if (!res.ok || !body?.success) {
    const errors = body?.errors ?? [];
    const detail = errors.map((e) => `${e.message} (${e.code})`).join('; ') || `HTTP ${res.status}`;
    throw new CloudflareError(`Cloudflare ${init?.method ?? 'GET'} ${path}: ${detail}`, errors.map((e) => e.code));
  }
  return body.result;
}

/** The Pages site every salon domain points to. */
export const pagesTarget = (cf: Pick<Cloudflare, 'project'>) => `${cf.project}.pages.dev`;

/**
 * Public suffixes of two labels a salon's domain may use (not the full Public Suffix List: the
 * common ones in Algeria and the .co.uk style). Any other suffix is taken to be one label.
 */
const TWO_LABEL_SUFFIXES = new Set([
  'com.dz', 'org.dz', 'net.dz', 'edu.dz', 'gov.dz', 'asso.dz',
  'co.uk', 'org.uk', 'me.uk',
  'com.tn',
]);

/** A registered (bare) domain such as `sara-salon.com` or `sara.com.dz`, not a subdomain of one. */
export function isRegisteredDomain(host: string): boolean {
  const labels = host.split('.');
  const suffixLabels = labels.length >= 2 && TWO_LABEL_SUFFIXES.has(labels.slice(-2).join('.')) ? 2 : 1;
  return labels.length === suffixLabels + 1;
}

/**
 * The host names to attach for a salon domain (stored without `www.`): a registered domain gets
 * both itself and `www.`; a subdomain (`rdv.sara-salon.com`) only itself.
 */
export function pagesHostnames(domain: string): string[] {
  return isRegisteredDomain(domain) ? [domain, `www.${domain}`] : [domain];
}

const ALREADY_ADDED = 8000018;

/** Adds a custom domain to the Pages project; an already attached domain counts as success. */
export async function addDomain(cf: Cloudflare, hostname: string): Promise<'added' | 'exists'> {
  try {
    await call(cf, `/accounts/${cf.accountId}/pages/projects/${cf.project}/domains`, {
      method: 'POST',
      body: { name: hostname },
    });
    return 'added';
  } catch (e) {
    if (e instanceof CloudflareError && (e.codes.includes(ALREADY_ADDED) || /already (been )?added|already exists/i.test(e.message))) {
      return 'exists';
    }
    throw e;
  }
}

/** The zone of this account a host name belongs to (trying parent domains), or null. */
export async function findZone(cf: Cloudflare, hostname: string): Promise<{ id: string; name: string } | null> {
  const labels = hostname.split('.');
  for (let i = 0; i <= labels.length - 2; i++) {
    const name = labels.slice(i).join('.');
    const zones = await call<Array<{ id: string; name: string }>>(
      cf,
      `/zones?name=${encodeURIComponent(name)}&account.id=${encodeURIComponent(cf.accountId)}`,
    );
    if (zones.length) return { id: zones[0].id, name: zones[0].name };
  }
  return null;
}

export type CnameResult = { status: 'created' } | { status: 'exists' } | { status: 'conflict'; existing: string };

/**
 * Makes `hostname` (in zone `zoneId`) a proxied CNAME to the Pages site. Never touches an
 * existing record: one already pointing to the site is fine, anything else is a conflict to fix by hand.
 */
export async function ensureCname(cf: Cloudflare, zoneId: string, hostname: string): Promise<CnameResult> {
  const target = pagesTarget(cf);
  const records = await call<Array<{ type: string; name: string; content: string }>>(
    cf,
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`,
  );
  if (records.length) {
    const cname = records.find((r) => r.type === 'CNAME' && r.content.replace(/\.$/, '').toLowerCase() === target);
    if (cname) return { status: 'exists' };
    return { status: 'conflict', existing: records.map((r) => `${r.type} ${r.content}`).join(', ') };
  }
  await call(cf, `/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: { type: 'CNAME', name: hostname, content: target, proxied: true, ttl: 1 },
  });
  return { status: 'created' };
}
