import type { Lang } from '../context/LanguageContext';
import { formatAlgiersTime, type AdminBooking } from './admin';
import { currentSalon } from './salon';
import { normalizePhone } from './bookings';
import { formatLongDate, nameInText } from './formatters';
import { salonDate } from './week';

/** "0555 12 34 56" / "+213 555…" / "0555123456" → "213555123456", the form wa.me links expect. */
export function toWaNumber(phone: string): string {
  return `213${normalizePhone(phone).replace(/^0/, '')}`;
}

export function waLink(number: string, text?: string): string {
  return text === undefined ? `https://wa.me/${number}` : `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export type ClientMessageKind = 'confirmed' | 'cancelled' | 'moved';

type Vars = { salon: string; name: string; date: string; time: string; service: string };

const templates: Record<Lang, Record<ClientMessageKind, (v: Vars) => string>> = {
  fr: {
    confirmed: (v) =>
      `Bonjour ${v.name}, votre rendez-vous du ${v.date} à ${v.time} (${v.service}) chez ${v.salon} est confirmé. À bientôt !`,
    cancelled: (v) =>
      `Bonjour ${v.name}, nous sommes désolés : votre rendez-vous du ${v.date} à ${v.time} (${v.service}) chez ${v.salon} est annulé. Répondez à ce message pour choisir un autre créneau.`,
    moved: (v) =>
      `Bonjour ${v.name}, votre rendez-vous chez ${v.salon} a été déplacé au ${v.date} à ${v.time} (${v.service}). À bientôt !`,
  },
  ar: {
    confirmed: (v) =>
      `مرحباً ${v.name}، تم تأكيد موعدكِ يوم ${v.date} على الساعة ${v.time} (${v.service}) في صالون ${v.salon}. نراكِ قريباً!`,
    cancelled: (v) =>
      `مرحباً ${v.name}، نعتذر منكِ: تم إلغاء موعدكِ يوم ${v.date} على الساعة ${v.time} (${v.service}) في صالون ${v.salon}. ردّي على هذه الرسالة لاختيار موعد آخر.`,
    moved: (v) =>
      `مرحباً ${v.name}، تم تغيير موعدكِ في صالون ${v.salon} إلى يوم ${v.date} على الساعة ${v.time} (${v.service}). نراكِ قريباً!`,
  },
};

/** The message the owner sends the client, in the client's language. */
export function clientMessage(
  kind: ClientMessageKind,
  b: Pick<AdminBooking, 'clientName' | 'startsAt' | 'serviceName' | 'lang'>
): string {
  return templates[b.lang][kind]({
    // Names may be Latin inside an Arabic message: isolated so they keep their order.
    salon: nameInText(currentSalon().name[b.lang], b.lang),
    name: nameInText(b.clientName, b.lang),
    date: formatLongDate(salonDate(b.startsAt), b.lang),
    time: formatAlgiersTime(b.startsAt),
    service: b.serviceName[b.lang],
  });
}
