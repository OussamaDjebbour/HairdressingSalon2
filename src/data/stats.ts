/** The owner's Statistiques: periods, the admin_stats RPC and its figures. Admin-only (never imported by public code). */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { toYmd } from './bookings';

export type StatsPeriodKind = 'week' | 'month' | 'lastMonth' | 'quarter';
export const STATS_PERIODS: StatsPeriodKind[] = ['week', 'month', 'lastMonth', 'quarter'];

/** The days a period covers, around the salon's today: whole weeks (Monday first) and calendar months. */
export function statsPeriod(kind: StatsPeriodKind, today: Date): { from: Date; to: Date } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (kind) {
    case 'week': {
      const monday = new Date(y, m, today.getDate() - ((today.getDay() + 6) % 7));
      return { from: monday, to: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6) };
    }
    case 'month':
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
    case 'lastMonth':
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) };
    case 'quarter':
      return { from: new Date(y, m - 2, 1), to: new Date(y, m + 1, 0) };
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
  online: { requests: number; confirmed: number; refused: number; pending: number };
}

export async function fetchAdminStats(from: Date, to: Date): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats', { p_from: toYmd(from), p_to: toYmd(to) });
  if (error) throw error;
  return data as AdminStats;
}

export function useAdminStats(from: Date, to: Date) {
  return useQuery({
    queryKey: ['admin', 'stats', toYmd(from), toYmd(to)],
    queryFn: () => fetchAdminStats(from, to),
    staleTime: 60_000,
    retry: false,
  });
}

/** Booked over capacity as a whole percentage; null when nobody works in the period. */
export function occupancy(bookedMin: number, capacityMin: number): number | null {
  return capacityMin > 0 ? Math.round((bookedMin / capacityMin) * 100) : null;
}

/** How a figure moved since the previous period; null without a previous figure. */
export function compare(current: number, previous: number | null): { trend: 'up' | 'down' | 'same'; delta: number } | null {
  if (previous === null) return null;
  const d = current - previous;
  return { trend: d > 0 ? 'up' : d < 0 ? 'down' : 'same', delta: Math.abs(d) };
}
