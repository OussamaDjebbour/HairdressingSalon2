import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { toYmd } from './bookings';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
/** Where a booking came from: the public form, or added by the owner in /admin. */
export type BookingSource = 'online' | 'staff';

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
  source: BookingSource;
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
  source: BookingSource;
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

/** Today's date in salon time (Africa/Algiers), as a local-midnight Date for the day picker. */
export function algiersToday(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isNotAuthorized(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { message?: unknown }).message === 'not_authorized';
}

export async function fetchAdminBookings(from: Date, to: Date): Promise<AdminBooking[]> {
  const { data, error } = await supabase.rpc('admin_list_bookings', { p_from: toYmd(from), p_to: toYmd(to) });
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
    source: r.source,
  }));
}

/** Bookings between two salon dates, inclusive (the RPC caps the range at 31 days). */
export function useAdminBookings(from: Date, to: Date) {
  return useQuery({
    queryKey: ['admin', 'bookings', toYmd(from), toYmd(to)],
    queryFn: () => fetchAdminBookings(from, to),
    staleTime: 0,
    retry: false,
  });
}

export async function setBookingStatus(input: { id: string; status: 'confirmed' | 'cancelled' }): Promise<void> {
  const { error } = await supabase.rpc('admin_set_booking_status', { p_id: input.id, p_status: input.status });
  if (error) throw error;
}

export function useSetBookingStatus() {
  return useAdminWrite(setBookingStatus);
}

export interface StaffBookingInput {
  serviceId: string;
  stylistId: string;
  date: Date;
  /** "HH:MM", salon wall-clock time. */
  time: string;
  clientName: string;
  clientPhone: string;
  lang: Lang;
}

function staffParams(input: StaffBookingInput) {
  return {
    p_service_id: input.serviceId,
    p_stylist_id: input.stylistId,
    p_date: toYmd(input.date),
    p_time: input.time,
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone,
    p_lang: input.lang,
  };
}

export async function createStaffBooking(input: StaffBookingInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_booking', staffParams(input));
  if (error) throw error;
  return data as string;
}

export async function updateStaffBooking(input: StaffBookingInput & { id: string }): Promise<void> {
  const { error } = await supabase.rpc('admin_update_booking', { p_id: input.id, ...staffParams(input) });
  if (error) throw error;
}

function useAdminWrite<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] });
      queryClient.invalidateQueries({ queryKey: ['slots'] });
    },
  });
}

export function useCreateStaffBooking() {
  return useAdminWrite(createStaffBooking);
}

export function useUpdateStaffBooking() {
  return useAdminWrite(updateStaffBooking);
}

export type AdminErrorCode =
  | 'not_authorized'
  | 'invalid_name'
  | 'invalid_phone'
  | 'unknown_service'
  | 'outside_hours'
  | 'slot_taken'
  | 'not_found'
  | 'unknown';

const ADMIN_ERROR_CODES: readonly AdminErrorCode[] = [
  'not_authorized', 'invalid_name', 'invalid_phone', 'unknown_service', 'outside_hours', 'slot_taken', 'not_found',
];

export function toAdminError(err: unknown): AdminErrorCode {
  const message = typeof err === 'object' && err !== null ? (err as { message?: unknown }).message : undefined;
  return ADMIN_ERROR_CODES.find((code) => code === message) ?? 'unknown';
}
