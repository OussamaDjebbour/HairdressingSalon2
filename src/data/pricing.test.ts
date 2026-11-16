import { describe, it, expect } from 'vitest';
import { effectivePrice } from './pricing';

const s = { price: 3000, promo: { price: 2000, from: '2030-01-10', to: '2030-01-20' } };

describe('effectivePrice', () => {
  it('uses the promo price inside the window', () => {
    expect(effectivePrice(s, '2030-01-15')).toEqual({ price: 2000, regular: 3000 });
  });
  it('includes the first and last day', () => {
    expect(effectivePrice(s, '2030-01-10').price).toBe(2000);
    expect(effectivePrice(s, '2030-01-20').price).toBe(2000);
  });
  it('uses the regular price outside the window', () => {
    expect(effectivePrice(s, '2030-01-09')).toEqual({ price: 3000, regular: null });
    expect(effectivePrice(s, '2030-01-21')).toEqual({ price: 3000, regular: null });
  });
  it('has no promo', () => {
    expect(effectivePrice({ price: 3000, promo: null }, '2030-01-15')).toEqual({ price: 3000, regular: null });
  });
  it('defaults today to the Algiers date', () => {
    expect(effectivePrice({ price: 1, promo: { price: 0, from: '2000-01-01', to: '2999-12-31' } }).regular).toBe(1);
  });
});
