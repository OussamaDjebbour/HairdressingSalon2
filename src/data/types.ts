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

export interface Stylist {
  id: string;
  name: string;
  role: Record<Lang, string>;
  specialties: Record<Lang, string>[];
  image: string;
}
