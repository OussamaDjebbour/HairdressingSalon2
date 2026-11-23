import { describe, expect, it } from 'vitest';
import { addressLine, isAppleMobile, mapsLink } from './clientLinks';

describe('mapsLink', () => {
  it('mapsLink joins address lines and city', () => {
    expect(mapsLink('12 Rue Didouche Mourad\nAlger Centre 16000', 'Alger')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('12 Rue Didouche Mourad, Alger Centre 16000, Alger')
    );
  });
  it('mapsLink is null without an address, even with a city', () => {
    expect(mapsLink('  ', '')).toBeNull();
    expect(mapsLink('', 'Alger')).toBeNull();
  });
});

describe('addressLine', () => {
  it('puts address lines and city on one line', () => {
    expect(addressLine('12 Rue Didouche Mourad\nAlger Centre 16000\n', ' Alger ')).toBe('12 Rue Didouche Mourad, Alger Centre 16000, Alger');
  });
});

describe('isAppleMobile', () => {
  const nav = (userAgent: string, platform = '', maxTouchPoints = 0) => ({ userAgent, platform, maxTouchPoints });
  it('recognises an iPhone and an iPad (which reports itself as a touch Mac)', () => {
    expect(isAppleMobile(nav('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'))).toBe(true);
    expect(isAppleMobile(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5))).toBe(true);
  });
  it('leaves Android, desktop Macs and PCs to Google Calendar', () => {
    expect(isAppleMobile(nav('Mozilla/5.0 (Linux; Android 14; SM-A146B)', 'Linux armv8l', 5))).toBe(false);
    expect(isAppleMobile(nav('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0))).toBe(false);
    expect(isAppleMobile(nav('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0))).toBe(false);
  });
});
