import { Check, MessageCircle } from 'lucide-react';
import { useLang, type Lang } from '../../context/LanguageContext';
import { formatAlgiersTime, useMyRole, type AdminBooking } from '../../data/admin';
import { countText, formatAgo, nameInText, formatDayMonth, formatDuration, formatPrice, formatShortDayName } from '../../data/formatters';
import { useSalonInfo } from '../../data/salonSettings';
import { salonDate } from '../../data/week';
import { clientMessage, toWaNumber, waLink } from '../../data/whatsapp';
import { useBookingActions } from './useBookingActions';
import { Sheet } from './Sheet';

interface PendingSheetProps {
  /** Website bookings waiting for the owner's answer (past ones are left out). */
  bookings: AdminBooking[];
  /**
   * Requests answered since the list was opened. They stay listed (with their message) until the
   * list itself is closed, even after the refreshed bookings drop them or a booking is opened from it,
   * so the caller keeps them.
   */
  answered: Answered[];
  onAnswered(answer: Answered): void;
  /** Tapping a card's details opens that booking. */
  onOpen(booking: AdminBooking): void;
  onClose(): void;
}

export type Answered = { booking: AdminBooking; kind: 'confirmed' | 'cancelled' };

const shortDate = (b: AdminBooking, lang: Lang) => {
  const d = salonDate(b.startsAt);
  return `${formatShortDayName(d, lang)} ${formatDayMonth(d, lang)}`;
};
const minutesOf = (b: AdminBooking) => Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);

/** The waiting list: confirm or refuse each website request, then send the client her message. */
export function PendingSheet({ bookings, answered, onAnswered, onOpen, onClose }: PendingSheetProps) {
  const { lang, t } = useLang();
  const demo = useMyRole() === 'demo';
  const salonWhatsapp = useSalonInfo().data?.whatsapp ?? null;
  const actions = useBookingActions((booking, kind) => onAnswered({ booking, kind }));
  const done = new Set(answered.map((a) => a.booking.id));

  const now = new Date();
  const waiting = bookings.filter((b) => b.status === 'pending' && b.startsAt > now && !done.has(b.id));
  // Oldest request first: she has waited longest for an answer.
  const items = [...waiting.map((booking) => ({ booking, kind: null })), ...answered].sort(
    (a, b) => a.booking.createdAt.getTime() - b.booking.createdAt.getTime()
  );
  const n = waiting.length;
  const title = n === 0 ? t('admin.pending.allDone') : countText(t, lang, 'admin.pending.title', n);
  const busy = actions.pendingId !== null;

  // In the demo the message goes to the salon's own number, never to a client (no number: no link).
  const messageLink = ({ booking, kind }: Answered) => {
    const number = demo ? (salonWhatsapp ? toWaNumber(salonWhatsapp) : null) : toWaNumber(booking.clientPhone);
    return number ? waLink(number, clientMessage(kind, booking)) : null;
  };

  return (
    <Sheet
      title={title}
      lead={n > 0 ? t(n === 1 ? 'admin.pending.leadOne' : 'admin.pending.leadMany') : undefined}
      onRequestClose={onClose}
    >
      <ul className="space-y-3">
        {items.map((item) =>
          item.kind ? (
            <li
              key={item.booking.id}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${
                item.kind === 'confirmed' ? 'border-sage-200 bg-sage-50' : 'border-cream-200 bg-white'
              }`}
            >
              <div className="min-w-0 text-sm">
                <p className={`font-semibold ${item.kind === 'confirmed' ? 'text-sage-800' : 'text-rose-800'}`}>
                  {t(`admin.pending.${item.kind}`).replace('{name}', nameInText(item.booking.clientName, lang))}
                </p>
                <p className={item.kind === 'confirmed' ? 'text-sage-700' : 'text-rose-600'}>
                  {shortDate(item.booking, lang)} · <span dir="ltr">{formatAlgiersTime(item.booking.startsAt)}</span> · {item.booking.serviceName[lang]}
                </p>
              </div>
              {messageLink(item) && (
                <a href={messageLink(item)!} target="_blank" rel="noopener noreferrer" className="btn-whatsapp btn-sm shrink-0">
                  <MessageCircle className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                  {t('admin.summary.whatsapp')}
                </a>
              )}
            </li>
          ) : (
            <li key={item.booking.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 pt-3.5 pb-3">
              <button type="button" disabled={busy} onClick={() => onOpen(item.booking)} className="block w-full text-start disabled:cursor-wait">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-2xl font-semibold text-rose-900">
                    <span dir="ltr">{formatAlgiersTime(item.booking.startsAt)}</span>
                    <span className="ms-2 font-sans text-sm font-medium text-rose-600">{shortDate(item.booking, lang)}</span>
                  </span>
                  <span className="text-xs text-amber-800">{formatAgo(item.booking.createdAt, now, lang)}</span>
                </span>
                <span dir="auto" className="mt-1.5 block font-semibold text-rose-900 text-start">{item.booking.clientName}</span>
                <span className="block text-sm text-rose-700">
                  {item.booking.serviceName[lang]} · {item.booking.stylistName} · {formatDuration(minutesOf(item.booking), lang)} ·{' '}
                  <span className="whitespace-nowrap">{formatPrice(item.booking.price, lang)}</span>
                </span>
              </button>
              {actions.error && actions.errorId === item.booking.id && (
                <p role="alert" className="mt-3 rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">{actions.error}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} onClick={() => actions.confirm(item.booking)} className="btn-primary btn-sm h-11 flex-1">
                  <Check className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                  {t('admin.confirm')}
                </button>
                <button type="button" disabled={busy} onClick={() => actions.refuse(item.booking)} className="btn-ghost btn-sm h-11">
                  {t('admin.summary.refuse')}
                </button>
              </div>
            </li>
          )
        )}
      </ul>
    </Sheet>
  );
}
