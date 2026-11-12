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
