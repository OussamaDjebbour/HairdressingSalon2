import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import indexHtml from '../../index.html?raw';
import { useAdminManifest } from './manifest';

function Admin() {
  useAdminManifest();
  return null;
}

describe('admin web app manifest', () => {
  it('is not linked from the public pages', () => {
    expect(indexHtml).not.toContain('rel="manifest"');
  });

  it('is linked only while the admin is mounted', () => {
    const { unmount } = render(<Admin />);
    expect(document.head.querySelector('link[rel="manifest"]')?.getAttribute('href')).toBe('/manifest.webmanifest');
    unmount();
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
  });
});
