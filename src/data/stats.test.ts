import { describe, expect, it } from 'vitest';
import { compare, occupancy, statsPeriod } from './stats';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const range = (p: { from: Date; to: Date }) => `${ymd(p.from)}..${ymd(p.to)}`;

describe('statsPeriod', () => {
  const wednesday = new Date(2030, 0, 9); // Wednesday 9 January 2030

  it('this week runs Monday to Sunday', () => {
    expect(range(statsPeriod('week', wednesday))).toBe('2030-01-07..2030-01-13');
    expect(range(statsPeriod('week', new Date(2030, 0, 13)))).toBe('2030-01-07..2030-01-13'); // a Sunday
  });

  it('this month and last month are whole calendar months', () => {
    expect(range(statsPeriod('month', wednesday))).toBe('2030-01-01..2030-01-31');
    expect(range(statsPeriod('lastMonth', wednesday))).toBe('2029-12-01..2029-12-31');
    expect(range(statsPeriod('lastMonth', new Date(2030, 2, 31)))).toBe('2030-02-01..2030-02-28');
  });

  it('the last 3 months are this month and the two before it', () => {
    expect(range(statsPeriod('quarter', wednesday))).toBe('2029-11-01..2030-01-31');
  });
});

describe('occupancy', () => {
  it('is booked over capacity, as a whole percentage', () => {
    expect(occupancy(270, 8100)).toBe(3);
    expect(occupancy(180, 2700)).toBe(7);
  });
  it('is null when nobody works in the period', () => {
    expect(occupancy(0, 0)).toBeNull();
  });
});

describe('compare', () => {
  it('says up or down by how much', () => {
    expect(compare(13500, 2500)).toEqual({ trend: 'up', delta: 11000 });
    expect(compare(2, 5)).toEqual({ trend: 'down', delta: 3 });
    expect(compare(4, 4)).toEqual({ trend: 'same', delta: 0 });
  });
  it('says nothing without a previous figure', () => {
    expect(compare(5, null)).toBeNull();
  });
});
