import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Service, Stylist, Weekday } from './types';
import { currentSalonId } from './salon';

interface ServiceRow {
  id: string;
  category: string;
  name: Service['name'];
  description: Service['description'];
  price: number;
  duration: number;
  image: string;
  icon: string;
  sort_order: number;
  active: boolean;
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
    .select('id, category, name, description, price, duration, image, icon, sort_order, active')
    .eq('salon_id', currentSalonId());
  if (!includeInactive) query = query.eq('active', true);
  const { data, error } = await query.order('sort_order');
  if (error) throw error;
  return (data as ServiceRow[]).map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name,
    description: r.description,
    price: r.price,
    duration: r.duration,
    image: r.image,
    icon: r.icon,
    active: r.active,
    sortOrder: r.sort_order,
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

/** Public: active services only. */
export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: () => fetchServices(), staleTime: STALE_MS });
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
