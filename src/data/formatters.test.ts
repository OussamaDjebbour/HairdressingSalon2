import { describe, it, expect } from 'vitest';
import { formatAgo, formatClaim, formatCompactDate, formatCompactRange, formatMonthYear, formatNumber, formatPrice, nameInText, pluralCategory, weekdayInitials } from './formatters';

const LRI = '⁦'; // LEFT-TO-RIGHT ISOLATE
const PDI = '⁩'; // POP DIRECTIONAL ISOLATE

describe('formatPrice', () => {
  it('formats French prices with fr-FR grouping and a DA suffix', () => {
    expect(formatPrice(2500, 'fr')).toBe('2 500 DA');
  });

  it('isolates Arabic prices as one left-to-right run so RTL text shows "2 500 DA", not "DA 500 2"', () => {
    expect(formatPrice(2500, 'ar')).toBe(`${LRI}2 500 DA${PDI}`);
  });

  it('defaults to French', () => {
    expect(formatPrice(800)).toBe('800 DA');
  });
});

describe('formatClaim / formatNumber', () => {
  it('shows claims with French digits in both languages (Élégance AR as before)', () => {
    expect(formatClaim(15)).toBe('15');
    expect(formatClaim(2500)).toBe('2 500');
    expect(formatClaim(4.9)).toBe('4,9');
  });

  it('shows counts in the language\'s own digits', () => {
    expect(formatNumber(240, 'fr')).toBe('240');
    expect(formatNumber(240, 'ar')).toBe('٢٤٠');
  });
});

describe('formatAgo', () => {
  const now = new Date('2030-01-08T12:00:00Z');
  it('counts minutes, hours, then days', () => {
    expect(formatAgo(new Date('2030-01-08T11:55:00Z'), now, 'fr')).toBe('il y a 5 min');
    expect(formatAgo(new Date('2030-01-08T09:00:00Z'), now, 'fr')).toBe('il y a 3 h');
    expect(formatAgo(new Date('2030-01-06T12:00:00Z'), now, 'fr')).toBe('il y a 2 j');
  });
  it('says "à l’instant" under a minute', () => {
    expect(formatAgo(new Date('2030-01-08T11:59:30Z'), now, 'fr')).toBe('à l’instant');
    expect(formatAgo(new Date('2030-01-08T11:59:30Z'), now, 'ar')).toBe('الآن');
  });
  it('uses the Arabic singular, dual, plural and 11+ forms', () => {
    const ago = (ms: number) => formatAgo(new Date(now.getTime() - ms), now, 'ar');
    const MIN = 60000;
    expect(ago(1 * MIN)).toBe('منذ دقيقة');
    expect(ago(2 * MIN)).toBe('منذ دقيقتين');
    expect(ago(5 * MIN)).toBe('منذ 5 دقائق');
    expect(ago(15 * MIN)).toBe('منذ 15 دقيقة');
    expect(ago(3 * 60 * MIN)).toBe('منذ 3 ساعات');
    expect(ago(2 * 24 * 60 * MIN)).toBe('منذ يومين');
    expect(ago(12 * 24 * 60 * MIN)).toBe('منذ 12 يومًا');
  });
});

describe('pluralCategory', () => {
  it('French: 0 and 1 are singular', () => {
    expect([0, 1, 2, 11].map((n) => pluralCategory(n, 'fr'))).toEqual(['one', 'one', 'other', 'other']);
  });
  it('Arabic: one, two, few (3–10), many (11–99), other', () => {
    expect([1, 2, 3, 10, 11, 99, 100, 103, 0].map((n) => pluralCategory(n, 'ar'))).toEqual([
      'one', 'two', 'few', 'few', 'many', 'many', 'other', 'few', 'other',
    ]);
  });
});

describe('nameInText', () => {
  it('isolates a name inside Arabic text so a Latin "Lina M." keeps its dot at the end', () => {
    expect(nameInText('Lina M.', 'ar')).toBe('\u2068Lina M.\u2069');
  });
  it('leaves French text alone', () => {
    expect(nameInText('Lina M.', 'fr')).toBe('Lina M.');
  });
});

describe('calendar labels', () => {
  it('names the month with its year', () => {
    expect(formatMonthYear(new Date(2026, 10, 1), 'fr')).toBe('Novembre 2026');
    expect(formatMonthYear(new Date(2026, 10, 1), 'ar')).toBe('نوفمبر 2026');
  });
  it('gives the weekday initials from Sunday', () => {
    expect(weekdayInitials('fr')).toEqual(['D', 'L', 'M', 'M', 'J', 'V', 'S']);
    expect(weekdayInitials('ar')).toEqual(['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']);
  });
});

describe('formatCompactDate', () => {
  it('French: short day, day, short month', () => {
    expect(formatCompactDate(new Date(2026, 10, 12), 'fr')).toBe('Jeu. 12 nov.');
    expect(formatCompactDate(new Date(2026, 4, 1), 'fr')).toBe('Ven. 1 mai');
    expect(formatCompactDate(new Date(2026, 7, 2), 'fr')).toBe('Dim. 2 août');
  });

  it('Arabic: the Arabic day name, day and month', () => {
    expect(formatCompactDate(new Date(2026, 10, 12), 'ar')).toBe('الخميس 12 نوفمبر');
  });
});

describe('formatCompactRange', () => {
  it('one day is one date', () => {
    expect(formatCompactRange(new Date(2026, 10, 20), new Date(2026, 10, 20), 'fr')).toBe('Ven. 20 nov.');
  });

  it('names the month once when both days share it', () => {
    expect(formatCompactRange(new Date(2026, 10, 20), new Date(2026, 10, 22), 'fr')).toBe('Ven. 20 → Dim. 22 nov.');
    expect(formatCompactRange(new Date(2026, 10, 20), new Date(2026, 10, 22), 'ar')).toBe('الجمعة 20 ← الأحد 22 نوفمبر'); // reads right to left
  });

  it('names both months when they differ', () => {
    expect(formatCompactRange(new Date(2026, 10, 30), new Date(2026, 11, 2), 'fr')).toBe('Lun. 30 nov. → Mer. 2 déc.');
    expect(formatCompactRange(new Date(2026, 11, 30), new Date(2027, 0, 2), 'fr')).toBe('Mer. 30 déc. → Sam. 2 janv.');
  });
});
