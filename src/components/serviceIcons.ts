import { Scissors, Palette, Sparkles, Hand, Brush, Heart, Flower2, Gift, type LucideIcon } from 'lucide-react';
import type { Category } from '../data/categories';

const icons: Record<string, LucideIcon> = {
  scissors: Scissors, palette: Palette, sparkles: Sparkles, hand: Hand, brush: Brush, heart: Heart, flower: Flower2, gift: Gift,
};

/** The icon for a stored icon key (falls back to the scissors). */
export const serviceIcon = (key: string): LucideIcon => icons[key] ?? Scissors;

const categoryIcons: Record<Category, LucideIcon> = { pack: Gift, coiffure: Scissors, beaute: Sparkles, spa: Flower2 };

export const categoryIcon = (category: Category): LucideIcon => categoryIcons[category];
