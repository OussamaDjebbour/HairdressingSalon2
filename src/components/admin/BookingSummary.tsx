import { CalendarClock, Check, MessageCircle, Phone, X } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { canManageVisit, formatAlgiersTime, liveParts, useMyRole, type AdminBooking, type AdminVisit } from '../../data/admin';
import { formatAgo, formatLongDate, formatPhone, formatPrice } from '../../data/formatters';
import { useSalonInfo } from '../../data/salonSettings';
import { salonDate } from '../../data/week';
import { toWaNumber, waLink } from '../../data/whatsapp';
import { Badge } from '../Badge';

interface BookingSummaryProps {
  /** The part that was opened. */
  booking: AdminBooking;
  visit: AdminVisit;
  onConfirm(): void;
  onRefuse(): void;
  onMessage(): void;
  onCancel(): void;
  onEdit(): void;
  onMove(): void;
  onRemovePart(part: AdminBooking): void;
  busy: boolean;
  error: string | null;
}

/** An existing booking at a glance, with the one action the owner most likely wants first. */
export function BookingSummary({ booking: b, visit, onConfirm, onRefuse, onMessage, onCancel, onEdit, onMove, onRemovePart, busy, error }: BookingSummaryProps) {
  const { lang, t } = useLang();
  const demo = useMyRole() === 'demo';
  const salonWhatsapp = useSalonInfo().data?.whatsapp ?? null;
  // The demo account sees masked numbers: no call shortcut, and WhatsApp opens the salon's own chat.
  const chatNumber = demo ? (salonWhatsapp ? toWaNumber(salonWhatsapp) : null) : toWaNumber(b.clientPhone);

  // A cancelled visit has no live part: list them all so the sheet isn't empty.
  const live = liveParts(visit);
  const listed = live.length > 0 ? live : visit.parts;
  const total = listed.reduce((sum, p) => sum + p.price, 0);
  const { remove: canRemove, move: canMove } = canManageVisit(visit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={b.status}>{t(b.status === 'pending' ? 'admin.summary.toConfirm' : `schedule.${b.status}`)}</Badge>
        <span className="text-xs text-rose-600">
          {b.source === 'online'
            ? `${t('schedule.source.online')} · ${formatAgo(b.createdAt, new Date(), lang)}`
            : t('schedule.source.staff')}
        </span>
      </div>

      <div>
        <p className="font-display text-3xl font-semibold text-rose-900 leading-none">
          <span dir="ltr">{`${formatAlgiersTime(b.startsAt)} – ${formatAlgiersTime(b.endsAt)}`}</span>
        </p>
        <p className="mt-1.5 text-sm text-rose-700">{formatLongDate(salonDate(b.startsAt), lang)}</p>
      </div>

      <div className="rounded-2xl bg-white border border-cream-200 p-4">
        <p dir="auto" className="font-semibold text-rose-900 text-start">{b.clientName}</p>
        <p className="mt-0.5 text-sm text-rose-700" dir="ltr">{formatPhone(b.clientPhone)}</p>
        <div className="mt-3 flex gap-2">
          {!demo && (
            <a href={`tel:${b.clientPhone}`} className="btn-secondary btn-sm tap flex-1">
              <Phone className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
              {t('admin.summary.call')}
            </a>
          )}
          {chatNumber && (
            <a href={waLink(chatNumber)} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm tap flex-1">
              <MessageCircle className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
              {t('admin.summary.whatsapp')}
            </a>
          )}
        </div>
      </div>

      {listed.length > 1 ? (
        <div>
          <p id="visit-parts" className="text-sm font-semibold text-rose-900">{t('admin.summary.visit')}</p>
          <ul aria-labelledby="visit-parts" className="mt-1 text-sm">
            {listed.map((p) => (
              <li
                key={p.id}
                aria-current={p.id === b.id ? 'true' : undefined}
                className={`flex items-center gap-2 py-2 border-b border-cream-200 ${p.id === b.id ? 'font-semibold text-rose-900' : 'text-rose-700'}`}
              >
                <span dir="ltr">{formatAlgiersTime(p.startsAt)}</span>{' '}
                <span dir="auto" className="flex-1 text-start">{p.serviceName[lang]} · {p.stylistName}</span>
                {canRemove && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onRemovePart(p)}
                    aria-label={t('admin.summary.removePartLabel').replace('{service}', p.serviceName[lang])}
                    className="btn-ghost btn-sm tap text-rust-700 hover:bg-rust-50"
                  >
                    {t('admin.summary.removePart')}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <dl className="text-sm">
            <Row label={t('admin.summary.total')} value={formatPrice(total, lang)} />
          </dl>
        </div>
      ) : (
        <dl className="text-sm">
          <Row label={t('admin.sheet.service')} value={b.serviceName[lang]} />
          <Row label={t('admin.sheet.stylist')} value={b.stylistName} />
          <Row label={t('admin.summary.price')} value={formatPrice(b.price, lang)} />
        </dl>
      )}

      {error && (
        <p role="alert" className="rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {b.status === 'confirmed' ? (
          <>
            <button type="button" disabled={busy} onClick={onMessage} className="btn-whatsapp w-full">
              <MessageCircle className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
              {t('admin.summary.message')}
            </button>
            <button type="button" disabled={busy} onClick={onCancel} className="btn-ghost tap w-full text-rust-700 hover:bg-rust-50">
              {t('admin.summary.cancel')}
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy} onClick={onConfirm} className="btn-primary flex-1">
              <Check className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
              {t('admin.confirm')}
            </button>
            {b.status === 'pending' && (
              <button type="button" disabled={busy} onClick={onRefuse} className="btn-ghost tap text-rust-700 hover:bg-rust-50">
                <X className="w-4 h-4" strokeWidth={2} aria-hidden="true" />
                {t('admin.summary.refuse')}
              </button>
            )}
          </>
        )}
      </div>

      {canMove && (
        <button type="button" disabled={busy} onClick={onMove} className="btn-secondary tap w-full">
          <CalendarClock className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
          {t('admin.summary.moveVisit')}
        </button>
      )}

      <button type="button" onClick={onEdit} className="tap flex items-center mx-auto px-3 text-sm text-rose-700 underline underline-offset-4 hover:text-rose-900">
        {t(listed.length > 1 ? 'admin.summary.editPart' : 'admin.summary.edit')}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-cream-200">
      <dt className="text-rose-600">{label}</dt>
      <dd className="text-rose-900 font-medium text-end">{value}</dd>
    </div>
  );
}
