import { useLang } from '../context/LanguageContext';
import { formatPrice } from '../data/formatters';

/**
 * A price; while a promotion runs the regular price comes first, crossed out (read as "price au lieu de regular").
 * Each price never breaks, but the pair wraps onto two lines when the row is too narrow (phones), lined up on `align`.
 */
export function PriceTag({ price, regular, align = 'end' }: { price: number; regular: number | null; align?: 'start' | 'end' }) {
  const { lang, t } = useLang();
  if (regular === null) return <span className="whitespace-nowrap">{formatPrice(price, lang)}</span>;
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      <span className="whitespace-nowrap">{formatPrice(price, lang)}</span>{' '}
      <span className="order-first whitespace-nowrap">
        <span className="sr-only">{t('price.insteadOf')} </span>
        <span className="line-through opacity-70">{formatPrice(regular, lang)}</span>
      </span>
    </span>
  );
}
