import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Lang } from '../context/LanguageContext';
import { toYmd } from './bookings';
import { useSession } from '../lib/auth';
import { algiersToday, formatAlgiersTime } from './algiersTime';
import { fetchDemoLogin } from './demoLogin';

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
  /** When the booking was made (online: when the client asked). */
  createdAt: Date;
  /** The visit this booking is a part of (a single-service booking is a visit of one). */
  visitId: string;
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
  visit_id: string;
}

export { algiersToday, formatAlgiersTime };

export function isNotAuthorized(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { message?: unknown }).message === 'not_authorized';
}

/** The salon id the signed-in staff member belongs to (raises not_authorized for non-staff). */
export async function fetchMySalon(): Promise<string> {
  const { data, error } = await supabase.rpc('admin_my_salon');
  if (error) throw error;
  return data as string;
}

/** Keyed by user id so a different account on the same device never sees a cached salon. */
export function useMySalon(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'my-salon', userId],
    enabled: !!userId,
    queryFn: fetchMySalon,
    staleTime: Infinity,
  });
}

export type StaffRole = 'owner' | 'demo';

/** The signed-in account's salon and role; `demo` sees masked phones and can't use notifications. */
export async function fetchMe(): Promise<{ salonId: string; role: StaffRole }> {
  const { data, error } = await supabase.rpc('admin_me');
  if (error) throw error;
  const row = (data as { salon_id: string; role: string }[] | null)?.[0];
  if (!row) throw { message: 'not_authorized' };
  return { salonId: row.salon_id, role: row.role === 'demo' ? 'demo' : 'owner' };
}

export function useMe(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'me', userId],
    enabled: !!userId,
    queryFn: fetchMe,
    staleTime: Infinity,
  });
}

/** The signed-in account's role, or null while unknown. */
export function useMyRole(): StaffRole | null {
  const { session } = useSession();
  return useMe(session?.user.id).data?.role ?? null;
}

export { fetchDemoLogin };

export async function resetDemo(): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_demo');
  if (error) throw error;
}

/** Owner-only: puts the demo salon back to its seeded state. */
export function useResetDemo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetDemo,
    onSettled: () => {
      for (const key of ['admin', 'services', 'stylists', 'salon', 'slots']) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

const toBooking = (r: AdminBookingRow): AdminBooking => ({
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
  createdAt: new Date(r.created_at),
  visitId: r.visit_id,
});

export async function fetchAdminBookings(from: Date, to: Date): Promise<AdminBooking[]> {
  const { data, error } = await supabase.rpc('admin_list_bookings', { p_from: toYmd(from), p_to: toYmd(to) });
  if (error) throw error;
  return ((data ?? []) as AdminBookingRow[]).map(toBooking);
}

/** Every part of the visit a booking belongs to, whatever week they fall in. */
export function useVisitParts(bookingId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'visit', bookingId],
    enabled: enabled && bookingId !== null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_visit_parts', { p_booking_id: bookingId });
      if (error) throw error;
      return ((data ?? []) as AdminBookingRow[]).map(toBooking);
    },
  });
}

/** All the parts the client booked in one go: one start, several services. */
export interface AdminVisit {
  id: string;
  /** Sorted by start time. */
  parts: AdminBooking[];
  first: AdminBooking;
  price: number;
  /** Each language's service names, joined with " + ". */
  serviceName: Record<Lang, string>;
}

function makeVisit(id: string, list: AdminBooking[]): AdminVisit {
  const parts = [...list].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const names = (lang: Lang) => parts.map((p) => p.serviceName[lang]).join(' + ');
  return {
    id,
    parts,
    first: parts[0],
    price: parts.reduce((sum, p) => sum + p.price, 0),
    serviceName: { fr: names('fr'), ar: names('ar') },
  };
}

/** One visit per `visitId`, earliest first. */
export function groupVisits(bookings: AdminBooking[]): AdminVisit[] {
  const byVisit = new Map<string, AdminBooking[]>();
  for (const b of bookings) byVisit.set(b.visitId, [...(byVisit.get(b.visitId) ?? []), b]);
  return [...byVisit.entries()]
    .map(([id, list]) => makeVisit(id, list))
    .sort((a, b) => a.first.startsAt.getTime() - b.first.startsAt.getTime());
}

/** The booking's visit as found in `pool` (de-duplicated by id); the booking itself is always part of it. */
export function visitOf(booking: AdminBooking, pool: AdminBooking[]): AdminVisit {
  const parts = new Map<string, AdminBooking>();
  for (const b of pool) if (b.visitId === booking.visitId) parts.set(b.id, b);
  parts.set(booking.id, booking);
  return makeVisit(booking.visitId, [...parts.values()]);
}

export const ADMIN_REFRESH_MS = 60_000;

/** Bookings between two salon dates, inclusive (the RPC caps the range at 31 days). */
export function useAdminBookings(from: Date, to: Date) {
  return useQuery({
    queryKey: ['admin', 'bookings', toYmd(from), toYmd(to)],
    queryFn: () => fetchAdminBookings(from, to),
    staleTime: 0,
    // Keep the owner's schedule and pending count current while /admin stays open on her phone.
    refetchInterval: ADMIN_REFRESH_MS,
    refetchOnWindowFocus: true,
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
