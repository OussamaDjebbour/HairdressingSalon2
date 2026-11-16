import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { currentSalonId } from './salon';

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
  | 'too_many_services'
  | 'price_changed'
  | 'unknown';

const KNOWN_ERRORS: BookingErrorCode[] = [
  'slot_taken',
  'rate_limited',
  'too_many_bookings',
  'invalid_phone',
  'invalid_name',
  'outside_hours',
  'unknown_service',
  'too_many_services',
  'price_changed',
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

export interface VisitItem {
  serviceId: string;
  stylistId: string | null;
}

export interface VisitSlot extends Slot {
  /** 0-based indexes of the visit's parts that cannot be placed at this slot. */
  missing: number[];
}

function toRpcItems(items: VisitItem[]) {
  return items.map((i) => ({ service_id: i.serviceId, stylist_id: i.stylistId }));
}

export async function fetchVisitSlots(date: Date, items: VisitItem[]): Promise<VisitSlot[]> {
  const { data, error } = await supabase.rpc('get_visit_slots', {
    p_salon_id: currentSalonId(),
    p_date: toYmd(date),
    p_items: toRpcItems(items),
  });
  if (error) throw error;
  return (data ?? []) as VisitSlot[];
}

export function useVisitSlots(date: Date | null, items: VisitItem[]) {
  return useQuery({
    queryKey: ['slots', 'visit', date ? toYmd(date) : null, items],
    queryFn: () => fetchVisitSlots(date as Date, items),
    enabled: date !== null && items.length > 0,
    staleTime: 0,
  });
}

export interface CreateVisitInput {
  items: VisitItem[];
  date: Date;
  time: string;
  clientName: string;
  clientPhone: string;
  lang: Lang;
  /** The total the client saw; the server refuses with `price_changed` if it differs. */
  expectedTotal: number;
}

export interface CreatedPart {
  bookingId: string;
  serviceId: string;
  stylistId: string;
  startsAt: Date;
}

export async function createVisit(input: CreateVisitInput): Promise<CreatedPart[]> {
  const { data, error } = await supabase.rpc('create_visit', {
    p_salon_id: currentSalonId(),
    p_items: toRpcItems(input.items),
    p_date: toYmd(input.date),
    p_time: input.time,
    p_client_name: input.clientName,
    p_client_phone: input.clientPhone,
    p_lang: input.lang,
    p_expected_total: input.expectedTotal,
  });
  if (error) throw error;
  return ((data ?? []) as { booking_id: string; service_id: string; stylist_id: string; starts_at: string }[]).map(
    (r) => ({
      bookingId: r.booking_id,
      serviceId: r.service_id,
      stylistId: r.stylist_id,
      startsAt: new Date(r.starts_at),
    }),
  );
}

export function useCreateVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createVisit,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['slots'] }),
  });
}

/** Which part of the visit failed (`slot_taken` carries `details = 'item:<index>'`). */
export function failedItem(err: unknown): number | null {
  if (typeof err !== 'object' || err === null || !('details' in err)) return null;
  const m = /^item:(\d+)$/.exec(String((err as { details: unknown }).details));
  return m ? Number(m[1]) : null;
}
