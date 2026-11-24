/** The salon's subscription state for the owner's notice (admin only; computed by the database in Algiers time). */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export type BillingState = 'none' | 'ok' | 'soon' | 'grace' | 'paused';

export interface AdminBilling {
  state: BillingState;
  /** The last day paid for, YYYY-MM-DD (absent when not billed). */
  paid_until?: string;
  /** The day online booking pauses, YYYY-MM-DD. */
  paused_from?: string;
}

export async function fetchAdminBilling(): Promise<AdminBilling> {
  const { data, error } = await supabase.rpc('admin_billing');
  if (error) throw error;
  return data as AdminBilling;
}

export function useAdminBilling() {
  // Short: right after the product owner records a payment, the next screen she opens shows it.
  return useQuery({ queryKey: ['admin', 'billing'], queryFn: fetchAdminBilling, staleTime: 30_000, retry: false });
}

/** A YYYY-MM-DD day as a local date (no timezone shift). */
export function dayOf(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}
