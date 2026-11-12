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

export function formatDayName(date: Date, lang: Lang = 'fr'): string {
  return dayNames[lang][date.getDay()];
}

/** Compact day label for tight spaces (week strip): "Mar" in French; Arabic names are already short. */
export function formatShortDayName(date: Date, lang: Lang = 'fr'): string {
  const name = dayNames[lang][date.getDay()];
  return lang === 'fr' ? name.slice(0, 3) : name;
}

export function formatLongDate(date: Date, lang: Lang = 'fr'): string {
  const day = dayNames[lang][date.getDay()];
  const dayNum = date.getDate();
  const month = monthNames[lang][date.getMonth()];
  return `${day} ${dayNum} ${month}`;
}

/** "16 mars" / "16 مارس". */
export function formatDayMonth(date: Date, lang: Lang = 'fr'): string {
  return `${date.getDate()} ${monthNames[lang][date.getMonth()]}`;
}

export function formatShortDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

export function formatTime(time: string): string {
  return time;
}

/** "0561234567" → "0561 23 45 67" (other shapes are returned as given). */
export function formatPhone(phone: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})$/.exec(phone.replace(/\s/g, ''));
  return m ? m.slice(1).join(' ') : phone;
}

/** A plain number in the language's own digits and separators ("2 500", "4,9", "٢٤٠"). */
export function formatNumber(n: number, lang: Lang = 'fr'): string {
  return n.toLocaleString(lang === 'ar' ? 'ar-EG' : 'fr-FR').replace(/\s/g, ' ');
}

/**
 * A salon claim (years open, clients, rating) as the site has always shown it, in both
 * languages: French digits and separators ("15", "2 500", "4,9"). Counts use formatNumber.
 */
export function formatClaim(n: number): string {
  return formatNumber(n, 'fr');
}

/** The hero/footer sentence naming the city, with French elision ("au cœur d’Alger", "au cœur de Blida"). */
export function salonSubtitle(t: (key: string) => string, lang: Lang, city: string | undefined): string {
  const name = city?.trim();
  if (!name) return t('hero.subtitleNoCity');
  const text = t('hero.subtitle');
  if (lang === 'ar') return text.replace('{city}', name);
  const vowelOrH = /^[aeiouyh]/i.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  return text.replace('de {city}', vowelOrH ? `d\u2019${name}` : `de ${name}`);
}
