import { Lang } from '../context/LanguageContext';

export interface Appointment {
  id: string;
  clientName: string;
  clientPhone: string;
  serviceId: string;
  serviceName: Record<Lang, string>;
  stylistName: string;
  time: string; // "HH:MM"
  duration: number; // minutes
  price: number;
  status: 'confirmed' | 'pending';
}

/** Mock appointments for the current day */
export const todayAppointments: Appointment[] = [
  {
    id: 'apt-1',
    clientName: 'Yasmine B.',
    clientPhone: '0561 23 45 67',
    serviceId: 'coupe-femme',
    serviceName: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف الشعر' },
    stylistName: 'Amina',
    time: '09:00',
    duration: 60,
    price: 2500,
    status: 'confirmed',
  },
  {
    id: 'apt-2',
    clientName: 'Nadia K.',
    clientPhone: '0770 12 34 56',
    serviceId: 'manucure',
    serviceName: { fr: 'Manucure & Vernis', ar: 'مانيكير وطلاء الأظافر' },
    stylistName: 'Sara',
    time: '09:30',
    duration: 45,
    price: 2000,
    status: 'confirmed',
  },
  {
    id: 'apt-3',
    clientName: 'Lila M.',
    clientPhone: '0555 78 90 12',
    serviceId: 'coloration',
    serviceName: { fr: 'Coloration & Balayage', ar: 'صبغة الشعر وبلاليج' },
    stylistName: 'Amina',
    time: '11:00',
    duration: 120,
    price: 6000,
    status: 'confirmed',
  },
  {
    id: 'apt-4',
    clientName: 'Sofia R.',
    clientPhone: '0660 34 56 78',
    serviceId: 'maquillage',
    serviceName: { fr: 'Maquillage Professionnel', ar: 'مكياج احترافي' },
    stylistName: 'Leila',
    time: '14:00',
    duration: 90,
    price: 5000,
    status: 'pending',
  },
  {
    id: 'apt-5',
    clientName: 'Amel D.',
    clientPhone: '0770 90 12 34',
    serviceId: 'soin-keratine',
    serviceName: { fr: 'Soin Kératine', ar: 'علاج الكيراتين' },
    stylistName: 'Amina',
    time: '15:30',
    duration: 150,
    price: 8000,
    status: 'confirmed',
  },
  {
    id: 'apt-6',
    clientName: 'Rania S.',
    clientPhone: '0555 45 67 89',
    serviceId: 'soin-visage',
    serviceName: { fr: 'Soin du Visage', ar: 'عناية بالوجه' },
    stylistName: 'Leila',
    time: '16:30',
    duration: 75,
    price: 3500,
    status: 'pending',
  },
];

/** Operating hours */
export const OPENING_HOUR = 9;
export const CLOSING_HOUR = 18;
