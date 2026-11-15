import { describe, it, expect, vi, afterEach } from 'vitest';
import { photoUrl } from './photoUrl';

describe('photoUrl', () => {
  it('returns an empty string for no photo', () => {
    expect(photoUrl('', 'https://x.supabase.co')).toBe('');
  });

  it('keeps an absolute URL unchanged', () => {
    expect(photoUrl('https://images.pexels.com/a.jpg', 'https://x.supabase.co')).toBe('https://images.pexels.com/a.jpg');
  });

  it('turns a stored path into a public storage URL', () => {
    expect(photoUrl('elegance/uploads/abc.jpg', 'https://x.supabase.co/')).toBe(
      'https://x.supabase.co/storage/v1/object/public/salon-photos/elegance/uploads/abc.jpg',
    );
  });

  it('treats the http/https prefix case-insensitively', () => {
    expect(photoUrl('HTTPS://images.pexels.com/a.jpg', 'https://x.supabase.co')).toBe('HTTPS://images.pexels.com/a.jpg');
  });

  it('never throws when the base URL is missing', () => {
    expect(() => photoUrl('elegance/uploads/abc.jpg', undefined as unknown as string)).not.toThrow();
    expect(() => photoUrl('elegance/uploads/abc.jpg', null as unknown as string)).not.toThrow();
  });

  describe('with VITE_SUPABASE_URL unset', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('does not throw when called without a base', () => {
      vi.stubEnv('VITE_SUPABASE_URL', undefined as unknown as string);
      expect(() => photoUrl('elegance/uploads/abc.jpg')).not.toThrow();
    });
  });
});
