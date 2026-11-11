import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Lang } from '../context/LanguageContext';
import { supabase } from '../lib/supabase';
import { algiersToday } from './admin';
import { toYmd } from './bookings';
import { minutesToTime } from './week';
import { SALON_ID } from './salon';
import type {
  AffectedBooking,
  AffectedReason,
  ClosedDates,
  SalonHours,
  SalonInfo,
  StylistDayOff,
  Weekday,
} from './types';

const STALE_MS = 30_000;
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

/** "09:00:00" | "09:00" → minutes since midnight. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

// ---- reads ----

interface SalonRow {
  address: Record<Lang, string> | null;
  city: Record<Lang, string> | null;
  whatsapp: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
}

export async function fetchSalonInfo(): Promise<SalonInfo> {
  const { data, error } = await supabase
    .from('salons')
    .select('address, city, whatsapp, instagram_url, facebook_url')
    .eq('id', SALON_ID)
    .single();
  if (error) throw error;
  const r = data as SalonRow;
  return {
    address: r.address ?? { fr: '', ar: '' },
    city: r.city ?? { fr: '', ar: '' },
    whatsapp: r.whatsapp,
    instagramUrl: r.instagram_url,
    facebookUrl: r.facebook_url,
  };
}

export function useSalonInfo() {
  return useQuery({ queryKey: ['salon', 'info'], queryFn: fetchSalonInfo, staleTime: STALE_MS });
}

interface HoursRow {
  weekday: number;
  opens: string | null;
  closes: string | null;
}

export async function fetchSalonHours(): Promise<SalonHours> {
  const { data, error } = await supabase
    .from('salon_hours')
    .select('weekday, opens, closes')
    .eq('salon_id', SALON_ID);
  if (error) throw error;
  const hours = Object.fromEntries(WEEKDAYS.map((w) => [w, null])) as SalonHours;
  for (const r of (data ?? []) as HoursRow[]) {
    if (r.opens && r.closes) {
      hours[r.weekday as Weekday] = { opens: timeToMinutes(r.opens), closes: timeToMinutes(r.closes) };
    }
  }
  return hours;
}

export function useSalonHours() {
  return useQuery({ queryKey: ['salon', 'hours'], queryFn: fetchSalonHours, staleTime: STALE_MS });
}

interface ClosedRow {
  id: string;
  starts_on: string;
  ends_on: string;
  label: string | null;
}

/** Closed ranges that have not ended yet (ending today or later), soonest first. */
export async function fetchClosedDates(): Promise<ClosedDates[]> {
  const { data, error } = await supabase
    .from('salon_closed_dates')
    .select('id, starts_on, ends_on, label')
    .eq('salon_id', SALON_ID)
    .gte('ends_on', toYmd(algiersToday()))
    .order('starts_on');
  if (error) throw error;
  return ((data ?? []) as ClosedRow[]).map((r) => ({ id: r.id, from: r.starts_on, to: r.ends_on, label: r.label }));
}

export function useClosedDates() {
  return useQuery({ queryKey: ['salon', 'closed-dates'], queryFn: fetchClosedDates, staleTime: STALE_MS });
}

interface DayOffRow {
  id: string;
  stylist_id: string;
  starts_on: string;
  ends_on: string;
}

/** Admin: stylist days off (row-level security limits them to the owner's salon). */
export async function fetchStylistDaysOff(): Promise<StylistDayOff[]> {
  const { data, error } = await supabase
    .from('stylist_days_off')
    .select('id, stylist_id, starts_on, ends_on')
    .eq('salon_id', SALON_ID)
    .order('starts_on');
  if (error) throw error;
  return ((data ?? []) as DayOffRow[]).map((r) => ({
    id: r.id,
    stylistId: r.stylist_id,
    from: r.starts_on,
    to: r.ends_on,
  }));
}

export function useStylistDaysOff() {
  return useQuery({ queryKey: ['admin', 'stylist-days-off'], queryFn: fetchStylistDaysOff, staleTime: STALE_MS });
}

interface AffectedRow {
  id: string;
  starts_at: string;
  client_name: string;
  reason: AffectedReason;
}

/** Upcoming bookings that no longer fit the salon's settings. */
export async function fetchAffectedBookings(): Promise<AffectedBooking[]> {
  const { data, error } = await supabase.rpc('admin_affected_bookings');
  if (error) throw error;
  return ((data ?? []) as AffectedRow[]).map((r) => ({
    id: r.id,
    startsAt: new Date(r.starts_at),
    clientName: r.client_name,
    reason: r.reason,
  }));
}

export function useAffectedBookings(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'affected-bookings'],
    queryFn: fetchAffectedBookings,
    enabled,
    staleTime: STALE_MS,
  });
}

// ---- writes ----

async function rpc<T = void>(fn: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw error;
  return data as T;
}

export interface SaveServiceInput {
  /** null creates a new service. */
  id: string | null;
  name: Record<Lang, string>;
  description: Record<Lang, string> | null;
  category: 'coiffure' | 'beaute';
  price: number;
  duration: number;
  sortOrder: number | null;
}

export interface SaveStylistInput {
  /** null creates a new stylist. */
  id: string | null;
  name: string;
  role: Record<Lang, string>;
  serviceIds: string[];
  workdays: Weekday[];
}

export type SaveSalonInfoInput = SalonInfo;

const saveService = (i: SaveServiceInput) =>
  rpc<string>('admin_save_service', {
    p_id: i.id,
    p_name: i.name,
    p_description: i.description,
    p_category: i.category,
    p_price: i.price,
    p_duration: i.duration,
    p_sort_order: i.sortOrder,
  });

const setServiceActive = (i: { id: string; active: boolean }) =>
  rpc('admin_set_service_active', { p_id: i.id, p_active: i.active });

const saveStylist = (i: SaveStylistInput) =>
  rpc<string>('admin_save_stylist', {
    p_id: i.id,
    p_name: i.name,
    p_role: i.role,
    p_service_ids: i.serviceIds,
    p_weekdays: i.workdays,
  });

const setStylistActive = (i: { id: string; active: boolean }) =>
  rpc('admin_set_stylist_active', { p_id: i.id, p_active: i.active });

const addStylistDaysOff = (i: { stylistId: string; from: string; to: string }) =>
  rpc<string>('admin_add_stylist_days_off', { p_stylist_id: i.stylistId, p_from: i.from, p_to: i.to });

const deleteStylistDaysOff = (i: { id: string }) => rpc('admin_delete_stylist_days_off', { p_id: i.id });

const setHours = (hours: SalonHours) =>
  rpc('admin_set_hours', {
    p_hours: WEEKDAYS.map((weekday) => {
      const h = hours[weekday];
      return { weekday, opens: h ? minutesToTime(h.opens) : null, closes: h ? minutesToTime(h.closes) : null };
    }),
  });

const addClosedDates = (i: { from: string; to: string; label: string | null }) =>
  rpc<string>('admin_add_closed_dates', { p_from: i.from, p_to: i.to, p_label: i.label });

const deleteClosedDates = (i: { id: string }) => rpc('admin_delete_closed_dates', { p_id: i.id });

const saveSalonInfo = (i: SaveSalonInfoInput) =>
  rpc('admin_save_salon_info', {
    p_address: i.address,
    p_city: i.city,
    p_whatsapp: i.whatsapp,
    p_instagram_url: i.instagramUrl,
    p_facebook_url: i.facebookUrl,
  });

const CATALOG_KEYS = [['services'], ['stylists'], ['admin'], ['slots']];
const SALON_KEYS = [['salon'], ['admin'], ['slots']];

function useSettingsWrite<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  keys: string[][]
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const queryKey of keys) queryClient.invalidateQueries({ queryKey });
    },
  });
}

export const useSaveService = () => useSettingsWrite(saveService, CATALOG_KEYS);
export const useSetServiceActive = () => useSettingsWrite(setServiceActive, CATALOG_KEYS);
export const useSaveStylist = () => useSettingsWrite(saveStylist, CATALOG_KEYS);
export const useSetStylistActive = () => useSettingsWrite(setStylistActive, CATALOG_KEYS);
export const useAddStylistDaysOff = () => useSettingsWrite(addStylistDaysOff, CATALOG_KEYS);
export const useDeleteStylistDaysOff = () => useSettingsWrite(deleteStylistDaysOff, CATALOG_KEYS);
export const useSetHours = () => useSettingsWrite(setHours, SALON_KEYS);
export const useAddClosedDates = () => useSettingsWrite(addClosedDates, SALON_KEYS);
export const useDeleteClosedDates = () => useSettingsWrite(deleteClosedDates, SALON_KEYS);
export const useSaveSalonInfo = () => useSettingsWrite(saveSalonInfo, SALON_KEYS);

// ---- errors ----

export type SettingsErrorCode =
  | 'not_authorized'
  | 'not_found'
  | 'unknown_service'
  | 'invalid_name'
  | 'invalid_price'
  | 'invalid_duration'
  | 'invalid_hours'
  | 'invalid_dates'
  | 'invalid_url'
  | 'invalid_weekday'
  | 'invalid_phone'
  | 'unknown';

const SETTINGS_ERROR_CODES: readonly SettingsErrorCode[] = [
  'not_authorized', 'not_found', 'unknown_service', 'invalid_name', 'invalid_price', 'invalid_duration',
  'invalid_hours', 'invalid_dates', 'invalid_url', 'invalid_weekday', 'invalid_phone',
];

export function toSettingsError(err: unknown): SettingsErrorCode {
  const message = typeof err === 'object' && err !== null ? (err as { message?: unknown }).message : undefined;
  return SETTINGS_ERROR_CODES.find((code) => code === message) ?? 'unknown';
}
