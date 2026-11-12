import { useEffect, useId, useRef, useState } from 'react';
import { Check, MessageCircle, Phone, X } from 'lucide-react';
import { useLang, type Lang } from '../../context/LanguageContext';
import {
  formatAlgiersTime, toAdminError, useMyRole, useCreateStaffBooking, useSetBookingStatus, useUpdateStaffBooking,
  type AdminBooking, type StaffBookingInput,
} from '../../data/admin';
import { isValidPhone, toYmd } from '../../data/bookings';
import { useAllServices, useAllStylists } from '../../data/queries';
import { salonDate, salonInstant, salonMinutes, staffTimeOptions } from '../../data/week';
import { dayHours, stylistWorks } from '../../data/hours';
import { useClosedDates, useSalonHours, useSalonInfo, useStylistDaysOff } from '../../data/salonSettings';
import type { DayHours } from '../../data/types';
import { clientMessage, toWaNumber, waLink, type ClientMessageKind } from '../../data/whatsapp';
import { Badge } from '../Badge';

export type SheetState =
  | { mode: 'add'; stylistId: string; date: Date; time: string }
  | { mode: 'edit'; booking: AdminBooking };

interface BookingSheetProps {
  state: SheetState;
  onClose(): void;
}

type Notice = { kind: ClientMessageKind; booking: Pick<AdminBooking, 'clientName' | 'clientPhone' | 'startsAt' | 'serviceName' | 'lang'> };

function initialForm(state: SheetState, lang: Lang): StaffBookingInput {
  if (state.mode === 'edit') {
    const b = state.booking;
    return {
      serviceId: b.serviceId, stylistId: b.stylistId, date: salonDate(b.startsAt), time: formatAlgiersTime(b.startsAt),
      clientName: b.clientName, clientPhone: b.clientPhone, lang: b.lang,
    };
  }
  return { serviceId: '', stylistId: state.stylistId, date: state.date, time: state.time, clientName: '', clientPhone: '', lang };
}

const minutesOf = (b: AdminBooking) => Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);

function parseYmd(value: string): Date | null {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

/** Add or edit a booking; after confirm/cancel/move, offer the WhatsApp message to the client. */
export function BookingSheet({ state, onClose }: BookingSheetProps) {
  const { lang, t } = useLang();
  const titleId = useId();
  const allServices = useAllServices().data ?? [];
  const allStylists = useAllStylists().data ?? [];
  const salonHours = useSalonHours().data;
  const closedDates = useClosedDates().data ?? [];
  const daysOff = useStylistDaysOff().data ?? [];
  const demo = useMyRole() === 'demo';
  const salonWhatsapp = useSalonInfo().data?.whatsapp ?? null;
  const create = useCreateStaffBooking();
  const update = useUpdateStaffBooking();
  const setStatus = useSetBookingStatus();

  const [form, setForm] = useState<StaffBookingInput>(() => initialForm(state, lang));
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; phone?: boolean }>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Pickers offer active items, plus the booking's own service and stylist even if they were hidden since.
  const editing = state.mode === 'edit' ? state.booking : null;
  const services = allServices.filter((s) => s.active || s.id === editing?.serviceId);
  const ownStylistId = state.mode === 'edit' ? state.booking.stylistId : state.stylistId;
  const stylists = allStylists.filter((s) => s.active || s.id === ownStylistId);

  // Add mode: default to the stylist's usual first service once services have loaded.
  const usual = allStylists.find((s) => s.id === form.stylistId)?.serviceIds.find((id) => services.some((s) => s.id === id));
  const serviceId = form.serviceId || (usual ?? services[0]?.id ?? '');
  const service = allServices.find((s) => s.id === serviceId);
  // Editing keeps the booked length unless the service changes (as admin_update_booking does).
  const ownSpan: DayHours | null = editing
    ? { opens: salonMinutes(editing.startsAt), closes: salonMinutes(editing.startsAt) + minutesOf(editing) }
    : null;
  const duration = editing && serviceId === editing.serviceId ? minutesOf(editing) : service?.duration ?? 30;
  const hours = salonHours ? dayHours(salonHours, closedDates, form.date) : null;
  // On a closed day, a booking can still be re-timed within its own span.
  const optionHours = hours ?? ownSpan;
  const timeOptions = optionHours ? staffTimeOptions(duration, optionHours) : [];
  // Keep a booking's current time selectable (and in order) even if it is off the new service's grid.
  if (!timeOptions.includes(form.time)) timeOptions.push(form.time);
  timeOptions.sort();
  const [h, m] = form.time.split(':').map(Number);
  const pastClosing = !!service && !!hours && h * 60 + m + duration > hours.closes;
  // Booking a stylist on her day off is allowed (the owner knows best), but say so.
  const stylist = allStylists.find((s) => s.id === form.stylistId);
  const stylistOff = !!stylist && !stylistWorks(stylist, daysOff, form.date);

  const dialogRef = useRef<HTMLDivElement>(null);
  const requestCloseRef = useRef<() => void>(onClose);

  // Focus moves into the sheet on open and returns where it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // Escape closes (asking first if something was typed); Tab stays inside the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, a[href]')
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const busy = create.isPending || update.isPending || setStatus.isPending;
  // Confirm/cancel act on the saved booking: block them while the form has unsaved edits,
  // so the client is never sent a message with the old time.
  const initial = initialForm(state, lang);
  const dirty =
    form.clientName !== initial.clientName || form.clientPhone !== initial.clientPhone || form.lang !== initial.lang ||
    form.stylistId !== initial.stylistId || form.time !== initial.time || toYmd(form.date) !== toYmd(initial.date) ||
    (form.serviceId !== '' && form.serviceId !== initial.serviceId);
  const set = <K extends keyof StaffBookingInput>(key: K, value: StaffBookingInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const onError = (err: unknown) => setError(t(`admin.error.${toAdminError(err)}`));

  /** Backdrop, Escape and ✕ go through here: a half-typed booking or unsaved edit isn't thrown away silently. */
  const requestClose = () => {
    const message = state.mode === 'add' ? t('admin.sheet.discardNew') : t('admin.sheet.discardChanges');
    if (!notice && dirty && !window.confirm(message)) return;
    onClose();
  };
  requestCloseRef.current = requestClose;

  const save = () => {
    const name = form.clientName.trim();
    // The demo account sees masked phones; sending the mask back unchanged keeps the stored number.
    const phoneUnchanged = state.mode === 'edit' && form.clientPhone === state.booking.clientPhone;
    const errors = {
      name: name.length < 2 || name.length > 80,
      phone: !(demo && phoneUnchanged) && !isValidPhone(form.clientPhone),
    };
    setFieldErrors(errors);
    if (errors.name || errors.phone || !service) return;
    setError(null);
    const input = { ...form, serviceId };

    if (state.mode === 'add') {
      create.mutate(input, { onSuccess: () => onClose(), onError });
      return;
    }
    const b = state.booking;
    const moved =
      toYmd(input.date) !== toYmd(salonDate(b.startsAt)) || input.time !== formatAlgiersTime(b.startsAt) || input.stylistId !== b.stylistId;
    update.mutate(
      { ...input, id: b.id },
      {
        onSuccess: () =>
          moved
            ? setNotice({
                kind: 'moved',
                booking: {
                  clientName: name, clientPhone: input.clientPhone, lang: input.lang,
                  startsAt: salonInstant(input.date, input.time), serviceName: service.name,
                },
              })
            : onClose(),
        onError,
      }
    );
  };

  const changeStatus = (status: 'confirmed' | 'cancelled') => {
    if (state.mode !== 'edit') return;
    if (status === 'cancelled' && !window.confirm(t('admin.cancelConfirm'))) return;
    setError(null);
    const b = state.booking;
    setStatus.mutate(
      { id: b.id, status },
      { onSuccess: () => setNotice({ kind: status, booking: b }), onError }
    );
  };

  const title = notice ? t('admin.sheet.notifyTitle') : t(state.mode === 'add' ? 'admin.sheet.addTitle' : 'admin.sheet.editTitle');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-rose-950/40 animate-fadeIn" onClick={requestClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-cream-50 rounded-t-3xl sm:rounded-3xl shadow-lift p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id={titleId} className="font-display text-xl font-semibold text-rose-900">{title}</h2>
          <button type="button" onClick={requestClose} className="btn-ghost btn-sm" aria-label={t('admin.sheet.close')}>
            <X className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>

        {notice ? (
          <div className="space-y-4">
            <p className="rounded-2xl bg-white border border-cream-200 p-4 text-sm text-rose-800 whitespace-pre-line" dir={notice.booking.lang === 'ar' ? 'rtl' : 'ltr'}>
              {clientMessage(notice.kind, notice.booking)}
            </p>
            <a
              href={waLink(
                // In the demo the message goes to the salon's own number, never to a client.
                demo ? toWaNumber(salonWhatsapp ?? '') : toWaNumber(notice.booking.clientPhone),
                clientMessage(notice.kind, notice.booking)
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp btn-lg w-full"
            >
              <MessageCircle className="w-5 h-5" strokeWidth={1.8} />
              {t('admin.sheet.notifyWhatsapp')}
            </a>
            <button type="button" onClick={onClose} className="btn-ghost w-full">{t('admin.sheet.close')}</button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {editing && (
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge variant={editing.status}>{t(`schedule.${editing.status}`)}</Badge>
                <span className="text-xs text-rose-600">
                  {t(editing.source === 'staff' ? 'schedule.source.staff' : 'schedule.source.online')}
                </span>
                {/* The demo account sees a masked number: no call shortcut, it would dial nonsense. */}
                {!demo && (
                  <a href={`tel:${editing.clientPhone}`} dir="ltr" className="ms-auto inline-flex items-center gap-1 text-sm text-rose-700 hover:text-rose-900">
                    <Phone className="w-3.5 h-3.5" strokeWidth={1.8} />
                    {editing.clientPhone}
                  </a>
                )}
              </div>
            )}

            <Field id="sheet-name" label={t('admin.sheet.name')} error={fieldErrors.name ? t('admin.error.invalid_name') : null}>
              <input id="sheet-name" className="input" value={form.clientName} onChange={(e) => set('clientName', e.target.value)} autoComplete="off" />
            </Field>
            <Field id="sheet-phone" label={t('admin.sheet.phone')} error={fieldErrors.phone ? t('admin.error.invalid_phone') : null}>
              <input id="sheet-phone" className="input" type="tel" dir="ltr" inputMode="tel" value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} />
            </Field>
            <Field id="sheet-service" label={t('admin.sheet.service')}>
              <select id="sheet-service" className="input" value={serviceId} onChange={(e) => set('serviceId', e.target.value)}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.name[lang]}</option>
                ))}
              </select>
            </Field>
            <Field id="sheet-stylist" label={t('admin.sheet.stylist')}>
              <select id="sheet-stylist" className="input" value={form.stylistId} onChange={(e) => set('stylistId', e.target.value)}>
                {stylists.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {stylistOff && stylist && (
                <p role="status" className="mt-1 text-xs text-amber-800">{t('schedule.stylistOff').replace('{name}', stylist.name)}</p>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="sheet-date" label={t('admin.sheet.date')}>
                <input
                  id="sheet-date"
                  type="date"
                  className="input"
                  value={toYmd(form.date)}
                  onChange={(e) => {
                    const d = parseYmd(e.target.value);
                    if (d) set('date', d);
                  }}
                />
              </Field>
              <Field id="sheet-time" label={t('admin.sheet.time')}>
                <select id="sheet-time" className="input" dir="ltr" value={form.time} onChange={(e) => set('time', e.target.value)}>
                  {timeOptions.map((tm) => (
                    <option key={tm} value={tm}>{tm}</option>
                  ))}
                </select>
              </Field>
              {pastClosing && <p className="col-span-2 -mt-1 text-xs text-rust-700">{t('admin.error.outside_hours')}</p>}
            </div>
            <div role="group" aria-label={t('admin.sheet.lang')}>
              <span className="label">{t('admin.sheet.lang')}</span>
              <div className="flex gap-2">
                {(['fr', 'ar'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={form.lang === l}
                    onClick={() => set('lang', l)}
                    className={form.lang === l ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">{error}</p>
            )}

            {services.length === 0 && <p className="text-xs text-rose-600" role="status">{t('admin.sheet.loadingServices')}</p>}
            <button type="submit" disabled={busy || services.length === 0} className="btn-primary w-full">{t('admin.sheet.save')}</button>

            {editing && (
              <div className="flex gap-2">
                {editing.status !== 'confirmed' && (
                  <button type="button" disabled={busy || dirty} onClick={() => changeStatus('confirmed')} className="btn-secondary flex-1">
                    <Check className="w-4 h-4" strokeWidth={2} />
                    {t('admin.confirm')}
                  </button>
                )}
                {editing.status !== 'cancelled' && (
                  <button type="button" disabled={busy || dirty} onClick={() => changeStatus('cancelled')} className="btn-ghost flex-1">
                    <X className="w-4 h-4" strokeWidth={2} />
                    {t('admin.cancel')}
                  </button>
                )}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, error = null, children }: { id: string; label: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-rust-700">{error}</p>}
    </div>
  );
}
