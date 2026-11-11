import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { SALON_ID } from './salon';

export interface Slot {
  slot: string;
  available: boolean;
}

export type BookingErrorCode =
  | 'slot_taken'
  | 'rate_limited'
  | 'too_many_bookings'
  | 'invalid_phone'
  | 'invalid_name'
  | 'outside_hours'
  | 'unknown_service'
  | 'unknown';

const KNOWN_ERRORS: BookingErrorCode[] = [
  'slot_taken',
  'rate_limited',
  'too_many_bookings',
  'invalid_phone',
  'invalid_name',
  'outside_hours',
  'unknown_service',
];

export function toBookingError(err: unknown): BookingErrorCode {
  const message =
    typeof err === 'object' && err !== null && 'message' in err
      ? String((err as { message: unknown }).message)
      : '';
  return (KNOWN_ERRORS as string[]).includes(message) ? (message as BookingErrorCode) : 'unknown';
}

/** Local calendar day as YYYY-MM-DD (the day the customer picked). */
export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Client mirror of private.normalize_phone — for instant feedback only; the DB is authoritative. */
export function normalizePhone(input: string): string {
  const v = input.replace(/[\s.()-]/g, '');
  if (v.startsWith('+213')) return '0' + v.slice(4);
  if (v.startsWith('00213')) return '0' + v.slice(5);
  return v;
}

export function isValidPhone(input: string): boolean {
  return /^0[5-7][0-9]{8}$/.test(normalizePhone(input));
}

export async function fetchSlots(date: Date, serviceId: string, stylistId: string | null): Promise<Slot[]> {
  const { data, error } = await supabase.rpc('get_slots', {
    p_salon_id: SALON_ID,
    p_date: toYmd(date),
    p_service_id: serviceId,
    p_stylist_id: stylistId,
  });
  if (error) throw error;
  return (data ?? []) as Slot[];
}

export function useSlots(date: Date | null, serviceId: string | null, stylistId: string | null) {
  return useQuery({
    queryKey: ['slots', date ? toYmd(date) : null, serviceId, stylistId],
    queryFn: () => fetchSlots(date as Date, serviceId as string, stylistId),
    enabled: date !== null && serviceId !== null,
    staleTime: 0,
  });
}

export interface CreateBookingInput {
  serviceId: string;
  stylistId: string | null;
  date: Date;
  time: string;
  clientName: string;
  clientPhone: string;
  lang: Lang;
}

export interface CreatedBooking {
  bookingId: string;
  stylistId: string;
}

export async function createBooking(input: CreateBookingInput): Promise<CreatedBooking> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_salon_id: SALON_ID,
    p_service_id: input.serviceId,
    p_stylist_id: input.stylistId,
    p_date: toYmd(input.date),
    p_time: input.time,
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone,
    p_lang: input.lang,
  });
  if (error) throw error;
  const row = (data as { booking_id: string; stylist_id: string }[])[0];
  return { bookingId: row.booking_id, stylistId: row.stylist_id };
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots'] }),
  });
}
