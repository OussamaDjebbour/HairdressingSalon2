import { describe, it, expect } from 'vitest';
import { formatAgo, formatClaim, formatNumber, formatPrice } from './formatters';

const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

describe('formatPrice', () => {
  it('formats French prices with fr-FR grouping and a DA suffix', () => {
    expect(formatPrice(2500, 'fr')).toBe('2 500 DA');
  });

  it('isolates Arabic prices as one left-to-right run so RTL text shows "2 500 DA", not "DA 500 2"', () => {
    expect(formatPrice(2500, 'ar')).toBe(`${LRI}2 500 DA${PDI}`);
  });

  it('defaults to French', () => {
    expect(formatPrice(800)).toBe('800 DA');
  });
});

describe('formatClaim / formatNumber', () => {
  it('shows claims with French digits in both languages (Élégance AR as before)', () => {
    expect(formatClaim(15)).toBe('15');
    expect(formatClaim(2500)).toBe('2 500');
    expect(formatClaim(4.9)).toBe('4,9');
  });

  it('shows counts in the language\'s own digits', () => {
    expect(formatNumber(240, 'fr')).toBe('240');
    expect(formatNumber(240, 'ar')).toBe('٢٤٠');
  });
});

describe('formatAgo', () => {
  const now = new Date('2030-01-08T12:00:00Z');
  it('counts minutes, hours, then days', () => {
    expect(formatAgo(new Date('2030-01-08T11:55:00Z'), now, 'fr')).toBe('il y a 5 min');
    expect(formatAgo(new Date('2030-01-08T09:00:00Z'), now, 'fr')).toBe('il y a 3 h');
    expect(formatAgo(new Date('2030-01-06T12:00:00Z'), now, 'fr')).toBe('il y a 2 j');
  });
  it('has an Arabic form', () => {
    expect(formatAgo(new Date('2030-01-08T09:00:00Z'), now, 'ar')).toContain('3');
  });
});
