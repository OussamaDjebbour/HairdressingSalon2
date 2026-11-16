import { useState, useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { TextField } from './form/TextField';
import { FormSummary } from './form/FormSummary';
import { clientDetailsSchema, type ClientDetails } from '../data/schemas';
import {
  Clock, Check, ChevronLeft, ChevronRight, Calendar, User,
  MessageCircle, Sparkle, AlertCircle,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import {
  useVisitSlots, useCreateVisit, toBookingError, failedItem, type BookingErrorCode, type VisitItem,
} from '../data/bookings';
import type { Service } from '../data/types';
import { useServices, useStylists } from '../data/queries';
import { DataError } from './DataError';
import { formatAlgiersTime } from '../data/algiersTime';
import { countText, formatPrice, formatDuration, formatLongDate } from '../data/formatters';
import {
  MAX_VISIT_SERVICES, joinNames, missingAllDay, planVisit, slotState, visitOrder, visitTotals,
} from '../data/visit';
import { VisitStylists } from './booking/VisitStylists';
import { VisitParts, type VisitPart } from './booking/VisitParts';
import { DayMissing, TimeMissing } from './booking/MissingParts';
import { TimeSlotChip } from './TimeSlotChip';
import { dayHours } from '../data/hours';
import { useClosedDates, useSalonHours, useSalonInfo } from '../data/salonSettings';
import { toWaNumber, waLink } from '../data/whatsapp';
import { SmartImage } from './SmartImage';
import { groupByCategory } from '../data/categories';
import { serviceIcon } from './serviceIcons';
import { useBookingIntent } from '../context/BookingIntentContext';

/** Up to two initials, e.g. "Lina Benali" → "LB" (Array.from keeps accented and Arabic letters whole). */
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((w) => Array.from(w)[0] ?? '').join('').toUpperCase();

type Step = 0 | 1 | 2 | 3;

export function Booking() {
  const { lang, t } = useLang();
  const servicesQuery = useServices();
  const stylistsQuery = useStylists();
  const hoursQuery = useSalonHours();
  const closedQuery = useClosedDates();
  const salonHours = hoursQuery.data;
  const closedDates = closedQuery.data;
  const whatsapp = useSalonInfo().data?.whatsapp;
  const waNumber = whatsapp ? toWaNumber(whatsapp) : null;
  const services = servicesQuery.data ?? [];
  // Grouped under category headings when the salon offers more than one category (e.g. Coiffure and Spa).
  const serviceGroups = groupByCategory(services);
  const stylists = stylistsQuery.data ?? [];
  const queries = [servicesQuery, stylistsQuery, hoursQuery, closedQuery];
  const dataLoading = queries.some((q) => q.isLoading);
  const dataError = queries.some((q) => q.isError);
  const retryData = () => {
    for (const q of queries) if (q.isError) q.refetch();
  };
  const [step, setStep] = useState<Step>(0);
  // The ticked services (any order) and the staff chosen for each (null or absent = no preference).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stylistFor, setStylistFor] = useState<Record<string, string | null>>({});
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, submitCount },
  } = useForm<ClientDetails>({
    resolver: zodResolver(clientDetailsSchema),
    mode: 'onTouched',
    defaultValues: { clientName: '', clientPhone: '' },
  });
  const createVisitMutation = useCreateVisit();
  // The visit as booked (names, the staff the salon assigned, the booked times), frozen at confirm time.
  const [booked, setBooked] = useState<{ parts: VisitPart[]; total: number; date: Date | null } | null>(null);
  const [submitError, setSubmitError] = useState<Exclude<BookingErrorCode, 'slot_taken'> | null>(null);
  const [slotNotice, setSlotNotice] = useState<'booking.slotTaken' | 'booking.slotPassed' | null>(null);
  // A tapped time where some parts can't be placed, and a part that was just taken at confirm (service ids, not
  // indexes: a services refetch can reorder the visit while the notice is open).
  const [partial, setPartial] = useState<{ time: string; missing: string[] } | null>(null);
  const [race, setRace] = useState<string | null>(null);
  // A ticked service the salon no longer offers was removed.
  const [dropped, setDropped] = useState(false);

  const upcomingDays = useMemo(() => {
    const days: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (salonHours && dayHours(salonHours, closedDates ?? [], d)) days.push(d);
    }
    return days;
  }, [salonHours, closedDates]);

  // The visit in the salon's order (not the tick order): the server indexes its answers by this order.
  const visit = useMemo(
    () => visitOrder(services.filter((s) => selectedIds.includes(s.id))),
    [services, selectedIds]
  );
  const items: VisitItem[] = useMemo(
    () => visit.map((s) => ({ serviceId: s.id, stylistId: stylistFor[s.id] ?? null })),
    [visit, stylistFor]
  );
  const totals = visitTotals(visit);
  const single = visit.length === 1 ? visit[0] : null;
  const selectedStylist = single ? stylistFor[single.id] ?? null : null;
  const atMax = selectedIds.length >= MAX_VISIT_SERVICES;

  const slotsQuery = useVisitSlots(selectedDate, items);
  const slotData = slotsQuery.data;
  const slots = slotData ?? [];
  // Fetched slots for the current parts: not while loading, nor a cached answer being re-fetched.
  const freshSlots = slotsQuery.isFetching ? undefined : slotData;
  // The chosen time is bookable for the current parts (by fresh data only).
  const timeOk = !!freshSlots?.some((s) => s.slot === selectedTime && s.available);

  // Set when the client picks a time: the plan (or notice) is then scrolled into view once.
  const revealRef = useRef<HTMLElement | null>(null);
  const reveal = useRef(false);

  /** No time chosen, and no "not available at this time" notice (its indexes would be stale). */
  const clearTime = () => {
    setSelectedTime(null);
    setPartial(null);
    reveal.current = false;
  };

  const dropIds = (ids: string[]) => {
    setSelectedIds((cur) => cur.filter((id) => !ids.includes(id)));
    setStylistFor((m) => Object.fromEntries(Object.entries(m).filter(([id]) => !ids.includes(id))));
  };

  const toggleService = (service: Service) => {
    if (selectedIds.includes(service.id)) dropIds([service.id]);
    else if (atMax) return;
    else setSelectedIds((ids) => [...ids, service.id]);
    clearTime();
    setDropped(false);
  };

  const chooseStylist = (serviceId: string, stylistId: string | null) => {
    setStylistFor((m) => ({ ...m, [serviceId]: stylistId }));
    clearTime();
  };

  /** The client's choice to leave out these parts (service ids). Keeps the chosen time. */
  const removeParts = (ids: string[]) => {
    dropIds(ids);
    setPartial(null);
    setRace(null);
  };

  const stylistLabel = (id: string | null | undefined, none: string) =>
    id ? stylists.find((s) => s.id === id)?.name ?? '' : none;

  const steps = [
    { label: t('booking.step.service'), icon: Sparkle },
    { label: t('booking.step.stylist'), icon: User },
    { label: t('booking.step.datetime'), icon: Calendar },
    { label: t('booking.step.confirm'), icon: Check },
  ];

  const canProceed = () => {
    if (step === 0) return visit.length > 0;
    if (step === 1) return true;
    if (step === 2) return selectedDate !== null && selectedTime !== null && timeOk;
    // Step 3: the button stays enabled; pressing it validates and shows every error.
    return step === 3;
  };

  const handleNext = () => { if (step < 3) setStep((s) => (s + 1) as Step); };
  const handleBack = () => { if (step > 0) setStep((s) => (s - 1) as Step); };

  const plannedParts: VisitPart[] = selectedTime
    ? planVisit(visit, selectedTime).map(({ service, time }) => ({
        time,
        service,
        stylistName: stylistLabel(stylistFor[service.id], t(single ? 'booking.noPreference' : 'booking.visit.anyStylist')),
      }))
    : [];

  const handleConfirm = ({ clientName, clientPhone }: ClientDetails) => {
    setRace(null);
    if (items.length === 0 || items.length > MAX_VISIT_SERVICES || !selectedDate || !selectedTime) {
      setSubmitError('unknown');
      return;
    }
    setSubmitError(null);
    createVisitMutation.mutate(
      {
        items,
        date: selectedDate,
        time: selectedTime,
        clientName,
        clientPhone,
        lang,
      },
      {
        onSuccess: (created) => {
          setBooked({
            date: selectedDate,
            total: totals.price,
            parts: visit.flatMap((service) => {
              const part = created.find((p) => p.serviceId === service.id);
              return part ? [{ service, time: formatAlgiersTime(part.startsAt), stylistName: stylistLabel(part.stylistId, '') }] : [];
            }),
          });
        },
        onError: (err) => {
          const code = toBookingError(err);
          // One part of several was just taken: say which, and let the client choose (book the others or another time).
          const failed = code === 'slot_taken' && items.length > 1 ? failedItem(err) : null;
          if (failed !== null && failed < items.length) {
            setRace(visit[failed].id);
            return;
          }
          // The chosen time is no longer bookable (taken, or it passed while
          // the customer was on this step): send them back to pick another.
          if (code === 'slot_taken' || code === 'outside_hours') {
            setSelectedTime(null);
            setSlotNotice(code === 'slot_taken' ? 'booking.slotTaken' : 'booking.slotPassed');
            setStep(2);
            return;
          }
          // The server's own name/phone check (normally caught first by the form): show it on the field.
          if (code === 'invalid_phone' || code === 'invalid_name') {
            const [name, message] =
              code === 'invalid_phone' ? (['clientPhone', 'form.error.phone'] as const) : (['clientName', 'form.error.nameLength'] as const);
            setError(name, { type: 'server', message }, { shouldFocus: true });
            return;
          }
          setSubmitError(code);
        },
      }
    );
  };

  const errorMessages: Record<Exclude<BookingErrorCode, 'slot_taken'>, string> = {
    invalid_phone: t('booking.error.invalidPhone'),
    invalid_name: t('booking.error.invalidName'),
    too_many_bookings: t('booking.error.tooMany'),
    rate_limited: t('booking.error.rateLimited'),
    outside_hours: t('booking.error.generic'),
    unknown_service: t('booking.error.generic'),
    too_many_services: t('booking.error.generic'),
    unknown: t('booking.error.generic'),
  };

  const restart = (keepClient = false) => {
    setStep(0);
    setSelectedIds([]);
    setStylistFor({});
    setSelectedDate(null);
    clearTime();
    if (!keepClient) reset();
    setSubmitError(null);
    setSlotNotice(null);
    setRace(null);
    setDropped(false);
    createVisitMutation.reset();
    setBooked(null);
  };

  const resetBooking = () => restart();

  // Moving the wizard programmatically (tile request, "Changer") puts focus on the new step's heading.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;
  useLayoutEffect(() => {
    if (focusHeading.current) {
      focusHeading.current = false;
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [step]);
  /** Go to a step and put focus on its heading (now, if already there: setStep wouldn't re-render). */
  const goTo = (s: Step) => {
    if (stepRef.current === s) headingRef.current?.focus({ preventScroll: true });
    else focusHeading.current = true;
    setStep(s);
  };

  /** "Réserver les autres prestations": leave out these parts, keep the time (re-checked below), back to the times. */
  const bookOthers = (time: string, ids: string[]) => {
    removeParts(ids);
    setSelectedTime(time);
    setSlotNotice(null);
    goTo(2);
  };
  const otherTime = () => {
    clearTime();
    setRace(null);
    goTo(2);
  };

  // The chosen time must still be bookable for the current parts: checked against fetched data only.
  useEffect(() => {
    if (step === 2 && selectedTime && freshSlots && !timeOk) {
      setSelectedTime(null);
      setSlotNotice('booking.slotPassed');
    }
  }, [step, selectedTime, freshSlots, timeOk]);

  // A ticked service the salon stopped offering (services refetched): drop it, clear the time and say so.
  const offered = servicesQuery.data;
  useEffect(() => {
    if (!offered || booked) return;
    const gone = selectedIds.filter((id) => !offered.some((s) => s.id === id));
    if (gone.length === 0) return;
    dropIds(gone);
    clearTime();
    setRace(null);
    setDropped(true);
    if (gone.length === selectedIds.length) setStep(0);
    else if (step === 3) setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the offer or the selection changes
  }, [offered, selectedIds]);

  // On a phone the plan (or the "not available at" notice) sits below the times: bring it into view, focus stays.
  useEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    revealRef.current?.scrollIntoView?.({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }, [selectedTime, partial]);

  // A service tile on the page chose a service: restart with it picked (keeping what the client typed)
  // and go to the stylist step. Applied once per request; waits for the services to load, and is
  // dropped if a booking is being sent.
  const { request } = useBookingIntent();
  const appliedSeq = useRef(0);
  const sending = createVisitMutation.isPending;
  useEffect(() => {
    if (!request || request.seq === appliedSeq.current) return;
    // Tapped while a booking is being sent: drop it, so the confirmation (or the error) stays as it is.
    if (sending) {
      appliedSeq.current = request.seq;
      return;
    }
    const service = services.find((s) => s.id === request.serviceId);
    if (!service) return;
    appliedSeq.current = request.seq;
    restart(true);
    setSelectedIds([service.id]);
    clearErrors();
    goTo(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart is recreated each render; applied once per seq
  }, [request, services, sending]);

  const recap = visit.length > 0 && (
    <div className="flex items-center justify-between gap-2 rounded-[2px] bg-pearl-100 ps-3 pe-1 text-sm text-rose-700 mb-5">
      <p className="min-w-0 py-2">
        <span className="font-medium text-rose-900">{joinNames(visit.map((s) => s.name[lang]))}</span>
        {' · '}
        <span className="whitespace-nowrap">{formatPrice(totals.price, lang)}</span>
        {' · '}
        <span className="whitespace-nowrap">{formatDuration(totals.duration, lang)}</span>
      </p>
      <button type="button" onClick={() => goTo(0)} className="tap flex-shrink-0 px-3 font-medium text-rose-800 underline underline-offset-2 hover:text-rose-900">
        {t('booking.recap.change')}
      </button>
    </div>
  );

  const row = (key: string, value: string) => (
    <div key={key} className="flex justify-between items-center gap-4">
      <span className="text-sm text-rose-600">{t(key)}</span>
      <span className="text-sm font-medium text-rose-800">{value}</span>
    </div>
  );

  /** The confirm step's and the success screen's summary: one service as rows, several as a list of parts. */
  const summary = (parts: VisitPart[], total: number, date: Date | null, duration?: number) => {
    const dateText = date ? formatLongDate(date, lang) : '—';
    if (parts.length !== 1) {
      return (
        <div className="space-y-4">
          {row('booking.summary.date', dateText)}
          <div>
            <p className="text-sm text-rose-600 mb-2">{t('booking.summary.services')}</p>
            <VisitParts parts={parts} total={total} />
          </div>
        </div>
      );
    }
    const [part] = parts;
    return (
      <div className="space-y-3">
        {row('booking.summary.service', part.service.name[lang])}
        {row('booking.summary.stylist', part.stylistName)}
        {row('booking.summary.date', dateText)}
        {row('booking.summary.time', part.time)}
        {duration !== undefined && row('booking.summary.duration', formatDuration(duration, lang))}
        <div className="border-t border-rose-900/10 pt-3 flex justify-between items-center gap-4">
          <span className="text-sm font-semibold text-rose-700">{t('booking.summary.price')}</span>
          <span className="text-lg font-display font-semibold text-rose-800">{formatPrice(total, lang)}</span>
        </div>
      </div>
    );
  };

  const notice = (text: string) => (
    <p role="alert" className="flex items-center gap-2 mb-4 rounded-[2px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
      {text}
    </p>
  );

  const idsAt = (indexes: number[]) => indexes.flatMap((i) => (visit[i] ? [visit[i].id] : []));
  const namesOf = (ids: string[]) => ids.flatMap((id) => visit.filter((s) => s.id === id).map((s) => s.name[lang]));
  const partNames = (indexes: number[]) => namesOf(idsAt(indexes));
  const dayMissing = missingAllDay(slots, items.length).filter((i) => visit[i]);
  const without = (indexes: number[]) => t('booking.visit.without').replace('{services}', joinNames(partNames(indexes)));

  if (booked) {
    return (
      <section id="booking" className="relative py-20 lg:py-28 bg-pearl-100">
        <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-sage-100 mb-6 animate-fadeIn">
            <Check className="w-10 h-10 text-sage-600" strokeWidth={2} />
            <div className="absolute inset-0 rounded-full bg-sage-200/40 animate-ping" />
          </div>
          <h2 className="font-display text-3xl font-semibold text-rose-800 mb-3">{t('booking.successTitle')}</h2>
          <p className="text-rose-600 text-lg mb-6">{t('booking.successText')}</p>

          <div className="rounded-[2px] bg-pearl-50 border border-rose-900/10 p-5 text-start mb-6">
            {summary(booked.parts, booked.total, booked.date)}
          </div>

          {waNumber && (
            <a
              href={waLink(waNumber)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary w-full mb-3"
            >
              <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
              {t('booking.questionsWhatsapp')}
            </a>
          )}
          <button onClick={resetBooking} className="btn-ghost">{t('booking.newBooking')}</button>
        </div>
      </section>
    );
  }

  return (
    <section id="booking" className="relative py-20 lg:py-28 bg-pearl-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="font-display font-semibold text-rose-900 text-[clamp(2rem,4vw,3rem)]">{t('booking.title')}</h2>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center mb-10">
          {steps.map((s, i) => {
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all duration-300 ease-silk ${
                      isDone
                        ? 'bg-rose-800 border-rose-800 text-pearl-50'
                        : isActive
                        ? 'bg-pearl-50 border-rose-900 text-rose-900'
                        : 'bg-transparent border-rose-900/20 text-rose-900/40'
                    }`}
                  >
                    {isDone ? <Check className="w-5 h-5" strokeWidth={2} /> : <s.icon className="w-5 h-5" strokeWidth={1.8} />}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-rose-700' : isDone ? 'text-rose-600' : 'text-rose-900/40'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-2 rounded-full transition-colors duration-300 ${isDone ? 'bg-rose-900' : 'bg-rose-900/15'}`} />
                )}
              </div>
            );
          })}
        </div>

        {dataLoading ? (
          <div className="bg-pearl-50 rounded-[2px] border border-rose-900/10 p-10 min-h-[400px] flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
          </div>
        ) : dataError ? (
          <div className="bg-pearl-50 rounded-[2px] border border-rose-900/10 p-10 min-h-[400px] flex items-center justify-center">
            <DataError onRetry={retryData} />
          </div>
        ) : (
        <div className="bg-pearl-50 rounded-[2px] border border-rose-900/10 p-6 sm:p-8 lg:p-10 min-h-[400px] flex flex-col">
          {dropped && notice(t('booking.visit.dropped'))}
          {/* Step 0 — Service */}
          {step === 0 && (
            <div className="animate-fadeIn">
              <h3 ref={headingRef} tabIndex={-1} className="font-display text-xl font-semibold text-rose-800 mb-1 focus:outline-none">{t('booking.selectService')}</h3>
              {services.length > 1 && <p className="text-sm text-rose-600 mb-5">{t('booking.selectServiceHint')}</p>}
              <div className="space-y-6">
                {serviceGroups.map((group) => (
                  <div key={group.category}>
                    {serviceGroups.length > 1 && (
                      <h4 className="font-display italic text-lg text-gold-700 mb-3">{t(`category.${group.category}`)}</h4>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {group.items.map((service) => {
                  const Icon = serviceIcon(service.icon);
                  const isSelected = selectedIds.includes(service.id);
                  const blocked = !isSelected && atMax;
                  return (
                    <button
                      key={service.id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-disabled={blocked || undefined}
                      onClick={() => toggleService(service)}
                      className={`flex items-start gap-4 p-4 rounded-[2px] border text-start transition-all duration-200 ease-silk ${
                        isSelected
                          ? 'border-rose-900 bg-pearl-50 ring-1 ring-rose-900'
                          : blocked
                          ? 'border-rose-900/10 bg-transparent opacity-50 cursor-not-allowed'
                          : 'border-rose-900/10 bg-transparent hover:border-rose-900/40 '
                      }`}
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-[2px] bg-rose-100 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-rose-600" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="font-medium text-rose-800 text-sm">{service.name[lang]}</h5>
                          {isSelected && <Check className="w-4 h-4 text-rose-900 flex-shrink-0" strokeWidth={2.5} />}
                        </div>
                        <p className="text-xs text-rose-600 mt-0.5 line-clamp-2">{service.description[lang]}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-sm font-semibold text-rose-700">{formatPrice(service.price, lang)}</span>
                          <span className="flex items-center gap-1 text-xs text-rose-600">
                            <Clock className="w-3.5 h-3.5" strokeWidth={1.8} />
                            {formatDuration(service.duration, lang)}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1 — Stylist */}
          {step === 1 && (
            <div className="animate-fadeIn">
              <h3 ref={headingRef} tabIndex={-1} className="font-display text-xl font-semibold text-rose-800 mb-3 focus:outline-none">{t('booking.selectStylist')}</h3>
              {recap}
              {single ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    type="button"
                    aria-pressed={selectedStylist === null}
                    onClick={() => chooseStylist(single.id, null)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-[2px] border transition-all duration-200 ease-silk ${
                      selectedStylist === null
                        ? 'border-rose-900 bg-pearl-50 ring-1 ring-rose-900'
                        : 'border-rose-900/10 bg-transparent hover:border-rose-900/40'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-full bg-pearl-200 flex items-center justify-center">
                      <User className="w-7 h-7 text-rose-900/40" strokeWidth={1.5} />
                    </div>
                    <span className="text-xs font-medium text-rose-600 text-center">{t('booking.noPreference')}</span>
                  </button>

                  {stylists.filter((s) => s.serviceIds.includes(single.id)).map((stylist) => {
                    const isSelected = selectedStylist === stylist.id;
                    return (
                      <button
                        key={stylist.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => chooseStylist(single.id, stylist.id)}
                        className={`flex flex-col items-center gap-3 p-4 rounded-[2px] border transition-all duration-200 ease-silk ${
                          isSelected
                            ? 'border-rose-900 bg-pearl-50 ring-1 ring-rose-900'
                            : 'border-rose-900/10 bg-transparent hover:border-rose-900/40'
                        }`}
                      >
                        <div className="relative">
                          {stylist.image ? (
                            <SmartImage
                              src={stylist.image}
                              alt={stylist.name}
                              aspect="aspect-square"
                              rounded="rounded-full"
                              className="w-16 h-16"
                            />
                          ) : (
                            // A stylist added in the settings has no photo yet: show her initials.
                            <div
                              aria-hidden="true"
                              className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center font-display text-xl font-semibold text-rose-700"
                            >
                              {initials(stylist.name)}
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-rose-900 flex items-center justify-center border-2 border-white">
                              <Check className="w-3.5 h-3.5 text-pearl-50" strokeWidth={3} />
                            </div>
                          )}
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-medium text-rose-800">{stylist.name}</p>
                          <p className="text-xs text-rose-600">{stylist.role[lang]}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <VisitStylists visit={visit} stylists={stylists} value={stylistFor} onChange={chooseStylist} />
              )}
            </div>
          )}

          {/* Step 2 — Date & Time */}
          {step === 2 && (
            <div className="animate-fadeIn space-y-6">
              <div>
                <h3 ref={headingRef} tabIndex={-1} className="font-display text-xl font-semibold text-rose-800 mb-3 focus:outline-none">{t('booking.selectDate')}</h3>
                {recap}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                  {upcomingDays.map((day, i) => {
                    const isSelected = selectedDate?.toDateString() === day.toDateString();
                    const isToday = i === 0;
                    return (
                      <button
                        key={i}
                        onClick={() => { setSelectedDate(day); clearTime(); }}
                        className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-[2px] border transition-all duration-200 ease-silk ${
                          isSelected
                            ? 'border-rose-800 bg-rose-800 text-pearl-50'
                            : 'border-rose-900/10 bg-transparent text-rose-600 hover:border-rose-900/40'
                        }`}
                      >
                        <span className="text-[11px] opacity-70">
                          {formatLongDate(day, lang).split(' ')[0]}
                        </span>
                        <span className="text-xl font-display font-semibold mt-0.5">{day.getDate()}</span>
                        <span className="text-[10px] opacity-70">{isToday ? t('schedule.today') : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDate && (
                <div>
                  <h3 className="font-display text-xl font-semibold text-rose-800 mb-4">{t('booking.selectTime')}</h3>
                  {slotNotice && notice(t(slotNotice))}
                  <DayMissing
                    parts={dayMissing.map((i) => {
                      const id = stylistFor[visit[i].id];
                      return { service: visit[i], stylistName: id ? stylistLabel(id, '') : null };
                    })}
                    onRemove={(k) => { removeParts(idsAt([dayMissing[k]])); goTo(2); }}
                    onChangeStylist={() => goTo(1)}
                  />
                  {slotsQuery.isLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="img-placeholder h-11 rounded-[2px]" />
                      ))}
                    </div>
                  ) : slotsQuery.isError ? (
                    <DataError onRetry={() => slotsQuery.refetch()} />
                  ) : slots.some((s) => slotState(s, items.length) !== 'full') ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5 items-start">
                      {slots.map((s) => {
                        // A time where only some parts can be placed: bookable without them, on the client's say-so.
                        const state = slotState(s, items.length);
                        return (
                          <TimeSlotChip
                            key={s.slot}
                            state={selectedTime === s.slot ? 'selected' : state === 'full' ? 'disabled' : state}
                            disabled={state === 'full'}
                            onClick={() => {
                              setSlotNotice(null);
                              if (state === 'partial') {
                                reveal.current = true;
                                setSelectedTime(null);
                                setPartial({ time: s.slot, missing: idsAt(s.missing) });
                              } else if (s.slot !== selectedTime) {
                                reveal.current = true;
                                setSelectedTime(s.slot);
                                setPartial(null);
                              }
                            }}
                          >
                            {s.slot}
                            {state === 'partial' && (
                              <>
                                {/* Parts missing all day are already said above: shown only to screen readers here. */}
                                <span className="sr-only"> {without(s.missing)}</span>
                                {s.missing.some((i) => !dayMissing.includes(i)) && (
                                  <span aria-hidden="true" className="text-xs font-normal">
                                    {without(s.missing.filter((i) => !dayMissing.includes(i)))}
                                  </span>
                                )}
                              </>
                            )}
                          </TimeSlotChip>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-rose-600 text-sm py-8 text-center">{t('booking.noSlots')}</p>
                  )}
                  {partial && (
                    <div ref={(el) => { revealRef.current = el; }} className="mt-4">
                      <TimeMissing
                        kind="unavailable"
                        names={namesOf(partial.missing)}
                        time={partial.time}
                        onBookOthers={() => bookOthers(partial.time, partial.missing)}
                        onOtherTime={otherTime}
                      />
                    </div>
                  )}
                  {visit.length > 1 && selectedTime && (
                    <section ref={(el) => { revealRef.current = el; }} aria-labelledby="booking-plan" className="mt-6 rounded-[2px] bg-transparent border border-rose-900/10 p-4">
                      <h4 id="booking-plan" className="text-sm font-semibold text-rose-700 mb-3">{t('booking.visit.plan')}</h4>
                      <VisitParts parts={plannedParts} />
                    </section>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Confirm */}
          {step === 3 && (
            <div className="animate-fadeIn space-y-6">
              <h3 className="font-display text-xl font-semibold text-rose-800 mb-2">{t('booking.summary')}</h3>

              <div className="rounded-[2px] bg-transparent border border-rose-900/10 p-5">
                {summary(plannedParts, totals.price, selectedDate, totals.duration)}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <TextField
                  id="booking-name"
                  label={t('booking.clientName')}
                  type="text"
                  autoComplete="name"
                  placeholder={t('booking.clientNamePlaceholder')}
                  error={errors.clientName?.message}
                  {...register('clientName')}
                />
                <TextField
                  id="booking-phone"
                  label={t('booking.clientPhone')}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={t('booking.clientPhonePlaceholder')}
                  dir="ltr"
                  error={errors.clientPhone?.message}
                  {...register('clientPhone')}
                />
              </div>

              {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}

              {race !== null && visit.some((s) => s.id === race) && selectedTime && (
                <TimeMissing
                  kind="taken"
                  names={namesOf([race])}
                  time={selectedTime}
                  onBookOthers={() => bookOthers(selectedTime, [race])}
                  onOtherTime={otherTime}
                />
              )}

              {submitError && (
                <div role="alert" className="rounded-[2px] border border-rust-200 bg-rust-50 p-4 text-sm text-rust-700">
                  <p className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
                    {errorMessages[submitError]}
                  </p>
                  {(submitError === 'rate_limited' || submitError === 'too_many_bookings') && waNumber && (
                    <a
                      href={waLink(waNumber)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-whatsapp btn-sm mt-3"
                    >
                      <MessageCircle className="w-4 h-4" strokeWidth={1.8} />
                      {t('booking.contactWhatsapp')}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Room for the bar's fade (h-10) after the last service, so at the end of the list the fade
              covers this space and never the last card. */}
          {step === 0 && <div data-fade-room aria-hidden="true" className="h-10 shrink-0" />}

          {/* Navigation (on the service step it sticks to the bottom of the screen with the running total) */}
          <div
            className={
              step === 0
                ? 'sticky bottom-0 z-10 mt-auto -mx-6 sm:-mx-8 lg:-mx-10 px-6 sm:px-8 lg:px-10 pt-4 pb-2 bg-pearl-50'
                : 'mt-auto pt-6'
            }
          >
            {/* The list passes softly under the bar: a hard line here cut across the service behind it. */}
            {step === 0 && (
              <div data-fade aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-full h-10 bg-gradient-to-b from-pearl-50/0 to-pearl-50" />
            )}
            {step === 0 && (
              <div aria-live="polite" className="text-center text-sm mb-3 empty:mb-0">
                {visit.length > 0 && (
                  <p className="font-medium text-rose-800">
                    {[countText(t, lang, 'booking.visit.count', visit.length), formatPrice(totals.price, lang), formatDuration(totals.duration, lang)].join(' · ')}
                  </p>
                )}
                {atMax && <p className="text-rose-600 mt-0.5">{t('booking.visit.max')}</p>}
              </div>
            )}
          <div className="flex items-center justify-between">
            <button onClick={handleBack} disabled={step === 0} className="btn-ghost">
              <ChevronLeft className="w-4 h-4" strokeWidth={1.8} />
              {t('booking.back')}
            </button>
            {step < 3 ? (
              <button onClick={handleNext} disabled={!canProceed()} className="btn-primary">
                {t('booking.next')}
                <ChevronRight className="w-4 h-4" strokeWidth={1.8} />
              </button>
            ) : (
              <button
                onClick={handleSubmit(handleConfirm)}
                disabled={createVisitMutation.isPending}
                className="btn-primary"
              >
                {createVisitMutation.isPending ? (
                  <span className="w-4 h-4 rounded-full border-2 border-pearl-50/30 border-t-pearl-50 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" strokeWidth={2} />
                )}
                {createVisitMutation.isPending ? t('booking.submitting') : t('booking.confirm')}
              </button>
            )}
          </div>
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
