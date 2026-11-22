import { Scissors, Palette, Sparkles, Hand, Brush, Heart, Flower2, Gift, Eye, Droplets, Smile, HandHeart, type LucideIcon } from 'lucide-react';
import type { StoredCategory } from '../data/categories';

const icons: Record<string, LucideIcon> = {
  scissors: Scissors, palette: Palette, sparkles: Sparkles, hand: Hand, brush: Brush, heart: Heart, flower: Flower2, gift: Gift,
};

/** The icon for a stored icon key (falls back to the scissors). */
export const serviceIcon = (key: string): LucideIcon => icons[key] ?? Scissors;

const categoryIcons: Record<StoredCategory, LucideIcon> = {
  pack: Gift, coiffure: Scissors, capillaire: Droplets, visage: Smile, regard: Eye, ongles: Hand, epilation: Sparkles,
  maquillage: Brush, beaute: Heart, spa: Flower2, massage: HandHeart, custom: Sparkles,
};

export const categoryIcon = (category: StoredCategory): LucideIcon => categoryIcons[category];
