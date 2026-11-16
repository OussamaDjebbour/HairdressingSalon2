import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Lang } from '../context/LanguageContext';
import { supabase } from '../lib/supabase';
import { algiersToday } from './algiersTime';
import { toYmd } from './bookings';
import { minutesToTime } from './week';
import { currentSalonId } from './salon';
import type { Category } from './categories';
import { PHOTO_BUCKET } from './photoUrl';
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
    .eq('id', currentSalonId())
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
    .eq('salon_id', currentSalonId());
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
    .eq('salon_id', currentSalonId())
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
    .eq('salon_id', currentSalonId())
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
  category: Category;
  price: number;
  duration: number;
  sortOrder: number | null;
  /** Pack: included service names (empty for a service). */
  includes: string[];
  packStylistId: string | null;
  /** null = no promotion (a save always replaces the promotion). */
  promo: { price: number; from: string; to: string } | null;
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
    p_includes: i.includes,
    p_pack_stylist_id: i.packStylistId,
    p_promo_price: i.promo?.price ?? null,
    p_promo_from: i.promo?.from ?? null,
    p_promo_to: i.promo?.to ?? null,
  });

export type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; blob: Blob };

export class ServiceSaveError extends Error {
  code: SettingsErrorCode;
  /** Id of a service created during this failed attempt, otherwise null. */
  serviceId: string | null;
  constructor(code: SettingsErrorCode, serviceId: string | null) {
    super(code);
    this.name = 'ServiceSaveError';
    this.code = code;
    this.serviceId = serviceId;
  }
}

export async function saveServiceWithPhoto(input: SaveServiceInput, photo: PhotoChange): Promise<string> {
  const bucket = () => supabase.storage.from(PHOTO_BUCKET);
  let uploaded: string | null = null;
  if (photo.kind === 'new') {
    const path = `${currentSalonId()}/uploads/${crypto.randomUUID()}.jpg`;
    let failed = false;
    try {
      const { error } = await bucket().upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false });
      failed = !!error;
    } catch {
      failed = true;
    }
    if (failed) throw new ServiceSaveError('upload_failed', null);
    uploaded = path;
  }

  let createdId: string | null = null;
  let oldPath: string | null = null;
  let photoCalled = false;
  try {
    const id = await saveService(input);
    if (input.id === null) createdId = id;
    if (photo.kind !== 'keep') {
      photoCalled = true;
      oldPath = await rpc<string | null>('admin_set_service_photo', { p_id: id, p_path: uploaded });
    }
    if (oldPath) {
      try { await bucket().remove([oldPath]); } catch { /* best effort */ }
    }
    return id;
  } catch (err) {
    const code = toSettingsError(err);
    // If the photo RPC failed with no known server code (e.g. a lost response) it may have committed:
    // the service could now reference the file, so keep it (an orphan is harmless, a broken card is not).
    if (uploaded && (!photoCalled || code !== 'unknown')) {
      try { await bucket().remove([uploaded]); } catch { /* best effort */ }
    }
    throw new ServiceSaveError(code, createdId);
  }
}

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
    // Returning the promise keeps the mutation pending until fresh data is in, so screens never flash old values.
    onSuccess: () => Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
}

export const useSaveService = () => useSettingsWrite(saveService, CATALOG_KEYS);
export const useSaveServiceWithPhoto = () =>
  useSettingsWrite(
    ({ input, photo }: { input: SaveServiceInput; photo: PhotoChange }) => saveServiceWithPhoto(input, photo),
    CATALOG_KEYS
  );
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
  | 'invalid_photo'
  | 'invalid_promo'
  | 'invalid_pack'
  | 'demo_disabled'
  | 'upload_failed'
  | 'unknown';

const SETTINGS_ERROR_CODES: readonly SettingsErrorCode[] = [
  'not_authorized', 'not_found', 'unknown_service', 'invalid_name', 'invalid_price', 'invalid_duration',
  'invalid_hours', 'invalid_dates', 'invalid_url', 'invalid_weekday', 'invalid_phone',
  'invalid_photo', 'invalid_promo', 'invalid_pack', 'demo_disabled', 'upload_failed',
];

export function toSettingsError(err: unknown): SettingsErrorCode {
  if (err instanceof ServiceSaveError) return err.code;
  const message = typeof err === 'object' && err !== null ? (err as { message?: unknown }).message : undefined;
  return SETTINGS_ERROR_CODES.find((code) => code === message) ?? 'unknown';
}
