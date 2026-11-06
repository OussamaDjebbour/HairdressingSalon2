import { Lang } from '../context/LanguageContext';

export function formatPrice(price: number, lang: Lang = 'fr'): string {
  const formatted = price
    .toLocaleString('fr-FR')
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ');
  const text = `${formatted} DA`;
  // In RTL text the digit groups and "DA" are laid out right-to-left ("DA 500 2").
  // Wrap the price in LEFT-TO-RIGHT ISOLATE \u2026 POP DIRECTIONAL ISOLATE so it stays one
  // LTR run \u2014 works in the page and in the plain-text WhatsApp message alike.
  return lang === 'ar' ? `\u2066${text}\u2069` : text;
}

export function formatDuration(minutes: number, lang: Lang = 'fr'): string {
  const unit = lang === 'ar' ? 'د' : 'min';
  return `${minutes} ${unit}`;
}

const dayNames: Record<Lang, string[]> = {
  fr: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'],
  ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
};

const monthNames: Record<Lang, string[]> = {
  fr: [
    'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  ],
  ar: [
    'جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان',
    'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ],
};

export function formatLongDate(date: Date, lang: Lang = 'fr'): string {
  const day = dayNames[lang][date.getDay()];
  const dayNum = date.getDate();
  const month = monthNames[lang][date.getMonth()];
  return `${day} ${dayNum} ${month}`;
}

export function formatShortDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

export function formatTime(time: string): string {
  return time;
}
