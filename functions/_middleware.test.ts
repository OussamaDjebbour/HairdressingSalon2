// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './_middleware';
import { lookupSalon } from './_lib/lookup';

vi.mock('./_lib/lookup', () => ({ lookupSalon: vi.fn() }));
const lookup = vi.mocked(lookupSalon);

const ENV = { SUPABASE_URL: 'https://db.example.co', SUPABASE_PUBLISHABLE_KEY: 'k' };
const SARA = {
  id: 'sara',
  name: 'Sara Beauté',
  palette: {
    '50': '#FBF1F3', '100': '#F7E0E5', '200': '#EFC1CC', '300': '#E29FB1', '400': '#D17D93',
    '500': '#B85F76', '600': '#9D4B5F', '700': '#7E3B4C', '800': '#5F2D3A', '900': '#102440',
  },
};

/**
 * Stand-in for the Workers HTMLRewriter (not available in Node): records the handlers, and
 * `edits()` replays them on fake elements to list what the rewrite does to the page.
 */
let rewriters: FakeRewriter[] = [];
class FakeRewriter {
  handlers: [string, { element(el: unknown): void }][] = [];
  constructor() {
    rewriters.push(this);
  }
  on(selector: string, handler: { element(el: unknown): void }) {
    this.handlers.push([selector, handler]);
    return this;
  }
  transform(res: Response) {
    return new Response('rewritten', res);
  }
  edits() {
    const out: unknown[] = [];
    for (const [selector, handler] of this.handlers) {
      handler.element({
        setInnerContent: (c: string, o?: object) => out.push([selector, 'setInnerContent', c, o]),
        setAttribute: (n: string, v: string) => out.push([selector, 'setAttribute', n, v]),
        append: (c: string, o?: object) => out.push([selector, 'append', c, o]),
      });
    }
    return out;
  }
}

function html(headers: Record<string, string> = {}) {
  return new Response('<html></html>', {
    headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"abc"', 'Last-Modified': 'x', ...headers },
  });
}

function run(url: string, response: Response) {
  const next = vi.fn(async () => response);
  const context = { request: new Request(url), env: ENV, next };
  return { next, result: onRequest(context as unknown as Parameters<typeof onRequest>[0]) };
}

beforeEach(() => {
  rewriters = [];
  lookup.mockReset();
  vi.stubGlobal('HTMLRewriter', FakeRewriter);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('edge middleware', () => {
  it("writes the salon's title, theme colour and colours into the page head", async () => {
    lookup.mockResolvedValue(SARA);

    const res = await run('https://www.Sara-Salon.com/admin/settings/hours', html()).result;

    expect(lookup).toHaveBeenCalledWith('sara-salon.com', ENV);
    expect(await res.text()).toBe('rewritten');
    expect(rewriters).toHaveLength(1);
    expect(rewriters[0].edits()).toEqual([
      ['title', 'setInnerContent', 'Sara Beauté — Salon de beauté', { html: false }],
      ['meta[name="theme-color"]', 'setAttribute', 'content', '#102440'],
      ['meta[name="apple-mobile-web-app-title"]', 'setAttribute', 'content', 'Sara Beauté'],
      ['head', 'append', expect.stringMatching(/^<style>:root\{--brand-50:251 241 243;.*--brand-900:16 36 64\}<\/style>$/), { html: true }],
    ]);
  });

  it('drops the static file validators so a cached page never keeps old branding', async () => {
    lookup.mockResolvedValue(SARA);
    const res = await run('https://sara-salon.com/', html()).result;
    expect(res.headers.get('ETag')).toBeNull();
    expect(res.headers.get('Last-Modified')).toBeNull();
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('leaves non-HTML responses alone without a lookup', async () => {
    const js = new Response('x', { headers: { 'Content-Type': 'application/javascript' } });
    const res = await run('https://sara-salon.com/assets/index.js', js).result;
    expect(res).toBe(js);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('passes the page through unchanged for an unknown host', async () => {
    lookup.mockResolvedValue(null);
    const page = html();
    expect(await run('https://nobody.com/', page).result).toBe(page);
    expect(rewriters).toHaveLength(0);
  });

  it('passes the page through unchanged when the lookup fails', async () => {
    lookup.mockRejectedValue(new Error('db down'));
    const page = html();
    expect(await run('https://sara-salon.com/', page).result).toBe(page);
  });
});
