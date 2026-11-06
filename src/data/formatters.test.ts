import { describe, it, expect } from 'vitest';
import { formatPrice } from './formatters';

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
