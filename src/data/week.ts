import { formatAlgiersTime, type AdminBooking } from './admin';
import { toYmd } from './bookings';
import { CLOSING_HOUR, OPENING_HOUR } from './hours';

const STEP_MINUTES = 15;

/** The 7 local-midnight dates from the Sunday on or before `day` to the Saturday after it. */
export function weekDays(day: Date): Date[] {
  const sunday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - day.getDay());
  return Array.from({ length: 7 }, (_, i) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i));
}

/** Closed Sunday and Monday (mirrors the SQL rule). */
export function isClosedDay(day: Date): boolean {
  return day.getDay() === 0 || day.getDay() === 1;
}

const algiersYmd = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Algiers',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The salon calendar date of an instant, as a local-midnight Date (like the day picker uses). */
export function salonDate(d: Date): Date {
  const [y, m, day] = algiersYmd.format(d).split('-').map(Number);
  return new Date(y, m - 1, day);
}

/** Minutes since midnight in salon time. */
export function salonMinutes(d: Date): number {
  const [h, m] = formatAlgiersTime(d).split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/** Share of the day's stylist-hours that is booked (0..1), ignoring cancelled bookings. */
export function dayOccupancy(bookings: AdminBooking[], day: Date, stylistCount: number): number {
  if (stylistCount <= 0) return 0;
  const ymd = toYmd(day);
  const booked = bookings
    .filter((b) => b.status !== 'cancelled' && toYmd(salonDate(b.startsAt)) === ymd)
    .reduce((sum, b) => sum + (b.endsAt.getTime() - b.startsAt.getTime()) / 60000, 0);
  const open = (CLOSING_HOUR - OPENING_HOUR) * 60 * stylistCount;
  return Math.min(1, Math.max(0, booked / open));
}

/** Start times the owner can pick: 15-minute steps from opening, ending by closing time. */
export function staffTimeOptions(durationMin: number): string[] {
  const options: string[] = [];
  for (let min = OPENING_HOUR * 60; min + durationMin <= CLOSING_HOUR * 60; min += STEP_MINUTES) {
    options.push(minutesToTime(min));
  }
  return options;
}

/** The instant of a salon wall-clock date + "HH:MM". Algiers is UTC+1 all year (no DST). */
export function salonInstant(date: Date, time: string): Date {
  return new Date(`${toYmd(date)}T${time}:00+01:00`);
}
