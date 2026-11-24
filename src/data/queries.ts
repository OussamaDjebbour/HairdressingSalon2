import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Service, Stylist, Weekday } from './types';
import type { CustomCategory } from './categories';
import { currentSalonId } from './salon';
import { photoUrl } from './photoUrl';

interface ServiceRow {
  id: string;
  category: string;
  custom_category_id: string | null;
  name: Service['name'];
  description: Service['description'];
  price: number;
  duration: number;
  image: string;
  icon: string;
  sort_order: number;
  active: boolean;
  includes: string[] | null;
  pack_stylist_id: string | null;
  promo_price: number | null;
  promo_from: string | null;
  promo_to: string | null;
}

interface StylistRow {
  id: string;
  name: string;
  role: Stylist['role'];
  specialties: Stylist['specialties'];
  image: string;
  sort_order: number;
  active: boolean;
  stylist_services: { service_id: string }[] | null;
  stylist_workdays: { weekday: number }[] | null;
}

const STALE_MS = 30_000; // settings changes reach the public site within about a minute

export async function fetchServices(includeInactive = false): Promise<Service[]> {
  let query = supabase
    .from('services')
    .select('id, category, custom_category_id, name, description, price, duration, image, icon, sort_order, active, includes, pack_stylist_id, promo_price, promo_from, promo_to')
    .eq('salon_id', currentSalonId());
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query.order('sort_order');
  if (error) throw error;
  return (data as ServiceRow[]).map((r) => ({
    id: r.id,
    category: r.category,
    customCategoryId: r.custom_category_id,
    name: r.name,
    description: r.description,
    price: r.price,
    duration: r.duration,
    image: photoUrl(r.image),
    icon: r.icon,
    active: r.active,
    sortOrder: r.sort_order,
    includes: r.includes ?? [],
    packStylistId: r.pack_stylist_id,
    promo:
      r.promo_price !== null && r.promo_from && r.promo_to
        ? { price: r.promo_price, from: r.promo_from, to: r.promo_to }
        : null,
  }));
}

export async function fetchStylists(includeInactive = false): Promise<Stylist[]> {
  let query = supabase
    .from('stylists')
    .select('id, name, role, specialties, image, sort_order, active, stylist_services(service_id), stylist_workdays(weekday)')
    .eq('salon_id', currentSalonId());
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query.order('sort_order');
  if (error) throw error;
  return (data as StylistRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    specialties: r.specialties,
    image: r.image,
    serviceIds: (r.stylist_services ?? []).map((s) => s.service_id),
    active: r.active,
    workdays: (r.stylist_workdays ?? []).map((w) => w.weekday as Weekday).sort(),
  }));
}

export async function fetchCategories(): Promise<CustomCategory[]> {
  const { data, error } = await supabase
    .from('salon_categories')
    .select('id, name, sort_order')
    .eq('salon_id', currentSalonId())
    .order('sort_order')
    .order('id');
  if (error) throw error;
  return (data as { id: string; name: CustomCategory['name']; sort_order: number }[]).map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
  }));
}

/** Public: the categories the salon owner made (the ready-made ones are fixed). */
export function useCategories() {
  return useQuery({ queryKey: ['categories', currentSalonId()], queryFn: fetchCategories, staleTime: STALE_MS });
}

/** Public: whether online booking is open (false while the salon's subscription is paused). */
export async function fetchBookingOpen(): Promise<boolean> {
  const { data, error } = await supabase.rpc('salon_booking_open', { p_salon_id: currentSalonId() });
  if (error) throw error;
  return data !== false;
}

export function useBookingOpen() {
  return useQuery({ queryKey: ['salon', 'bookingOpen'], queryFn: fetchBookingOpen, staleTime: 60_000 });
}

/** Public: active services only. */
export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => fetchServices(), staleTime: STALE_MS });
}

/** Public: every service of the salon, hidden ones too (to name what a pack includes). */
export function useCatalogue() {
  return useQuery({ queryKey: ['services', 'all'], queryFn: () => fetchServices(true), staleTime: STALE_MS });
}

/** Public: active stylists only. */
export function useStylists() {
  return useQuery({ queryKey: ['stylists'], queryFn: () => fetchStylists(), staleTime: STALE_MS });
}

/** Admin: every service, including hidden ones. */
export function useAllServices() {
  return useQuery({ queryKey: ['admin', 'services'], queryFn: () => fetchServices(true), staleTime: STALE_MS });
}

/** Admin: every stylist, including hidden ones. */
export function useAllStylists() {
  return useQuery({ queryKey: ['admin', 'stylists'], queryFn: () => fetchStylists(true), staleTime: STALE_MS });
}
