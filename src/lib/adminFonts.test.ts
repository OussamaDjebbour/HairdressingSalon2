import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ADMIN_FONTS_URL, loadAdminFonts } from './adminFonts';

const indexHtml = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

afterEach(() => {
  document.head.querySelectorAll('link[data-admin-fonts]').forEach((l) => l.remove());
});

describe('admin fonts', () => {
  it('are added to the head once', () => {
    loadAdminFonts();
    loadAdminFonts();
    const links = document.head.querySelectorAll('link[data-admin-fonts]');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('rel', 'stylesheet');
    expect(links[0]).toHaveAttribute('href', ADMIN_FONTS_URL);
  });

  it("are not in index.html, which links only the client page's fonts (Cairo included, for Arabic)", () => {
    expect(indexHtml).not.toMatch(/family=(Inter|Fraunces)/);
    for (const family of ['Bodoni+Moda', 'Jost', 'Amiri', 'Cairo']) expect(indexHtml).toContain(`family=${family}`);
  });
});
