import type { AdminBooking } from '../../data/admin';
import type { Service, Stylist } from '../../data/types';

/** Shared test fixtures for the admin components. */
export const stylists: Stylist[] = ['amina', 'leila', 'sara'].map((id) => ({
  id,
  name: id[0].toUpperCase() + id.slice(1),
  role: { fr: 'Styliste', ar: 'خبيرة' },
  specialties: [],
  image: '',
  serviceIds: [],
}));

export const services: Service[] = [
  { id: 'coupe-femme', category: 'coiffure', name: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف' }, description: { fr: '', ar: '' }, price: 2500, duration: 60, image: '', icon: 'scissors' },
  { id: 'manucure', category: 'beaute', name: { fr: 'Manucure', ar: 'مانيكير' }, description: { fr: '', ar: '' }, price: 1500, duration: 60, image: '', icon: 'hand' },
];

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
