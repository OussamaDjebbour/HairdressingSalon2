import { Check, MessageCircle } from 'lucide-react';
import { useLang, type Lang } from '../../context/LanguageContext';
import { formatAlgiersTime, useMyRole, type AdminBooking, type AdminVisit } from '../../data/admin';
import { countText, formatAgo, nameInText, formatDayMonth, formatDuration, formatPrice, formatShortDayName } from '../../data/formatters';
import { useSalonInfo } from '../../data/salonSettings';
import { salonDate } from '../../data/week';
import { clientMessage, toWaNumber, waLink } from '../../data/whatsapp';
import { useBookingActions } from './useBookingActions';
import { Sheet } from './Sheet';
import { useSheetMotion } from './useSheetMotion';

interface PendingSheetProps {
  /** Website requests (one per visit) waiting for the owner's answer (past ones are left out). */
  visits: AdminVisit[];
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

export type Answered = { visit: AdminVisit; kind: 'confirmed' | 'cancelled' };

const shortDate = (b: AdminBooking, lang: Lang) => {
  const d = salonDate(b.startsAt);
  return `${formatShortDayName(d, lang)} ${formatDayMonth(d, lang)}`;
};
const minutesOf = (b: AdminBooking) => Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);

/** The waiting list: confirm or refuse each website request, then send the client her message. */
export function PendingSheet({ visits, answered, onAnswered, onOpen, onClose }: PendingSheetProps) {
  const { lang, t } = useLang();
  const demo = useMyRole() === 'demo';
  const salonWhatsapp = useSalonInfo().data?.whatsapp ?? null;
  const actions = useBookingActions((visit, kind) => onAnswered({ visit, kind }));
  const done = new Set(answered.map((a) => a.visit.id));
  const motion = useSheetMotion();

  const now = new Date();
  const waiting = visits.filter((v) => v.first.status === 'pending' && v.first.startsAt > now && !done.has(v.id));
  // Oldest request first: she has waited longest for an answer.
  const items = [...waiting.map((visit) => ({ visit, kind: null })), ...answered].sort(
    (a, b) => a.visit.first.createdAt.getTime() - b.visit.first.createdAt.getTime()
  );
  const n = waiting.length;
  const title = n === 0 ? t('admin.pending.allDone') : countText(t, lang, 'admin.pending.title', n);
  const busy = actions.pendingId !== null;

  // In the demo the message goes to the salon's own number, never to a client (no number: no link).
  const messageLink = ({ visit, kind }: Answered) => {
    const booking = visit.first;
    const number = demo ? (salonWhatsapp ? toWaNumber(salonWhatsapp) : null) : toWaNumber(booking.clientPhone);
    return number ? waLink(number, clientMessage(kind, { ...booking, serviceName: visit.serviceName })) : null;
  };

  return (
    <Sheet
      title={title}
      lead={n > 0 ? t(n === 1 ? 'admin.pending.leadOne' : 'admin.pending.leadMany') : undefined}
      onRequestClose={() => motion.dismiss(onClose)}
      motion={motion.state}
    >
      <ul className="space-y-3">
        {items.map((item) =>
          item.kind ? (
            <li
              key={item.visit.id}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${
                item.kind === 'confirmed' ? 'border-sage-200 bg-sage-50' : 'border-cream-200 bg-white'
              }`}
            >
              <div className="min-w-0 text-sm">
                <p className={`font-semibold ${item.kind === 'confirmed' ? 'text-sage-800' : 'text-rose-800'}`}>
                  {t(`admin.pending.${item.kind}`).replace('{name}', nameInText(item.visit.first.clientName, lang))}
                </p>
                <p className={item.kind === 'confirmed' ? 'text-sage-700' : 'text-rose-600'}>
                  {shortDate(item.visit.first, lang)} · <span dir="ltr">{formatAlgiersTime(item.visit.first.startsAt)}</span> · {item.visit.serviceName[lang]}
                </p>
              </div>
              {messageLink(item) && (
                <a href={messageLink(item)!} target="_blank" rel="noopener noreferrer" className="btn-whatsapp btn-sm tap shrink-0">
                  <MessageCircle className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                  {t('admin.summary.whatsapp')}
                </a>
              )}
            </li>
          ) : (
            <li key={item.visit.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 pt-3.5 pb-3">
              <button type="button" disabled={busy} onClick={() => motion.dismiss(() => onOpen(item.visit.first))} className="block w-full text-start disabled:cursor-wait">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-2xl font-semibold text-rose-900">
                    <span dir="ltr">{formatAlgiersTime(item.visit.first.startsAt)}</span>
                    <span className="ms-2 font-sans text-sm font-medium text-rose-600">{shortDate(item.visit.first, lang)}</span>
                  </span>
                  <span className="text-xs text-amber-800">{formatAgo(item.visit.first.createdAt, now, lang)}</span>
                </span>
                <span dir="auto" className="mt-1.5 block font-semibold text-rose-900 text-start">{item.visit.first.clientName}</span>
                {item.visit.parts.length > 1 ? (
                  <>
                    <span className="mt-0.5 block space-y-0.5 text-sm text-rose-700">
                      {item.visit.parts.map((p) => (
                        <span key={p.id} className="block">
                          {shortDate(p, lang) !== shortDate(item.visit.first, lang) && <>{shortDate(p, lang)} · </>}
                          <span dir="ltr">{formatAlgiersTime(p.startsAt)}</span> · {p.serviceName[lang]} · {p.stylistName}
                        </span>
                      ))}
                    </span>
                    <span className="mt-0.5 block text-sm text-rose-700">
                      {formatDuration(item.visit.parts.reduce((sum, p) => sum + minutesOf(p), 0), lang)} ·{' '}
                      <span className="whitespace-nowrap">{formatPrice(item.visit.price, lang)}</span>
                    </span>
                  </>
                ) : (
                  <span className="block text-sm text-rose-700">
                    {item.visit.first.serviceName[lang]} · {item.visit.first.stylistName} · {formatDuration(minutesOf(item.visit.first), lang)} ·{' '}
                    <span className="whitespace-nowrap">{formatPrice(item.visit.first.price, lang)}</span>
                  </span>
                )}
              </button>
              {actions.error && actions.errorId === item.visit.id && (
                <p role="alert" className="mt-3 rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">{actions.error}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy} onClick={() => actions.confirm(item.visit)} className="btn-primary btn-sm h-11 flex-1">
                  <Check className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                  {t('admin.confirm')}
                </button>
                <button type="button" disabled={busy} onClick={() => actions.refuse(item.visit)} className="btn-ghost btn-sm h-11 text-rust-700 hover:bg-rust-50">
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
