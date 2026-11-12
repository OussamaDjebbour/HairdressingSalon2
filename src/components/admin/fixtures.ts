import type { AdminBooking } from '../../data/admin';
import type { SalonHours, Service, Stylist } from '../../data/types';

/** Shared test fixtures for the admin components. */
export const stylists: Stylist[] = ['amina', 'leila', 'sara'].map((id) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  role: { fr: 'Styliste', ar: 'خبيرة' },
  specialties: [],
  image: '',
  serviceIds: [],
  active: true,
  workdays: [1, 2, 3, 4, 5, 6, 7],
}));

export const services: Service[] = [
  { id: 'coupe-femme', category: 'coiffure', name: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف' }, description: { fr: '', ar: '' }, price: 2500, duration: 60, image: '', icon: 'scissors', active: true, sortOrder: 1 },
  { id: 'manucure', category: 'beaute', name: { fr: 'Manucure', ar: 'مانيكير' }, description: { fr: '', ar: '' }, price: 1500, duration: 60, image: '', icon: 'hand', active: true, sortOrder: 2 },
];

/** Élégance's hours: closed Monday and Sunday, 09:00-18:00 otherwise. */
export const eleganceHours: SalonHours = {
  1: null,
  2: { opens: 540, closes: 1080 },
  3: { opens: 540, closes: 1080 },
  4: { opens: 540, closes: 1080 },
  5: { opens: 540, closes: 1080 },
  6: { opens: 540, closes: 1080 },
  7: null,
};

/** `startIso` is a UTC instant; 09:00Z is 10:00 in Algiers. */
export function adminBooking(overrides: Partial<AdminBooking> & { startIso?: string } = {}): AdminBooking {
  const { startIso = '2030-01-08T09:00:00Z', ...rest } = overrides;
  const startsAt = new Date(startIso);
  return {
    id: 'b1', startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60000), status: 'pending', price: 2500,
    clientName: 'Yasmine', clientPhone: '0555123456', lang: 'fr', serviceId: 'coupe-femme',
    serviceName: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف' }, stylistId: 'amina', stylistName: 'Amina', source: 'online',
    ...rest,
  };
}
