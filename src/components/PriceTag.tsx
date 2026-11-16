import { useLang } from '../context/LanguageContext';
import { formatPrice } from '../data/formatters';

/** A price; while a promotion runs the regular price comes first, crossed out (read as "price au lieu de regular"). */
export function PriceTag({ price, regular }: { price: number; regular: number | null }) {
  const { lang, t } = useLang();
  if (regular === null) return <>{formatPrice(price, lang)}</>;
  return (
    <span className="inline-flex items-baseline gap-2">
      <span>{formatPrice(price, lang)}</span>{' '}
      <span className="order-first">
        <span className="sr-only">{t('price.insteadOf')} </span>
        <span className="line-through opacity-60">{formatPrice(regular, lang)}</span>
      </span>
    </span>
  );
}
