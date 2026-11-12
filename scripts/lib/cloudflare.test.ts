// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { addDomain, CloudflareError, ensureCname, findZone, isRegisteredDomain, pagesHostnames, type Cloudflare } from './cloudflare';

function api(...responses: Array<{ status?: number; body: unknown }>) {
  const fetch = vi.fn();
  for (const r of responses) {
    fetch.mockResolvedValueOnce(new Response(JSON.stringify(r.body), { status: r.status ?? 200 }));
  }
  const cf: Cloudflare = { accountId: 'acc1', apiToken: 'tok', project: 'salons', fetch };
  return { cf, fetch };
}
const ok = (result: unknown) => ({ body: { success: true, errors: [], messages: [], result } });
const fail = (status: number, code: number, message: string) => ({
  status,
  body: { success: false, errors: [{ code, message }], messages: [], result: null },
});

describe('addDomain', () => {
  it('POSTs the domain to the Pages project with the token', async () => {
    const { cf, fetch } = api(ok({ name: 'sara-salon.com', status: 'initializing' }));
    await expect(addDomain(cf, 'sara-salon.com')).resolves.toBe('added');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.cloudflare.com/client/v4/accounts/acc1/pages/projects/salons/domains');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ name: 'sara-salon.com' });
  });

  it('treats "already added" as success', async () => {
    const { cf } = api(fail(400, 8000018, 'You have already added this custom domain.'));
    await expect(addDomain(cf, 'sara-salon.com')).resolves.toBe('exists');
  });

  it('throws other API errors with their message', async () => {
    const { cf } = api(fail(403, 10000, 'Authentication error'));
    await expect(addDomain(cf, 'sara-salon.com')).rejects.toThrow(CloudflareError);
    const { cf: cf2 } = api(fail(403, 10000, 'Authentication error'));
    await expect(addDomain(cf2, 'sara-salon.com')).rejects.toThrow(/Authentication error/);
  });
});

describe('findZone', () => {
  it('finds the account zone a host belongs to, trying parent domains', async () => {
    const { cf, fetch } = api(ok([]), ok([{ id: 'z1', name: 'sara-salon.com' }]));
    await expect(findZone(cf, 'rdv.sara-salon.com')).resolves.toEqual({ id: 'z1', name: 'sara-salon.com' });
    expect(fetch.mock.calls[0][0]).toBe('https://api.cloudflare.com/client/v4/zones?name=rdv.sara-salon.com&account.id=acc1');
    expect(fetch.mock.calls[1][0]).toBe('https://api.cloudflare.com/client/v4/zones?name=sara-salon.com&account.id=acc1');
  });

  it('returns null when the domain is not in the account', async () => {
    const { cf, fetch } = api(ok([]));
    await expect(findZone(cf, 'sara-salon.com')).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('ensureCname', () => {
  it('creates a proxied CNAME to the Pages site when the name has no record', async () => {
    const { cf, fetch } = api(ok([]), ok({ id: 'r1' }));
    await expect(ensureCname(cf, 'z1', 'www.sara-salon.com')).resolves.toEqual({ status: 'created' });
    expect(fetch.mock.calls[0][0]).toBe('https://api.cloudflare.com/client/v4/zones/z1/dns_records?name=www.sara-salon.com');
    const [url, init] = fetch.mock.calls[1];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/z1/dns_records');
    expect(JSON.parse(init.body)).toEqual({
      type: 'CNAME', name: 'www.sara-salon.com', content: 'salons.pages.dev', proxied: true, ttl: 1,
    });
  });

  it('keeps an existing CNAME to the Pages site', async () => {
    const { cf, fetch } = api(ok([{ type: 'CNAME', name: 'sara-salon.com', content: 'salons.pages.dev' }]));
    await expect(ensureCname(cf, 'z1', 'sara-salon.com')).resolves.toEqual({ status: 'exists' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never overwrites another record, and says what is there', async () => {
    const { cf, fetch } = api(ok([{ type: 'A', name: 'sara-salon.com', content: '192.0.2.1' }]));
    await expect(ensureCname(cf, 'z1', 'sara-salon.com')).resolves.toEqual({ status: 'conflict', existing: 'A 192.0.2.1' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('pagesHostnames', () => {
  it('attaches the bare domain and www. for a registered domain, only itself for a subdomain', () => {
    expect(pagesHostnames('sara-salon.com')).toEqual(['sara-salon.com', 'www.sara-salon.com']);
    expect(pagesHostnames('rdv.sara-salon.com')).toEqual(['rdv.sara-salon.com']);
  });

  it('knows two-label public suffixes (Algeria, .co.uk-style)', () => {
    for (const domain of ['sara.com.dz', 'sara.org.dz', 'sara.net.dz', 'sara.edu.dz', 'sara.gov.dz', 'sara.asso.dz', 'sara.co.uk', 'sara.com.tn']) {
      expect(pagesHostnames(domain)).toEqual([domain, `www.${domain}`]);
    }
    expect(pagesHostnames('rdv.sara.com.dz')).toEqual(['rdv.sara.com.dz']);
    expect(pagesHostnames('rdv.sara.co.uk')).toEqual(['rdv.sara.co.uk']);
  });
});

describe('isRegisteredDomain', () => {
  it('is true for a bare domain (needs CNAME flattening at another DNS provider), false for a subdomain', () => {
    expect(isRegisteredDomain('sara-salon.com')).toBe(true);
    expect(isRegisteredDomain('www.sara-salon.com')).toBe(false);
    expect(isRegisteredDomain('sara.com.dz')).toBe(true);
    expect(isRegisteredDomain('www.sara.com.dz')).toBe(false);
    expect(isRegisteredDomain('sara.dz')).toBe(true);
    expect(isRegisteredDomain('com.dz')).toBe(false);
  });
});
