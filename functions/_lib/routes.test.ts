// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** public/_routes.json: which requests run the edge functions (copied to dist/ by the build). */
const routes = JSON.parse(readFileSync(new URL('../../public/_routes.json', import.meta.url), 'utf8')) as {
  version: number;
  include: string[];
  exclude: string[];
};

describe('_routes.json', () => {
  it('skips the functions for static files that carry no salon branding', () => {
    expect(routes).toEqual({ version: 1, include: ['/*'], exclude: ['/assets/*', '/icons/*', '/sw.js'] });
  });

  it('still routes pages and the per-salon app manifest to the functions', () => {
    for (const path of ['/manifest.webmanifest', '/', '/admin', '/index.html']) {
      expect(routes.exclude.some((e) => (e.endsWith('/*') ? path.startsWith(e.slice(0, -1)) : path === e))).toBe(false);
    }
  });
});
