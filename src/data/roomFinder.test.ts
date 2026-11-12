import { describe, it, expect } from 'vitest';
import { adminBooking, stylists } from '../components/admin/fixtures';
import type { AdminBooking } from './admin';
import { toYmd } from './bookings';
import { dayRoom, monthGrid, roomLevel, type DayRoom, type RoomInput } from './roomFinder';

const [amina, leila] = stylists;

/** A booking for a stylist; `startIso` is UTC (09:00Z = 10:00 in Algiers). */
function booking(startIso: string, minutes: number, stylistId: string, status: AdminBooking['status'] = 'confirmed'): AdminBooking {
  const b = adminBooking({ id: `${stylistId}-${startIso}`, startIso, stylistId, status });
  return { ...b, endsAt: new Date(b.startsAt.getTime() + minutes * 60000) };
}

const base: RoomInput = {
  date: new Date(2030, 0, 8), // Tuesday
  hours: { opens: 540, closes: 1080 },
  durationMin: 60,
  candidates: [amina, leila],
  specific: false,
  daysOff: [],
  bookings: [],
  now: new Date('2030-01-07T12:00:00Z'),
};
const times = (r: DayRoom) => (r.kind === 'room' ? r.starts.map((s) => s.time) : []);

describe('dayRoom', () => {
  it('lists half-hours from opening to the last start that ends by closing', () => {
    const t = times(dayRoom({ ...base, durationMin: 120 }));
    expect(t[0]).toBe('09:00');
    expect(t.at(-1)).toBe('16:00');
    expect(t).toHaveLength(15); // 09:00 … 16:00 every 30 min; free quarters are thinned out
  });

  it('a booking blocks every overlapping start, an odd one too; touching ends do not', () => {
    // Amina 10:10–11:00 Algiers (09:10Z, 50 min), given as UTC instants; service 60 min
    const t = times(dayRoom({ ...base, candidates: [amina], specific: true, bookings: [booking('2030-01-08T09:10:00Z', 50, 'amina')] }));
    expect(t).toContain('09:00'); // 09:00–10:00 ends before 10:10
    expect(t).not.toContain('09:30'); // overlaps 10:10
    expect(t).not.toContain('10:30'); // inside the booking
    expect(t).toContain('11:00'); // starts when it ends
  });

  it('pending and confirmed bookings block; a cancelled one does not', () => {
    const t = times(dayRoom({
      ...base,
      candidates: [amina],
      specific: true,
      bookings: [
        booking('2030-01-08T09:00:00Z', 60, 'amina', 'pending'), // 10:00
        booking('2030-01-08T13:00:00Z', 60, 'amina', 'cancelled'), // 14:00
        booking('2030-01-08T15:00:00Z', 60, 'amina', 'confirmed'), // 16:00
      ],
    }));
    expect(t).not.toContain('10:00');
    expect(t).toContain('14:00');
    expect(t).not.toContain('16:00');
  });

  it('ignores bookings of other days and other stylists', () => {
    const t = times(dayRoom({
      ...base,
      candidates: [amina],
      specific: true,
      bookings: [booking('2030-01-09T09:00:00Z', 60, 'amina'), booking('2030-01-08T09:00:00Z', 60, 'leila')],
    }));
    expect(t).toContain('10:00');
  });

  it('is closed when the salon is closed that day', () => {
    expect(dayRoom({ ...base, hours: null })).toEqual({ kind: 'closed' });
  });

  it('says absent when the chosen coiffeuse is off, full when nobody works with “Toutes”', () => {
    const daysOff = [{ id: 'o1', stylistId: 'amina', from: '2030-01-08', to: '2030-01-08' }];
    expect(dayRoom({ ...base, candidates: [amina], specific: true, daysOff })).toEqual({ kind: 'absent' });
    expect(dayRoom({ ...base, candidates: [amina], specific: false, daysOff })).toEqual({ kind: 'full' });
    expect(dayRoom({ ...base, candidates: [], specific: false })).toEqual({ kind: 'full' });
  });

  it('is full when the service is longer than the day allows', () => {
    expect(dayRoom({ ...base, durationMin: 150, hours: { opens: 540, closes: 660 } })).toEqual({ kind: 'full' });
  });

  it('today, only offers times after now', () => {
    const now = new Date('2030-01-08T14:10:00Z'); // 15:10 in Algiers
    expect(times(dayRoom({ ...base, now }))[0]).toBe('15:30');
  });

  it('today, after the last possible start, is full', () => {
    const now = new Date('2030-01-08T16:10:00Z'); // 17:10 in Algiers; a 60-min service must start by 17:00
    expect(dayRoom({ ...base, now })).toEqual({ kind: 'full' });
  });

  it('a day before today is past', () => {
    expect(dayRoom({ ...base, date: new Date(2030, 0, 7), now: new Date('2030-01-08T08:00:00Z') })).toEqual({ kind: 'past' });
  });

  it('with “Toutes”, a time counts if anyone is free, naming the first free one in order', () => {
    const r = dayRoom({ ...base, bookings: [booking('2030-01-08T09:00:00Z', 120, 'amina')] }); // Amina 10:00–12:00
    expect(r.kind).toBe('room');
    const at = (time: string) => (r.kind === 'room' ? r.starts.find((s) => s.time === time) : undefined);
    expect(at('10:00')).toEqual({ time: '10:00', stylistId: 'leila' });
    expect(at('09:00')).toEqual({ time: '09:00', stylistId: 'amina' });
  });

  it('shows a quarter-hour start only when it is the only way the service fits', () => {
    const r = dayRoom({
      ...base,
      candidates: [amina],
      specific: true,
      durationMin: 45,
      bookings: [booking('2030-01-08T08:00:00Z', 255, 'amina'), booking('2030-01-08T13:00:00Z', 240, 'amina')], // 09:00–13:15, 14:00–18:00
    });
    expect(times(r)).toEqual(['13:15']);
  });
});

describe('roomLevel', () => {
  it('is “lots” from 4 start times, “few” below', () => {
    expect(roomLevel(4)).toBe('lots');
    expect(roomLevel(3)).toBe('few');
    expect(roomLevel(1)).toBe('few');
  });
});

describe('monthGrid', () => {
  it('fills whole weeks from Sunday, marking the days of other months', () => {
    const grid = monthGrid(new Date(2026, 10, 1)); // November 2026 starts on a Sunday
    expect(grid).toHaveLength(35);
    expect(toYmd(grid[0].date)).toBe('2026-11-01');
    expect(grid[0].inMonth).toBe(true);
    expect(toYmd(grid[34].date)).toBe('2026-12-05');
    expect(grid[34].inMonth).toBe(false);
  });

  it('uses six weeks when the month needs them', () => {
    const grid = monthGrid(new Date(2026, 7, 1)); // August 2026 starts on a Saturday
    expect(grid).toHaveLength(42);
    expect(toYmd(grid[0].date)).toBe('2026-07-26');
    expect(grid.filter((c) => c.inMonth)).toHaveLength(31);
  });

  it('accepts any day of the month', () => {
    expect(toYmd(monthGrid(new Date(2030, 0, 19))[0].date)).toBe('2029-12-30');
  });
});
