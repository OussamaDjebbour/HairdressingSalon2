import type { Service } from './types';
import type { VisitSlot } from './bookings';

export const MAX_VISIT_SERVICES = 4;

/** The salon's order (not the tick order): sortOrder, then French name, then id. */
export function visitOrder<T extends Pick<Service, 'id' | 'sortOrder' | 'name'>>(services: T[]): T[] {
  return [...services].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.fr.localeCompare(b.name.fr, 'fr') ||
      a.id.localeCompare(b.id),
  );
}

export function visitTotals(services: Pick<Service, 'price' | 'duration'>[]): { price: number; duration: number } {
  return services.reduce(
    (t, s) => ({ price: t.price + s.price, duration: t.duration + s.duration }),
    { price: 0, duration: 0 },
  );
}

export interface PlannedPart {
  service: Service;
  time: string;
}

/** Parts back to back from `start` ('HH:MM'). */
export function planVisit(services: Service[], start: string): PlannedPart[] {
  const [h, m] = start.split(':').map(Number);
  let minutes = h * 60 + m;
  return services.map((service) => {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    minutes += service.duration;
    return { service, time };
  });
}

export type SlotState = 'available' | 'partial' | 'full';

export function slotState(slot: VisitSlot, parts: number): SlotState {
  if (slot.available) return 'available';
  if (slot.missing.length === 0 || slot.missing.length >= parts) return 'full';
  return 'partial';
}

/** Parts missing from every slot, only when some slot can place at least one part. */
export function missingAllDay(slots: VisitSlot[], parts: number): number[] {
  if (slots.length === 0 || !slots.some((s) => s.missing.length < parts)) return [];
  return slots[0].missing.filter((i) => slots.every((s) => s.missing.includes(i)));
}

export function joinNames(names: string[]): string {
  return names.join(' + ');
}
