import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Service, Stylist } from './types';

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
}

interface StylistRow {
  id: string;
  name: string;
  role: Stylist['role'];
  specialties: Stylist['specialties'];
  image: string;
  sort_order: number;
}

export async function fetchServices(): Promise<Service[]> {
  const { data, error } = await supabase
    .from('services')
    .select('id, category, name, description, price, duration, image, icon, sort_order')
    .order('sort_order');
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
  }));
}

export async function fetchStylists(): Promise<Stylist[]> {
  const { data, error } = await supabase
    .from('stylists')
    .select('id, name, role, specialties, image, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data as StylistRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    specialties: r.specialties,
    image: r.image,
  }));
}

export function useServices() {
  return useQuery({ queryKey: ['services'], queryFn: fetchServices });
}

export function useStylists() {
  return useQuery({ queryKey: ['stylists'], queryFn: fetchStylists });
}
