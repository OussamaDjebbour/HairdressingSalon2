import { describe, expect, it } from 'vitest';
import { addressLine, mapsLink, visitIcs } from './clientLinks';

describe('mapsLink', () => {
  it('mapsLink joins address lines and city', () => {
    expect(mapsLink('12 Rue Didouche Mourad\nAlger Centre 16000', 'Alger')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('12 Rue Didouche Mourad, Alger Centre 16000, Alger')
    );
  });
  it('mapsLink is null without address and city', () => {
    expect(mapsLink('  ', '')).toBeNull();
  });
});

describe('addressLine', () => {
  it('puts address lines and city on one line', () => {
    expect(addressLine('12 Rue Didouche Mourad\nAlger Centre 16000\n', ' Alger ')).toBe('12 Rue Didouche Mourad, Alger Centre 16000, Alger');
  });
});

describe('visitIcs', () => {
  it('visitIcs has one VEVENT with UTC times, escaped text and CRLF lines', () => {
    const ics = visitIcs({
      salon: 'Élégance',
      services: 'Coupe & Brushing + Manucure',
      start: new Date('2030-01-08T09:00:00Z'),
      end: new Date('2030-01-08T10:45:00Z'),
      location: '12 Rue Didouche, Alger',
      description: 'En attente; à confirmer',
      uid: 'abc',
    });
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines).toContain('DTSTART:20300108T090000Z');
    expect(lines).toContain('DTEND:20300108T104500Z');
    expect(lines).toContain('SUMMARY:Élégance — Coupe & Brushing + Manucure');
    expect(lines).toContain('LOCATION:12 Rue Didouche\\, Alger');
    expect(lines).toContain('DESCRIPTION:En attente\\; à confirmer');
    expect(lines).toContain('UID:abc');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });
});
