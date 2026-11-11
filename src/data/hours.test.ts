import { describe, it, expect } from 'vitest';
import { dayHours, groupHours, isoWeekday, stylistWorks } from './hours';
import type { SalonHours, Stylist, StylistDayOff } from './types';

const OPEN = { opens: 540, closes: 1080 };
const ELEGANCE: SalonHours = { 1: null, 2: OPEN, 3: OPEN, 4: OPEN, 5: OPEN, 6: OPEN, 7: null };

const stylist: Stylist = {
  id: 'amina', name: 'Amina', role: { fr: '', ar: '' }, specialties: [], image: '', serviceIds: [],
  active: true, workdays: [2, 3, 4],
};

describe('isoWeekday', () => {
  it('maps Sunday to 7 and Monday to 1', () => {
    expect(isoWeekday(new Date(2030, 0, 6))).toBe(7);
    expect(isoWeekday(new Date(2030, 0, 7))).toBe(1);
    expect(isoWeekday(new Date(2030, 0, 8))).toBe(2);
  });
});

describe('dayHours', () => {
  it('is null on a closed weekday and the hours otherwise', () => {
    expect(dayHours(ELEGANCE, [], new Date(2030, 0, 7))).toBeNull();
    expect(dayHours(ELEGANCE, [], new Date(2030, 0, 8))).toEqual(OPEN);
  });

  it('is null inside a closed range, inclusive at both ends', () => {
    const closed = [{ id: 'c', from: '2030-01-08', to: '2030-01-10', label: null }];
    expect(dayHours(ELEGANCE, closed, new Date(2030, 0, 7))).toBeNull(); // closed weekday anyway
    expect(dayHours(ELEGANCE, closed, new Date(2030, 0, 8))).toBeNull();
    expect(dayHours(ELEGANCE, closed, new Date(2030, 0, 9))).toBeNull();
    expect(dayHours(ELEGANCE, closed, new Date(2030, 0, 10))).toBeNull();
    expect(dayHours(ELEGANCE, closed, new Date(2030, 0, 11))).toEqual(OPEN);
  });
});

describe('stylistWorks', () => {
  const off: StylistDayOff[] = [{ id: 'o', stylistId: 'amina', from: '2030-01-09', to: '2030-01-09' }];

  it('works on a workday', () => {
    expect(stylistWorks(stylist, off, new Date(2030, 0, 8))).toBe(true);
  });

  it('does not work on a non-workday', () => {
    expect(stylistWorks(stylist, off, new Date(2030, 0, 11))).toBe(false);
  });

  it('does not work inside a day-off range, but only for that stylist', () => {
    expect(stylistWorks(stylist, off, new Date(2030, 0, 9))).toBe(false);
    expect(stylistWorks({ ...stylist, id: 'leila' }, off, new Date(2030, 0, 9))).toBe(true);
  });

  it('does not work when inactive', () => {
    expect(stylistWorks({ ...stylist, active: false }, [], new Date(2030, 0, 8))).toBe(false);
  });
});

describe('groupHours', () => {
  it("merges consecutive days with identical hours, Monday to Sunday", () => {
    expect(groupHours(ELEGANCE)).toEqual([
      { from: 1, to: 1, hours: null },
      { from: 2, to: 6, hours: OPEN },
      { from: 7, to: 7, hours: null },
    ]);
  });

  it('gives 7 groups when every day differs', () => {
    const all = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, { opens: 480 + d * 15, closes: 1080 }])) as SalonHours;
    expect(groupHours(all)).toHaveLength(7);
  });
});
