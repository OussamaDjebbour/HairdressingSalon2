/** The owner's Statistiques: periods, the admin_stats RPC and its figures. Admin-only (never imported by public code). */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { toYmd } from './bookings';

export type StatsPeriodKind = 'week' | 'month' | 'lastMonth' | 'quarter';
export const STATS_PERIODS: StatsPeriodKind[] = ['week', 'month', 'lastMonth', 'quarter'];

/** The last day of a month (month may overflow: new Date handles it). */
const monthEnd = (y: number, m: number) => new Date(y, m + 1, 0);
/** Day `d` of a month, cut at that month's last day (31 March → 28 February). */
const dayOf = (y: number, m: number, d: number) => new Date(y, m, Math.min(d, monthEnd(y, m).getDate()));
const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/**
 * The days a period covers around the salon's today, and the days it is compared with. A period still under way
 * runs up to today and is compared with the same days of the period before (1–9 January vs 1–9 December); last
 * month is a whole calendar month against the whole month before.
 */
export function statsPeriod(kind: StatsPeriodKind, today: Date): { from: Date; to: Date; prevFrom: Date; prevTo: Date } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();
  switch (kind) {
    case 'week': {
      const monday = addDays(today, -((today.getDay() + 6) % 7));
      return { from: monday, to: today, prevFrom: addDays(monday, -7), prevTo: addDays(today, -7) };
    }
    case 'month':
      return { from: new Date(y, m, 1), to: today, prevFrom: new Date(y, m - 1, 1), prevTo: dayOf(y, m - 1, d) };
    case 'lastMonth':
      return { from: new Date(y, m - 1, 1), to: monthEnd(y, m - 1), prevFrom: new Date(y, m - 2, 1), prevTo: monthEnd(y, m - 2) };
    case 'quarter':
      return { from: new Date(y, m - 2, 1), to: today, prevFrom: new Date(y, m - 5, 1), prevTo: dayOf(y, m - 3, d) };
  }
}

export interface StatsTotals {
  revenue: number;
  visits: number;
  pending: number;
  booked_min: number;
  capacity_min: number;
  clients: number;
  new_clients: number;
}

export interface AdminStats {
  current: StatsTotals;
  previous: StatsTotals;
  stylists: { id: string; name: string; visits: number; revenue: number; booked_min: number; capacity_min: number }[];
  services: { id: string; name: Record<Lang, string>; count: number; revenue: number }[];
  online: { requests: number; confirmed: number; cancelled: number; pending: number };
}

type Period = ReturnType<typeof statsPeriod>;

export async function fetchAdminStats(p: Period): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats', {
    p_from: toYmd(p.from),
    p_to: toYmd(p.to),
    p_prev_from: toYmd(p.prevFrom),
    p_prev_to: toYmd(p.prevTo),
  });
  if (error) throw error;
  return data as AdminStats;
}

export function useAdminStats(p: Period) {
  return useQuery({
    queryKey: ['admin', 'stats', toYmd(p.from), toYmd(p.to), toYmd(p.prevFrom), toYmd(p.prevTo)],
    queryFn: () => fetchAdminStats(p),
    staleTime: 60_000,
    retry: false,
  });
}

/** Booked over capacity as a whole percentage (at most 100: a booking can run past closing); null when nobody works. */
export function occupancy(bookedMin: number, capacityMin: number): number | null {
  return capacityMin > 0 ? Math.min(100, Math.round((bookedMin / capacityMin) * 100)) : null;
}

/** How a figure moved since the previous period; null without a previous figure. */
export function compare(current: number, previous: number | null): { trend: 'up' | 'down' | 'same'; delta: number } | null {
  if (previous === null) return null;
  const d = current - previous;
  return { trend: d > 0 ? 'up' : d < 0 ? 'down' : 'same', delta: Math.abs(d) };
}
