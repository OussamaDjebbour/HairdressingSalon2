import { describe, expect, it } from 'vitest';
import { compare, occupancy, statsPeriod } from './stats';

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const show = (p: ReturnType<typeof statsPeriod>) => `${ymd(p.from)}..${ymd(p.to)} vs ${ymd(p.prevFrom)}..${ymd(p.prevTo)}`;

describe('statsPeriod', () => {
  const wednesday = new Date(2030, 0, 9); // Wednesday 9 January 2030

  it('this week runs Monday to today, against the same days the week before', () => {
    expect(show(statsPeriod('week', wednesday))).toBe('2030-01-07..2030-01-09 vs 2029-12-31..2030-01-02');
    expect(show(statsPeriod('week', new Date(2030, 0, 13)))).toBe('2030-01-07..2030-01-13 vs 2029-12-31..2030-01-06'); // a Sunday
  });

  it('this month runs to today, against the same days of last month (cut at its end)', () => {
    expect(show(statsPeriod('month', wednesday))).toBe('2030-01-01..2030-01-09 vs 2029-12-01..2029-12-09');
    expect(show(statsPeriod('month', new Date(2030, 2, 31)))).toBe('2030-03-01..2030-03-31 vs 2030-02-01..2030-02-28');
  });

  it('last month is the whole calendar month, against the whole month before', () => {
    expect(show(statsPeriod('lastMonth', wednesday))).toBe('2029-12-01..2029-12-31 vs 2029-11-01..2029-11-30');
    expect(show(statsPeriod('lastMonth', new Date(2030, 2, 31)))).toBe('2030-02-01..2030-02-28 vs 2030-01-01..2030-01-31');
  });

  it('the last 3 months run to today, against the same span 3 months earlier', () => {
    expect(show(statsPeriod('quarter', wednesday))).toBe('2029-11-01..2030-01-09 vs 2029-08-01..2029-10-09');
    expect(show(statsPeriod('quarter', new Date(2030, 4, 31)))).toBe('2030-03-01..2030-05-31 vs 2029-12-01..2030-02-28');
  });
});

describe('occupancy', () => {
  it('is booked over capacity, as a whole percentage, never over 100', () => {
    expect(occupancy(270, 8100)).toBe(3);
    expect(occupancy(180, 2700)).toBe(7);
    expect(occupancy(600, 540)).toBe(100);
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
