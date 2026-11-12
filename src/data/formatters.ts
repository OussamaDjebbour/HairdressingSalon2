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

export type PluralCategory = 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * The plural form a count takes (CLDR rules). French: 0 and 1 are singular. Arabic: 1 singular,
 * 2 dual, 3–10 plural, 11–99 singular (accusative), the rest (0, 100…) plain.
 */
export function pluralCategory(n: number, lang: Lang): PluralCategory {
  if (lang === 'fr') return n <= 1 ? 'one' : 'other';
  const last2 = n % 100;
  if (n === 1) return 'one';
  if (n === 2) return 'two';
  if (last2 >= 3 && last2 <= 10) return 'few';
  if (last2 >= 11 && last2 <= 99) return 'many';
  return 'other';
}

const arabicAgo: Record<'min' | 'h' | 'd', Record<PluralCategory, string>> = {
  min: { one: 'منذ دقيقة', two: 'منذ دقيقتين', few: 'منذ {n} دقائق', many: 'منذ {n} دقيقة', other: 'منذ {n} دقيقة' },
  h: { one: 'منذ ساعة', two: 'منذ ساعتين', few: 'منذ {n} ساعات', many: 'منذ {n} ساعة', other: 'منذ {n} ساعة' },
  d: { one: 'منذ يوم', two: 'منذ يومين', few: 'منذ {n} أيام', many: 'منذ {n} يومًا', other: 'منذ {n} يوم' },
};

/** "à l’instant" / "il y a 5 min" / "il y a 3 h" / "il y a 2 j" (whole units, rounded down; never negative). */
export function formatAgo(date: Date, now: Date, lang: Lang = 'fr'): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60000));
  if (minutes === 0) return lang === 'ar' ? 'الآن' : 'à l’instant';
  const [n, unit]: [number, 'min' | 'h' | 'd'] =
    minutes < 60 ? [minutes, 'min'] : minutes < 24 * 60 ? [Math.floor(minutes / 60), 'h'] : [Math.floor(minutes / (24 * 60)), 'd'];
  if (lang === 'ar') return arabicAgo[unit][pluralCategory(n, 'ar')].replace('{n}', String(n));
  return `il y a ${n} ${unit === 'd' ? 'j' : unit}`;
}

/** The translation of a counted phrase: looks up `${key}.${category}` and fills in {n}. */
export function countText(t: (key: string) => string, lang: Lang, key: string, n: number): string {
  return t(`${key}.${pluralCategory(n, lang)}`).replace('{n}', String(n));
}

/**
 * A name placed inside a sentence. In Arabic it is wrapped in FIRST STRONG ISOLATE … POP DIRECTIONAL
 * ISOLATE so a Latin name keeps its own order ("Lina M." would otherwise show as ".Lina M").
 */
export function nameInText(name: string, lang: Lang): string {
  return lang === 'ar' ? `\u2068${name}\u2069` : name;
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
