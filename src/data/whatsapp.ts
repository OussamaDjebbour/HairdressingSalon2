import type { Lang } from '../context/LanguageContext';
import { formatAlgiersTime, type AdminBooking } from './admin';
import { normalizePhone } from './bookings';
import { formatLongDate } from './formatters';
import { salonDate } from './week';

/**
 * The salon's WhatsApp number (international form, no "+").
 * PLACEHOLDER: replace with the owner's real number before go-live (spec, go-live step 4).
 */
export const SALON_WHATSAPP_NUMBER = '213561234567';

/** "0555 12 34 56" / "+213 555…" / "0555123456" → "213555123456", the form wa.me links expect. */
export function toWaNumber(phone: string): string {
  return `213${normalizePhone(phone).replace(/^0/, '')}`;
}

export function waLink(number: string, text?: string): string {
  return text === undefined ? `https://wa.me/${number}` : `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export type ClientMessageKind = 'confirmed' | 'cancelled' | 'moved';

type Vars = { name: string; date: string; time: string; service: string };

const templates: Record<Lang, Record<ClientMessageKind, (v: Vars) => string>> = {
  fr: {
    confirmed: (v) =>
      `Bonjour ${v.name}, votre rendez-vous du ${v.date} à ${v.time} (${v.service}) chez Élégance est confirmé. À bientôt !`,
    cancelled: (v) =>
      `Bonjour ${v.name}, nous sommes désolés : votre rendez-vous du ${v.date} à ${v.time} (${v.service}) chez Élégance est annulé. Répondez à ce message pour choisir un autre créneau.`,
    moved: (v) =>
      `Bonjour ${v.name}, votre rendez-vous chez Élégance a été déplacé au ${v.date} à ${v.time} (${v.service}). À bientôt !`,
  },
  ar: {
    confirmed: (v) =>
      `مرحباً ${v.name}، تم تأكيد موعدكِ يوم ${v.date} على الساعة ${v.time} (${v.service}) في صالون Élégance. نراكِ قريباً!`,
    cancelled: (v) =>
      `مرحباً ${v.name}، نعتذر منكِ: تم إلغاء موعدكِ يوم ${v.date} على الساعة ${v.time} (${v.service}) في صالون Élégance. ردّي على هذه الرسالة لاختيار موعد آخر.`,
    moved: (v) =>
      `مرحباً ${v.name}، تم تغيير موعدكِ في صالون Élégance إلى يوم ${v.date} على الساعة ${v.time} (${v.service}). نراكِ قريباً!`,
  },
};

/** The message the owner sends the client, in the client's language. */
export function clientMessage(
  kind: ClientMessageKind,
  b: Pick<AdminBooking, 'clientName' | 'startsAt' | 'serviceName' | 'lang'>
): string {
  return templates[b.lang][kind]({
    name: b.clientName,
    date: formatLongDate(salonDate(b.startsAt), b.lang),
    time: formatAlgiersTime(b.startsAt),
    service: b.serviceName[b.lang],
  });
}
