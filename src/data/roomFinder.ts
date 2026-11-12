import type { AdminBooking } from './admin';
import { toYmd } from './bookings';
import { stylistWorks } from './hours';
import type { DayHours, Stylist, StylistDayOff } from './types';
import { minutesToTime, salonDate, salonMinutes, staffTimeOptions } from './week';

/** A start time that fits, and the coiffeuse it fits for (the first free one, in order). */
export interface FreeStart {
  time: string; // "HH:MM", salon time
  stylistId: string;
}

/** How much room a day has for one service: why none, or the start times that fit. */
export type DayRoom =
  | { kind: 'past' }
  | { kind: 'closed' }
  | { kind: 'absent' }
  | { kind: 'full' }
  | { kind: 'room'; starts: FreeStart[] };

export interface RoomInput {
  /** Local-midnight day, like the agenda's `day`. */
  date: Date;
  /** dayHours(salonHours, closedDates, date): null when the salon is closed. */
  hours: DayHours | null;
  /** The service's duration. */
  durationMin: number;
  /** The chosen coiffeuse, or every active one, in the salon's order. */
  candidates: Stylist[];
  /** One coiffeuse was chosen: her day off reads "absent" rather than "full". */
  specific: boolean;
  daysOff: StylistDayOff[];
  /** Any range: only non-cancelled bookings on `date` count. */
  bookings: AdminBooking[];
  now: Date;
}

const QUARTER = 15;

/**
 * The owner's rules (as admin_create_booking applies them): the salon's hours and closed dates, a
 * 15-minute grid from opening, the service ending by closing time, no overlap with that coiffeuse's
 * pending or confirmed bookings, and only coiffeuses who work that day. Any coiffeuse can do any service.
 */
export function dayRoom(input: RoomInput): DayRoom {
  const { date, hours, durationMin, candidates, specific, daysOff, bookings, now } = input;
  const ymd = toYmd(date);
  const today = toYmd(salonDate(now));
  if (ymd < today) return { kind: 'past' };
  if (!hours) return { kind: 'closed' };

  const working = candidates.filter((s) => stylistWorks(s, daysOff, date));
  if (working.length === 0) return { kind: specific ? 'absent' : 'full' };

  const busy = new Map<string, { start: number; end: number }[]>();
  for (const b of bookings) {
    if (b.status === 'cancelled' || toYmd(salonDate(b.startsAt)) !== ymd) continue;
    const start = salonMinutes(b.startsAt);
    const end = start + Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);
    busy.set(b.stylistId, [...(busy.get(b.stylistId) ?? []), { start, end }]);
  }
  const isFree = (stylistId: string, start: number) =>
    !(busy.get(stylistId) ?? []).some((b) => b.start < start + durationMin && start < b.end);

  const after = ymd === today ? salonMinutes(now) : -1;
  const free = new Map<number, string>();
  for (const time of staffTimeOptions(durationMin, hours)) {
    const [h, m] = time.split(':').map(Number);
    const start = h * 60 + m;
    if (start <= after) continue;
    const who = working.find((s) => isFree(s.id, start));
    if (who) free.set(start, who.id);
  }

  // Half-hours always; a quarter-hour only when it is the only way the service fits in that gap.
  const starts: FreeStart[] = [];
  for (const [start, stylistId] of free) {
    const quarter = start % 30 !== 0;
    if (quarter && (free.has(start - QUARTER) || free.has(start + QUARTER))) continue;
    starts.push({ time: minutesToTime(start), stylistId });
  }
  return starts.length > 0 ? { kind: 'room', starts } : { kind: 'full' };
}

/** Plenty of room from 4 start times; 1 to 3 is "few". */
export function roomLevel(count: number): 'lots' | 'few' {
  return count >= 4 ? 'lots' : 'few';
}

/** The month of `month` as whole weeks from Sunday (5 or 6 rows), days of other months marked. */
export function monthGrid(month: Date): { date: Date; inMonth: boolean }[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: cells }, (_, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), 1 - lead + i);
    return { date, inMonth: date.getMonth() === first.getMonth() };
  });
}
