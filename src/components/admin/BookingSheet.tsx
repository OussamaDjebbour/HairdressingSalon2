import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Check } from 'lucide-react';
import { useLang, type Lang } from '../../context/LanguageContext';
import {
  formatAlgiersTime, toAdminError, useMyRole, useCreateStaffBooking, useUpdateStaffBooking,
  type AdminBooking, type StaffBookingInput,
} from '../../data/admin';
import { toYmd } from '../../data/bookings';
import { clientNameSchema, mobilePhoneSchema } from '../../data/schemas';
import { useAllServices, useAllStylists } from '../../data/queries';
import { salonDate, salonInstant, salonMinutes, staffTimeOptions } from '../../data/week';
import { dayHours, stylistWorks } from '../../data/hours';
import { useClosedDates, useSalonHours, useStylistDaysOff } from '../../data/salonSettings';
import type { DayHours } from '../../data/types';
import { TextField } from '../form/TextField';
import { SelectField } from '../form/SelectField';
import { DateField } from '../form/DateField';
import { FormSummary } from '../form/FormSummary';
import { applyServerError } from '../form/serverErrors';
import { BookingSummary } from './BookingSummary';
import { MessageReady } from './MessageReady';
import { useBookingActions, type Notice } from './useBookingActions';
import { Sheet } from './Sheet';
import { useSheetMotion } from './useSheetMotion';

export type SheetState =
  // serviceId: pre-filled when the time was found for a service in the calendar.
  | { mode: 'add'; stylistId: string; date: Date; time: string; serviceId?: string }
  | { mode: 'edit'; booking: AdminBooking };

interface BookingSheetProps {
  state: SheetState;
  onClose(): void;
}

function initialForm(state: SheetState, lang: Lang): StaffBookingInput {
  if (state.mode === 'edit') {
    const b = state.booking;
    return {
      serviceId: b.serviceId, stylistId: b.stylistId, date: salonDate(b.startsAt), time: formatAlgiersTime(b.startsAt),
      clientName: b.clientName, clientPhone: b.clientPhone, lang: b.lang,
    };
  }
  return { serviceId: state.serviceId ?? '', stylistId: state.stylistId, date: state.date, time: state.time, clientName: '', clientPhone: '', lang };
}

const minutesOf = (b: AdminBooking) => Math.round((b.endsAt.getTime() - b.startsAt.getTime()) / 60000);

/**
 * The owner's rules for a booking. `keptPhone`: the demo account sees masked phones, and sending
 * the mask back unchanged keeps the stored number, so that exact value skips the phone rule.
 */
function bookingSchema(keptPhone: string | null) {
  return z.object({
    clientName: clientNameSchema,
    clientPhone: z.string().superRefine((v, ctx) => {
      if (keptPhone !== null && v === keptPhone) return;
      const result = mobilePhoneSchema.safeParse(v);
      if (!result.success) ctx.addIssue({ code: 'custom', message: result.error.issues[0].message });
    }),
    serviceId: z.string(),
    stylistId: z.string(),
    date: z.date(),
    time: z.string(),
    lang: z.enum(['fr', 'ar']),
  });
}

/** Server errors shown on a field; any other code keeps the form-level alert. */
const SERVER_ERROR_FIELDS: Record<string, keyof StaffBookingInput> = {
  slot_taken: 'time',
  outside_hours: 'time',
  salon_closed: 'time',
  invalid_phone: 'clientPhone',
  invalid_name: 'clientName',
};

/**
 * An existing booking opens as a summary (confirm, refuse, call, WhatsApp); "Modifier ou déplacer"
 * opens the form. A new booking opens the form directly. After a confirm, cancel or move, the
 * sheet offers the prepared WhatsApp message to the client.
 */
export function BookingSheet({ state, onClose }: BookingSheetProps) {
  const { lang, t } = useLang();
  const allServices = useAllServices().data ?? [];
  const allStylists = useAllStylists().data ?? [];
  const salonHours = useSalonHours().data;
  const closedDates = useClosedDates().data ?? [];
  const daysOff = useStylistDaysOff().data ?? [];
  const demo = useMyRole() === 'demo';
  const create = useCreateStaffBooking();
  const update = useUpdateStaffBooking();
  const actions = useBookingActions();

  const editing = state.mode === 'edit' ? state.booking : null;
  const keptPhone = demo && editing ? editing.clientPhone : null;
  const schema = useMemo(() => bookingSchema(keptPhone), [keptPhone]);
  const {
    register, control, handleSubmit, watch, setValue, reset, setError,
    formState: { errors, submitCount },
  } = useForm<StaffBookingInput, unknown, StaffBookingInput>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    shouldFocusError: true,
    defaultValues: initialForm(state, lang),
  });
  const form = watch();
  const [error, setFormError] = useState<string | null>(null);
  const [view, setView] = useState<'summary' | 'form'>(state.mode === 'edit' ? 'summary' : 'form');
  // A move (from the form) or "Message WhatsApp" sets this; confirm/refuse set actions.notice.
  const [ownNotice, setNotice] = useState<Notice | null>(null);
  const notice = ownNotice ?? actions.notice;

  // Pickers offer active items, plus the booking's own service and stylist even if they were hidden since.
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
  // SelectField keeps a booking's current time selectable (and in order) even if it is off the new service's grid.
  const timeOptions = optionHours ? staffTimeOptions(duration, optionHours) : [];
  const [h, m] = form.time.split(':').map(Number);
  const pastClosing = !!service && !!hours && h * 60 + m + duration > hours.closes;
  // Booking a stylist on her day off is allowed (the owner knows best), but say so.
  const stylist = allStylists.find((s) => s.id === form.stylistId);
  const stylistOff = !!stylist && !stylistWorks(stylist, daysOff, form.date);

  const busy = create.isPending || update.isPending;
  const initial = initialForm(state, lang);
  const dirty =
    form.clientName !== initial.clientName || form.clientPhone !== initial.clientPhone || form.lang !== initial.lang ||
    form.stylistId !== initial.stylistId || form.time !== initial.time || toYmd(form.date) !== toYmd(initial.date) ||
    (form.serviceId !== '' && form.serviceId !== initial.serviceId);
  const onError = (err: unknown) => {
    const code = toAdminError(err);
    const onField = applyServerError(code, SERVER_ERROR_FIELDS, (name, e) =>
      setError(name as keyof StaffBookingInput, e, { shouldFocus: true })
    );
    if (!onField) setFormError(t(`admin.error.${code}`));
  };

  // Every way of closing slides the sheet down first.
  const motion = useSheetMotion();
  const close = () => motion.dismiss(onClose);

  /** Backdrop, Escape and ✕ go through here: a half-typed booking or unsaved edit isn't thrown away silently. */
  const requestClose = () => {
    const message = state.mode === 'add' ? t('admin.sheet.discardNew') : t('admin.sheet.discardChanges');
    if (!notice && view === 'form' && dirty && !window.confirm(message)) return;
    close();
  };

  /** Back from the form to the summary; unsaved edits are dropped (after asking). */
  const backToSummary = () => {
    if (dirty && !window.confirm(t('admin.sheet.discardChanges'))) return;
    reset(initialForm(state, lang));
    setFormError(null);
    setView('summary');
  };

  const save = (values: StaffBookingInput) => {
    if (!service) return;
    setFormError(null);
    const input = { ...values, serviceId };

    if (state.mode === 'add') {
      create.mutate(input, { onSuccess: () => close(), onError });
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
                  clientName: input.clientName, clientPhone: input.clientPhone, lang: input.lang,
                  startsAt: salonInstant(input.date, input.time), serviceName: service.name,
                },
              })
            : close(),
        onError,
      }
    );
  };

  const title = notice ? t(`admin.ready.${notice.kind}`) : t(state.mode === 'add' ? 'admin.sheet.addTitle' : 'admin.sheet.editTitle');

  return (
    <Sheet
      title={
        <>
          {notice && (
            <span className="grid place-items-center w-8 h-8 rounded-full bg-sage-100 text-sage-700">
              <Check className="w-4 h-4" strokeWidth={2.4} aria-hidden="true" />
            </span>
          )}
          {title}
        </>
      }
      onRequestClose={requestClose}
      motion={motion.state}
    >
      {notice ? (
        <MessageReady notice={notice} onSend={close} onLater={close} />
      ) : editing && view === 'summary' ? (
        <BookingSummary
          booking={editing}
          onConfirm={() => actions.confirm(editing)}
          onRefuse={() => actions.refuse(editing)}
          onCancel={() => actions.refuse(editing)}
          onMessage={() => setNotice({ kind: 'confirmed', booking: editing })}
          onEdit={() => setView('form')}
          busy={actions.pendingId === editing.id}
          error={actions.error}
        />
      ) : (
        <form className="space-y-3" noValidate onSubmit={handleSubmit(save)}>
          {editing && (
            <button type="button" onClick={backToSummary} className="tap -ms-1 inline-flex items-center gap-1.5 px-1 text-sm text-rose-700 hover:text-rose-900">
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
              {t('admin.sheet.backToSummary')}
            </button>
          )}
          <TextField id="sheet-name" label={t('admin.sheet.name')} autoComplete="off" error={errors.clientName?.message} {...register('clientName')} />
          <TextField
            id="sheet-phone"
            label={t('admin.sheet.phone')}
            type="tel"
            dir="ltr"
            inputMode="tel"
            error={errors.clientPhone?.message}
            {...register('clientPhone')}
          />
          <Controller
            control={control}
            name="serviceId"
            render={({ field }) => (
              <SelectField
                ref={field.ref}
                id="sheet-service"
                label={t('admin.sheet.service')}
                value={serviceId}
                options={services.map((s) => ({ value: s.id, label: s.name[lang] }))}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          />
          <div>
            <Controller
              control={control}
              name="stylistId"
              render={({ field }) => (
                <SelectField
                  ref={field.ref}
                  id="sheet-stylist"
                  label={t('admin.sheet.stylist')}
                  value={field.value}
                  options={stylists.map((s) => ({ value: s.id, label: s.name }))}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            {stylistOff && stylist && (
              <p role="status" className="mt-1 text-xs text-amber-800">{t('schedule.stylistOff').replace('{name}', stylist.name)}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Controller
              control={control}
              name="date"
              render={({ field }) => (
                <DateField
                  ref={field.ref}
                  id="sheet-date"
                  label={t('admin.sheet.date')}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <Controller
              control={control}
              name="time"
              render={({ field }) => (
                <SelectField
                  ref={field.ref}
                  id="sheet-time"
                  label={t('admin.sheet.time')}
                  value={field.value}
                  options={timeOptions.map((tm) => ({ value: tm, label: tm }))}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.time?.message}
                  dirLtrValues
                />
              )}
            />
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
                  onClick={() => setValue('lang', l)}
                  className={form.lang === l ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}
          {error && (
            <p role="alert" className="rounded-xl border border-rust-200 bg-rust-50 px-3 py-2 text-sm text-rust-700">{error}</p>
          )}

          {services.length === 0 && <p className="text-xs text-rose-600" role="status">{t('admin.sheet.loadingServices')}</p>}
          <button type="submit" disabled={busy || services.length === 0} className="btn-primary w-full">{t('admin.sheet.save')}</button>

        </form>
      )}
    </Sheet>
  );
}
