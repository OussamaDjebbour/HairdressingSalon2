// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkPublicBundle } from './check-public-bundle-lib.mjs';

const KB = 1024;
const manifest = {
  'index.html': { file: 'assets/index-a.js', isEntry: true, imports: ['_vendor.js'] as string[], dynamicImports: ['src/pages/AdminPage.tsx'] },
  '_vendor.js': { file: 'assets/vendor-b.js' },
  'src/pages/AdminPage.tsx': { file: 'assets/AdminPage-c.js', imports: ['_admin-ui.js'] },
  '_admin-ui.js': { file: 'assets/admin-ui-d.js' },
};
const sizes = { 'assets/index-a.js': 100 * KB, 'assets/vendor-b.js': 50 * KB, 'assets/AdminPage-c.js': 900 * KB, 'assets/admin-ui-d.js': 900 * KB };

describe('checkPublicBundle', () => {
  it('passes when admin-ui is only dynamically reachable', () => {
    const r = checkPublicBundle(manifest, sizes, 150);
    expect(r.ok).toBe(true);
    expect(r.entryKB).toBe(150);
  });
  it('fails when the entry statically imports admin-ui', () => {
    const m = { ...manifest, 'index.html': { ...manifest['index.html'], imports: ['_vendor.js', '_admin-ui.js'] } };
    const r = checkPublicBundle(m, sizes, 1e6);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toContain('admin-ui');
  });
  it('fails 31 KB over the baseline, passes 29 KB over', () => {
    expect(checkPublicBundle(manifest, sizes, 150 - 31).ok).toBe(false);
    expect(checkPublicBundle(manifest, sizes, 150 - 29).ok).toBe(true);
  });
});
