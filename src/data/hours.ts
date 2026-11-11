import { toYmd } from './bookings';
import type { ClosedDates, DayHours, SalonHours, Stylist, StylistDayOff, Weekday } from './types';

/** ISO weekday (1 = Monday … 7 = Sunday) of a local date. */
export function isoWeekday(date: Date): Weekday {
  return (((date.getDay() + 6) % 7) + 1) as Weekday;
}

/** Hours for a date, or null when the salon is closed (closed weekday or inside a closed range). Mirrors SQL `day_hours`. */
export function dayHours(hours: SalonHours, closed: ClosedDates[], date: Date): DayHours | null {
  const ymd = toYmd(date);
  if (closed.some((c) => c.from <= ymd && ymd <= c.to)) return null;
  return hours[isoWeekday(date)];
}

/** Whether a stylist works on a date: active, on a workday, and not on a day off. Mirrors SQL `stylist_works`. */
export function stylistWorks(stylist: Stylist, daysOff: StylistDayOff[], date: Date): boolean {
  if (!stylist.active || !stylist.workdays.includes(isoWeekday(date))) return false;
  const ymd = toYmd(date);
  return !daysOff.some((o) => o.stylistId === stylist.id && o.from <= ymd && ymd <= o.to);
}

const DISPLAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

const sameHours = (a: DayHours | null, b: DayHours | null) =>
  a === b || (!!a && !!b && a.opens === b.opens && a.closes === b.closes);

/** Consecutive weekdays (Monday → Sunday) with identical hours, merged. */
export function groupHours(hours: SalonHours): { from: Weekday; to: Weekday; hours: DayHours | null }[] {
  const groups: { from: Weekday; to: Weekday; hours: DayHours | null }[] = [];
  for (const wd of DISPLAY_ORDER) {
    const last = groups[groups.length - 1];
    if (last && sameHours(last.hours, hours[wd])) last.to = wd;
    else groups.push({ from: wd, to: wd, hours: hours[wd] });
  }
  return groups;
}
