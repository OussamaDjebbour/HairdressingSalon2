import { describe, it, expect } from 'vitest';
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
});
