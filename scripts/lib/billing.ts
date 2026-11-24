/** Date maths and arguments of `pnpm salon-paid` (pure, tested). Dates are YYYY-MM-DD, Algiers calendar days. */

export const USAGE =
  'Usage: pnpm salon-paid                          list every salon\n' +
  '       pnpm salon-paid <salon-id> --months <1-24>  extend from the later of today and the paid-until date\n' +
  '       pnpm salon-paid <salon-id> --until YYYY-MM-DD\n' +
  '       pnpm salon-paid <salon-id> --stop          not billed any more (never paused)';

export type SalonPaidArgs =
  | { kind: 'list' }
  | { kind: 'set'; salonId: string; until: string }
  | { kind: 'extend'; salonId: string; months: number }
  | { kind: 'stop'; salonId: string };

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Today's date in Algiers. */
export function algiersToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** A real calendar date in YYYY-MM-DD form. */
function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** `months` calendar months later; the day is cut at the end of a shorter month (31 Jan + 1 = 28/29 Feb). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const index = y * 12 + (m - 1) + months;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return ymd(ty, tm, Math.min(d, last));
}

/** The new paid-until date after paying `months`: counted from the current date if still ahead, else from today. */
export function nextPaidUntil(current: string | null, today: string, months: number): string {
  const from = current !== null && current > today ? current : today;
  return addMonths(from, months);
}

export function parseArgs(argv: string[]): SalonPaidArgs {
  const bad = (why: string): never => {
    throw new Error(`${why}\n${USAGE}`);
  };
  if (argv.length === 0) return { kind: 'list' };
  const [salonId, ...rest] = argv;
  if (salonId.startsWith('--')) bad('The salon id comes first.');
  if (rest.length === 0) bad('Say what to do: --months, --until or --stop.');
  const [flag, value, ...extra] = rest;
  if (extra.length > 0) bad('One action at a time.');
  switch (flag) {
    case '--stop':
      if (value !== undefined) bad('One action at a time.');
      return { kind: 'stop', salonId };
    case '--months': {
      const months = Number(value);
      if (!Number.isInteger(months) || months < 1 || months > 24) bad('--months takes a whole number from 1 to 24.');
      return { kind: 'extend', salonId, months };
    }
    case '--until':
      if (value === undefined || !isDay(value)) bad('--until takes a date like 2027-01-31.');
      return { kind: 'set', salonId, until: value };
    default:
      return bad(`Unknown option ${flag}.`);
  }
}
