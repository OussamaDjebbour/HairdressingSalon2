import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { toYmd } from './bookings';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export interface AdminBooking {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  price: number;
  clientName: string;
  clientPhone: string;
  lang: Lang;
  serviceId: string;
  serviceName: Record<Lang, string>;
  stylistId: string;
  stylistName: string;
}

interface AdminBookingRow {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  price: number;
  client_name: string;
  client_phone: string;
  lang: Lang;
  service_id: string;
  service_name: Record<Lang, string>;
  stylist_id: string;
  stylist_name: string;
  created_at: string;
}

const algiersTime = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Algiers',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "HH:MM" in salon time, whatever the viewer's timezone. */
export function formatAlgiersTime(d: Date): string {
  return algiersTime.format(d);
}

export function isNotAuthorized(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { message?: unknown }).message === 'not_authorized';
}

export async function fetchAdminBookings(day: Date): Promise<AdminBooking[]> {
  const ymd = toYmd(day);
  const { data, error } = await supabase.rpc('admin_list_bookings', { p_from: ymd, p_to: ymd });
  if (error) throw error;
  return ((data ?? []) as AdminBookingRow[]).map((r) => ({
    id: r.id,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    status: r.status,
    price: r.price,
    clientName: r.client_name,
    clientPhone: r.client_phone,
    lang: r.lang,
    serviceId: r.service_id,
    serviceName: r.service_name,
    stylistId: r.stylist_id,
    stylistName: r.stylist_name,
  }));
}

export function useAdminBookings(day: Date) {
  return useQuery({
    queryKey: ['admin', 'bookings', toYmd(day)],
    queryFn: () => fetchAdminBookings(day),
    staleTime: 0,
    retry: false,
  });
}

export async function setBookingStatus(input: { id: string; status: 'confirmed' | 'cancelled' }): Promise<void> {
  const { error } = await supabase.rpc('admin_set_booking_status', { p_id: input.id, p_status: input.status });
  if (error) throw error;
}

export function useSetBookingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setBookingStatus,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}
