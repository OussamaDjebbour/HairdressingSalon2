import { describe, it, expect } from 'vitest';
import type { Service } from './types';
import type { VisitSlot } from './bookings';
import { MAX_VISIT_SERVICES, joinNames, missingAllDay, planVisit, slotState, visitOrder, visitTotals } from './visit';

function svc(id: string, sortOrder: number, fr = id, price = 1000, duration = 60): Service {
  return {
    id, category: 'c', name: { fr, ar: fr }, description: { fr: '', ar: '' },
    price, duration, image: '', icon: '', active: true, sortOrder, includes: [], packStylistId: null, promo: null,
  };
}
const sl = (slot: string, available: boolean, missing: number[]): VisitSlot => ({ slot, available, missing });

describe('visit helpers', () => {
  it('caps a visit at 4 services', () => expect(MAX_VISIT_SERVICES).toBe(4));

  it("visitOrder sorts by the salon's order, not the tick order", () => {
    const out = visitOrder([svc('manucure', 3), svc('coupe-femme', 0), svc('coloration', 1)]);
    expect(out.map((s) => s.id)).toEqual(['coupe-femme', 'coloration', 'manucure']);
  });

  it('visitOrder breaks ties on the French name, then id', () => {
    const out = visitOrder([svc('b', 1, 'Zèbre'), svc('a', 1, 'Abricot'), svc('c', 1, 'Abricot')]);
    expect(out.map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });

  it('planVisit places parts back to back', () => {
    expect(planVisit([svc('a', 0, 'a', 1, 60), svc('b', 1, 'b', 1, 120)], '10:00').map((p) => p.time)).toEqual(['10:00', '11:00']);
    expect(planVisit([svc('a', 0, 'a', 1, 45), svc('b', 1, 'b', 1, 60)], '09:30').map((p) => p.time)).toEqual(['09:30', '10:15']);
  });

  it('visitTotals uses promo prices', () => {
    const promo = { price: 2000, from: '2030-01-01', to: '2030-01-31' };
    expect(visitTotals([{ price: 2500, duration: 60, promo }, { price: 1000, duration: 30, promo: null }], '2030-01-15'))
      .toEqual({ price: 3000, duration: 90 });
    expect(visitTotals([{ price: 2500, duration: 60, promo }], '2030-02-01').price).toBe(2500);
  });

  it('visitTotals sums price and duration', () => {
    expect(visitTotals([{ price: 2500, duration: 60, promo: null }, { price: 6000, duration: 120, promo: null }])).toEqual({ price: 8500, duration: 180 });
  });

  it('slotState', () => {
    expect(slotState(sl('09:00', true, []), 2)).toBe('available');
    expect(slotState(sl('09:00', false, [1]), 2)).toBe('partial');
    expect(slotState(sl('09:00', false, [0, 1]), 2)).toBe('full');
    expect(slotState(sl('09:00', false, [0]), 1)).toBe('full');
    expect(slotState(sl('09:00', false, []), 2)).toBe('full');
  });

  it('missingAllDay ignores slots where everything is missing', () => {
    expect(missingAllDay([sl('09:00', false, [0, 1]), sl('10:00', false, [0, 1]), sl('14:00', false, [1]), sl('15:00', false, [1])], 2)).toEqual([1]);
    expect(missingAllDay([sl('09:00', false, [0, 1]), sl('10:00', false, [0, 1])], 2)).toEqual([]);
    expect(missingAllDay([sl('09:00', true, []), sl('10:00', false, [1])], 2)).toEqual([]);
    expect(missingAllDay([sl('09:00', false, [0]), sl('10:00', false, [0])], 1)).toEqual([]);
    expect(missingAllDay([sl('09:00', false, [0]), sl('10:00', false, [1])], 2)).toEqual([]);
  });

  it('joinNames joins with +', () => expect(joinNames(['a', 'b', 'c'])).toBe('a + b + c'));
});
