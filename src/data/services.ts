import { Lang } from '../context/LanguageContext';

export interface Service {
  id: string;
  category: string;
  name: Record<Lang, string>;
  description: Record<Lang, string>;
  price: number;
  duration: number;
  image: string;
  icon: string;
}

export const services: Service[] = [
  {
    id: 'coupe-femme',
    category: 'coiffure',
    name: { fr: 'Coupe & Brushing', ar: 'قص وتصفيف الشعر' },
    description: {
      fr: 'Coupe personnalisée et brushing pour sublimer votre style.',
      ar: 'قص مخصص وتصفيف لإبراز إطلالتكِ.',
    },
    price: 2500,
    duration: 60,
    image: 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=600',
    icon: 'scissors',
  },
  {
    id: 'coloration',
    category: 'coiffure',
    name: { fr: 'Coloration & Balayage', ar: 'صبغة الشعر وبلاليج' },
    description: {
      fr: 'Coloration professionnelle et balayage pour un rendu naturel.',
      ar: 'صبغة احترافية وبلاليج لنتيجة طبيعية.',
    },
    price: 6000,
    duration: 120,
    image: 'https://images.pexels.com/photos/3992874/pexels-photo-3992874.jpeg?auto=compress&cs=tinysrgb&w=600',
    icon: 'palette',
  },
  {
    id: 'soin-keratine',
    category: 'coiffure',
    name: { fr: 'Soin Kératine', ar: 'علاج الكيراتين' },
    description: {
      fr: 'Lissage et soin profond à la kératine pour des cheveux soyeux.',
      ar: 'تنعيم وعلاج عميق بالكيراتين لشعر حريري.',
    },
    price: 8000,
    duration: 150,
    image: 'https://images.pexels.com/photos/3997389/pexels-photo-3997389.jpeg?auto=compress&cs=tinysrgb&w=600',
    icon: 'sparkles',
  },
  {
    id: 'manucure',
    category: 'beaute',
    name: { fr: 'Manucure & Vernis', ar: 'مانيكير وطلاء الأظافر' },
    description: {
      fr: 'Manucure soignée et pose de vernis semi-permanent.',
      ar: 'مانيكير متقن وطلاء أظافر نصف دائم.',
    },
    price: 2000,
    duration: 45,
    image: 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=600',
    icon: 'hand',
  },
  {
    id: 'maquillage',
    category: 'beaute',
    name: { fr: 'Maquillage Professionnel', ar: 'مكياج احترافي' },
    description: {
      fr: 'Maquillage pour mariée, soirée ou événements spéciaux.',
      ar: 'مكياج للعروس، السهرة أو المناسبات الخاصة.',
    },
    price: 5000,
    duration: 90,
    image: 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=600',
    icon: 'brush',
  },
  {
    id: 'soin-visage',
    category: 'beaute',
    name: { fr: 'Soin du Visage', ar: 'عناية بالوجه' },
    description: {
      fr: 'Nettoyage profond, gommage et masque pour une peau éclatante.',
      ar: 'تنظيف عميق، تقشير وقناع لبشرة مشرقة.',
    },
    price: 3500,
    duration: 75,
    image: 'https://images.pexels.com/photos/3997390/pexels-photo-3997390.jpeg?auto=compress&cs=tinysrgb&w=600',
    icon: 'heart',
  },
];

export interface Stylist {
  id: string;
  name: string;
  role: Record<Lang, string>;
  specialties: Record<Lang, string>[];
  image: string;
}

export const stylists: Stylist[] = [
  {
    id: 'amina',
    name: 'Amina',
    role: { fr: 'Coiffeuse Styliste', ar: 'خبيرة تصفيف الشعر' },
    specialties: [
      { fr: 'Balayage', ar: 'بلاليج' },
      { fr: 'Kératine', ar: 'كيراتين' },
    ],
    image: 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: 'leila',
    name: 'Leila',
    role: { fr: 'Esthéticienne', ar: 'خبيرة تجميل' },
    specialties: [
      { fr: 'Maquillage', ar: 'مكياج' },
      { fr: 'Soin visage', ar: 'عناية بالوجه' },
    ],
    image: 'https://images.pexels.com/photos/3997384/pexels-photo-3997384.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
  {
    id: 'sara',
    name: 'Sara',
    role: { fr: 'Prothésiste Ongles', ar: 'خبيرة أظافر' },
    specialties: [
      { fr: 'Manucure', ar: 'مانيكير' },
      { fr: 'Vernis', ar: 'طلاء' },
    ],
    image: 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=400',
  },
];

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
