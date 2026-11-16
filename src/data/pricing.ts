import type { Service } from './types';
import { algiersTodayYmd } from './algiersTime';

/** The price to charge today. `regular` is the crossed-out price while a promotion runs (both days inclusive). */
export function effectivePrice(
  s: Pick<Service, 'price' | 'promo'>,
  today: string = algiersTodayYmd(),
): { price: number; regular: number | null } {
  const p = s.promo;
  if (p && today >= p.from && today <= p.to) return { price: p.price, regular: s.price };
  return { price: s.price, regular: null };
}
