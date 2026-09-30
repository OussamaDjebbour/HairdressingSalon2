export type { Service, Stylist } from './types';

export function generateTimeSlots(_date: Date): string[] {
  const slots: string[] = [];
  for (let h = 9; h < 18; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
}

export function getBookedSlots(_date: Date, _stylistId: string | null): string[] {
  return ['10:00', '10:30', '14:00', '15:30'];
}
