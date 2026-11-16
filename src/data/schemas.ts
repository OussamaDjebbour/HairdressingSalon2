import { z } from 'zod';
import { isValidPhone } from './bookings';
import type { Period } from './period';

/** i18n keys of the validation messages; fields render them through t(). */
export const MSG = {
  required: 'form.error.required',
  nameRequired: 'form.error.nameRequired',
  nameLength: 'form.error.nameLength',
  phoneRequired: 'form.error.phoneRequired',
  phone: 'form.error.phone',
  url: 'form.error.url',
  periodRequired: 'form.error.periodRequired',
  emailRequired: 'form.error.emailRequired',
  email: 'form.error.email',
  passwordRequired: 'form.error.passwordRequired',
} as const;

export const clientNameSchema = z
  .string()
  .trim()
  .superRefine((v, ctx) => {
    if (v === '') ctx.addIssue({ code: 'custom', message: MSG.nameRequired });
    else if (v.length < 2 || v.length > 80) ctx.addIssue({ code: 'custom', message: MSG.nameLength });
  });

export const mobilePhoneSchema = z.string().superRefine((v, ctx) => {
  if (v.trim() === '') ctx.addIssue({ code: 'custom', message: MSG.phoneRequired });
  else if (!isValidPhone(v)) ctx.addIssue({ code: 'custom', message: MSG.phone });
});

export const optionalMobilePhoneSchema = z.string().superRefine((v, ctx) => {
  if (v.trim() !== '' && !isValidPhone(v)) ctx.addIssue({ code: 'custom', message: MSG.phone });
});

export const optionalHttpsUrlSchema = z.string().superRefine((v, ctx) => {
  if (v.trim() !== '' && !/^https:\/\//.test(v.trim())) ctx.addIssue({ code: 'custom', message: MSG.url });
});

export const periodSchema = z.custom<Period | null>().superRefine((v, ctx) => {
  if (v == null) ctx.addIssue({ code: 'custom', message: MSG.periodRequired });
  else if (v.from.getTime() > v.to.getTime()) ctx.addIssue({ code: 'custom', message: MSG.periodRequired });
});

export const clientDetailsSchema = z.object({ clientName: clientNameSchema, clientPhone: mobilePhoneSchema });
export type ClientDetails = z.infer<typeof clientDetailsSchema>;

/** The Promotion part of a service or pack form (mirrors the server's invalid_promo: all or none,
 *  0 <= promo < price, first day <= last day). Issues carry an i18n key. */
export const PROMO_MSG = 'settings.error.invalid_promo';
export function checkPromo(
  v: { price: string; promoPrice: string; promoPeriod: Period | null },
  ctx: z.RefinementCtx
): void {
  const priceText = v.promoPrice.trim();
  if (priceText === '' && !v.promoPeriod) return;
  if (!/^\d+$/.test(priceText)) {
    ctx.addIssue({ code: 'custom', path: ['promoPrice'], message: PROMO_MSG });
  } else {
    const price = /^\d+$/.test(v.price.trim()) ? parseInt(v.price.trim(), 10) : null;
    if (price !== null && parseInt(priceText, 10) >= price) ctx.addIssue({ code: 'custom', path: ['promoPrice'], message: PROMO_MSG });
  }
  if (!v.promoPeriod || v.promoPeriod.from.getTime() > v.promoPeriod.to.getTime()) {
    ctx.addIssue({ code: 'custom', path: ['promoPeriod'], message: PROMO_MSG });
  }
}
