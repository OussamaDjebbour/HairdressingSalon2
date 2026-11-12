import { useId, useState } from 'react';
import { Check, MessageCircle, X } from 'lucide-react';
import { useLang, type Lang } from '../../context/LanguageContext';
import { formatAlgiersTime, useMyRole, type AdminBooking } from '../../data/admin';
import { formatAgo, formatDayMonth, formatDuration, formatPrice, formatShortDayName } from '../../data/formatters';
import { useSalonInfo } from '../../data/salonSettings';
import { salonDate } from '../../data/week';
import { clientMessage, toWaNumber, waLink } from '../../data/whatsapp';
import { useBookingActions } from './useBookingActions';
import { useSheetDialog } from './useSheetDialog';

interface PendingSheetProps {
  /** Website bookings waiting for the owner's answer (past ones are left out). */
  bookings: AdminBooking[];
  /** Tapping a card's details opens that booking. */
  onOpen(booking: AdminBooking): void;
  onClose(): void;
}

type Done = { booking: AdminBooking; kind: 'confirmed' | 'cancelled' };

const shortDate = (b: AdminBooking, lang: Lang) => {
  const d = salonDate(b.startsAt);
  return `${formatShortDayName(d, lang)} ${formatDayMonth(d, lang)}`;
};
const minutesOf = (b: AdminBooking) => Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);

/** The waiting list: confirm or refuse each website request, then send the client her message. */
export function PendingSheet({ bookings, onOpen, onClose }: PendingSheetProps) {
  const { lang, t } = useLang();
  const titleId = useId();
  const demo = useMyRole() === 'demo';
  const salonWhatsapp = useSalonInfo().data?.whatsapp ?? null;
  // Answered requests stay listed (with their message) until the sheet closes, even once the
  // refreshed bookings no longer include them.
  const [done, setDone] = useState<Record<string, Done>>({});
  const actions = useBookingActions((booking, kind) => setDone((d) => ({ ...d, [booking.id]: { booking, kind } })));
  const [lastTried, setLastTried] = useState<string | null>(null);
  const dialogRef = useSheetDialog(onClose);

  const now = new Date();
  const waiting = bookings.filter((b) => b.status === 'pending' && b.startsAt > now && !done[b.id]);
  // Oldest request first: she has waited longest for an answer.
  const items = [...waiting.map((booking) => ({ booking, kind: null })), ...Object.values(done)].sort(
    (a, b) => a.booking.createdAt.getTime() - b.booking.createdAt.getTime()
  );
  const n = waiting.length;
  const title =
    n === 0 ? t('admin.pending.allDone') : n === 1 ? t('admin.pending.titleOne') : t('admin.pending.titleMany').replace('{n}', String(n));

  const act = (b: AdminBooking, action: 'confirm' | 'refuse') => {
    setLastTried(b.id);
    actions[action](b);
  };
  const messageLink = ({ booking, kind }: Done) => {
    // In the demo the message goes to the salon's own number, never to a client.
    const number = demo ? toWaNumber(salonWhatsapp ?? '') : toWaNumber(booking.clientPhone);
    return waLink(number, clientMessage(kind, booking));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-rose-950/40 animate-fadeIn" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-cream-50 rounded-t-3xl sm:rounded-3xl shadow-lift p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 id={titleId} className="font-display text-xl font-semibold text-rose-900">{title}</h2>
            {n > 0 && <p className="mt-1 text-sm text-rose-600">{t(n === 1 ? 'admin.pending.leadOne' : 'admin.pending.leadMany')}</p>}
          </div>
          <button type="button" onClick={onClose} className="btn-ghost btn-sm" aria-label={t('admin.sheet.close')}>
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

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
                    {t(`admin.pending.${item.kind}`).replace('{name}', item.booking.clientName)}
                  </p>
                  <p className={item.kind === 'confirmed' ? 'text-sage-700' : 'text-rose-600'}>
                    {shortDate(item.booking, lang)} · <span dir="ltr">{formatAlgiersTime(item.booking.startsAt)}</span> · {item.booking.serviceName[lang]}
                  </p>
                </div>
                <a href={messageLink(item)} target="_blank" rel="noopener noreferrer" className="btn-whatsapp btn-sm shrink-0">
                  <MessageCircle className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
                  {t('admin.summary.whatsapp')}
                </a>
              </li>
            ) : (
              <li key={item.booking.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <button type="button" onClick={() => onOpen(item.booking)} className="block w-full text-start">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-display text-2xl font-semibold text-rose-900">
                      <span dir="ltr">{formatAlgiersTime(item.booking.startsAt)}</span>
                      <span className="ms-2 font-sans text-sm font-medium text-rose-600">{shortDate(item.booking, lang)}</span>
                    </span>
                    <span className="text-xs text-amber-800">{formatAgo(item.booking.createdAt, now, lang)}</span>
                  </span>
                  <span className="mt-1.5 block font-semibold text-rose-900">{item.booking.clientName}</span>
                  <span className="block text-sm text-rose-700">
                    {item.booking.serviceName[lang]} · {item.booking.stylistName} · {formatDuration(minutesOf(item.booking), lang)} ·{' '}
                    <span className="whitespace-nowrap">{formatPrice(item.booking.price, lang)}</span>
                  </span>
                </button>
                {actions.error && lastTried === item.booking.id && (
                  <p role="alert" className="mt-3 rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">{actions.error}</p>
                )}
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={actions.pendingId !== null} onClick={() => act(item.booking, 'confirm')} className="btn-primary flex-1">
                    <Check className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                    {t('admin.confirm')}
                  </button>
                  <button type="button" disabled={actions.pendingId !== null} onClick={() => act(item.booking, 'refuse')} className="btn-ghost">
                    {t('admin.summary.refuse')}
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
}
