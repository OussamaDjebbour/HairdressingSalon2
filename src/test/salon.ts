import type { CurrentSalon } from '../data/salon';

/** Élégance as the app resolves it from the seeded database (the default salon in tests). */
export const ELEGANCE: CurrentSalon = {
  id: 'elegance',
  name: { fr: 'Élégance', ar: 'Élégance' },
  palette: {
    '50': '#FBF1F3', '100': '#F7E0E5', '200': '#EFC1CC', '300': '#E29FB1', '400': '#D17D93',
    '500': '#B85F76', '600': '#9D4B5F', '700': '#7E3B4C', '800': '#5F2D3A', '900': '#421F28',
  },
  heroImage: 'https://images.pexels.com/photos/3993449/pexels-photo-3993449.jpeg?auto=compress&cs=tinysrgb&w=900',
  founderName: { fr: 'Amina', ar: 'أمينة' },
  founderRole: { fr: 'Fondatrice & coiffeuse', ar: 'المؤسِّسة وخبيرة التصفيف' },
  story: { fr: '« La beauté n’est pas un luxe. C’est un rituel. »', ar: '«الجمالُ ليس رفاهية، بل طقسٌ يومي.»' },
  storyIntro: {
    fr: 'Depuis quinze ans au cœur d’Alger, nous recevons chaque cliente comme une invitée : un moment suspendu, des gestes précis, et le soin d’un métier transmis.',
    ar: 'منذ خمسة عشر عامًا في قلب الجزائر العاصمة، نستقبل كل عميلة كضيفة عزيزة: لحظة من الهدوء، لمسات دقيقة، وعناية حرفةٍ متوارثة.',
  },
  yearsOpen: 15,
  clientCount: 2500,
  rating: 4.9,
  reviewCount: 240,
};
