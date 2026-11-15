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
  useVisitSlots, useCreateVisit, toBookingError, type BookingErrorCode, type CreatedPart, type VisitItem,
} from '../data/bookings';
import type { Service } from '../data/types';
import { useServices, useStylists } from '../data/queries';
import { DataError } from './DataError';
import { countText, formatPrice, formatDuration, formatLongDate } from '../data/formatters';
import { MAX_VISIT_SERVICES, joinNames, planVisit, visitOrder, visitTotals } from '../data/visit';
import { VisitStylists } from './booking/VisitStylists';
import { VisitParts, type VisitPart } from './booking/VisitParts';
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
  const [submitted, setSubmitted] = useState(false);
  const createVisitMutation = useCreateVisit();
  // The parts as booked (with the staff the salon assigned for "no preference").
  const [assigned, setAssigned] = useState<CreatedPart[] | null>(null);
  const [submitError, setSubmitError] = useState<Exclude<BookingErrorCode, 'slot_taken'> | null>(null);
  const [slotNotice, setSlotNotice] = useState<'booking.slotTaken' | 'booking.slotPassed' | null>(null);

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
  const atMax = visit.length >= MAX_VISIT_SERVICES;

  const slotsQuery = useVisitSlots(selectedDate, items);
  const slots = slotsQuery.data ?? [];

  const toggleService = (service: Service) => {
    if (selectedIds.includes(service.id)) {
      setSelectedIds((ids) => ids.filter((id) => id !== service.id));
      setStylistFor(({ [service.id]: _dropped, ...rest }) => rest);
    } else {
      if (atMax) return;
      setSelectedIds((ids) => [...ids, service.id]);
    }
    setSelectedTime(null);
  };

  const chooseStylist = (serviceId: string, stylistId: string | null) => {
    setStylistFor((m) => ({ ...m, [serviceId]: stylistId }));
    setSelectedTime(null);
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
    if (step === 2) return selectedDate !== null && selectedTime !== null;
    // Step 3: the button stays enabled; pressing it validates and shows every error.
    return step === 3;
  };

  const handleNext = () => { if (step < 3) setStep((s) => (s + 1) as Step); };
  const handleBack = () => { if (step > 0) setStep((s) => (s - 1) as Step); };

  /** Who does a part: the assigned staff once booked, else the client's choice. */
  const partStylistId = (serviceId: string) =>
    assigned?.find((p) => p.serviceId === serviceId)?.stylistId ?? stylistFor[serviceId] ?? null;
  const stylistName = single ? stylistLabel(partStylistId(single.id), t('booking.noPreference')) : '';
  const plannedParts: VisitPart[] = selectedTime
    ? planVisit(visit, selectedTime).map(({ service, time }) => ({
        time,
        service,
        stylistName: stylistLabel(partStylistId(service.id), t('booking.visit.anyStylist')),
      }))
    : [];

  const handleConfirm = ({ clientName, clientPhone }: ClientDetails) => {
    if (items.length === 0 || items.length > MAX_VISIT_SERVICES || !selectedDate || !selectedTime) return;
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
          setAssigned(created);
          setSubmitted(true);
        },
        onError: (err) => {
          const code = toBookingError(err);
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
    setSelectedTime(null);
    if (!keepClient) reset();
    setAssigned(null);
    setSubmitError(null);
    setSlotNotice(null);
    createVisitMutation.reset();
    setSubmitted(false);
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
    // Already on that step: setStep won't re-render, so focus now instead of leaving the flag set.
    if (stepRef.current === 1) headingRef.current?.focus({ preventScroll: true });
    else focusHeading.current = true;
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart is recreated each render; applied once per seq
  }, [request, services, sending]);

  const recap = visit.length > 0 && (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-cream-100 ps-3 pe-1 text-sm text-rose-700 mb-5">
      <p className="min-w-0 py-2">
        <span className="font-medium text-rose-900">{joinNames(visit.map((s) => s.name[lang]))}</span>
        {' · '}
        <span className="whitespace-nowrap">{formatPrice(totals.price, lang)}</span>
        {' · '}
        <span className="whitespace-nowrap">{formatDuration(totals.duration, lang)}</span>
      </p>
      <button type="button" onClick={() => { focusHeading.current = true; setStep(0); }} className="tap flex-shrink-0 px-3 font-medium text-rose-800 underline underline-offset-2 hover:text-rose-900">
        {t('booking.recap.change')}
      </button>
    </div>
  );

  // Several parts: the date, then each part (time · service · staff) and the total.
  const visitSummary = (
    <>
      <div className="flex justify-between items-center gap-4 mb-4">
        <span className="text-sm text-rose-600">{t('booking.summary.date')}</span>
        <span className="text-sm font-medium text-rose-800">{selectedDate ? formatLongDate(selectedDate, lang) : '—'}</span>
      </div>
      <p className="text-sm text-rose-600 mb-2">{t('booking.summary.services')}</p>
      <VisitParts parts={plannedParts} total={totals.price} />
    </>
  );

  if (submitted) {
    return (
      <section id="booking" className="relative py-20 lg:py-28 bg-cream-100/50">
        <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-sage-100 mb-6 animate-fadeIn">
            <Check className="w-10 h-10 text-sage-600" strokeWidth={2} />
            <div className="absolute inset-0 rounded-full bg-sage-200/40 animate-ping" />
          </div>
          <h2 className="font-display text-3xl font-semibold text-rose-800 mb-3">{t('booking.successTitle')}</h2>
          <p className="text-rose-600 text-lg mb-6">{t('booking.successText')}</p>

          {single ? (
            <div className="rounded-2xl bg-white border border-cream-200 p-5 space-y-3 text-start mb-6">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-rose-600">{t('booking.summary.service')}</span>
                <span className="text-sm font-medium text-rose-800">{single.name[lang]}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-rose-600">{t('booking.summary.stylist')}</span>
                <span className="text-sm font-medium text-rose-800">{stylistName}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-rose-600">{t('booking.summary.date')}</span>
                <span className="text-sm font-medium text-rose-800">{selectedDate ? formatLongDate(selectedDate, lang) : '—'}</span>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-rose-600">{t('booking.summary.time')}</span>
                <span className="text-sm font-medium text-rose-800">{selectedTime ?? '—'}</span>
              </div>
              <div className="border-t border-cream-200 pt-3 flex justify-between items-center gap-4">
                <span className="text-sm font-semibold text-rose-700">{t('booking.summary.price')}</span>
                <span className="text-lg font-display font-semibold text-rose-800">{formatPrice(single.price, lang)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-cream-200 p-5 text-start mb-6">
              {visitSummary}
            </div>
          )}

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
    <section id="booking" className="relative py-20 lg:py-28 bg-cream-100/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="eyebrow eyebrow-center justify-center mx-auto mb-4">{t('booking.kicker')}</p>
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
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ease-silk ${
                      isDone
                        ? 'bg-rose-800 border-rose-800 text-cream-50'
                        : isActive
                        ? 'bg-white border-gold-400 text-rose-800 ring-2 ring-gold-200'
                        : 'bg-cream-100 border-cream-300 text-cream-500'
                    }`}
                  >
                    {isDone ? <Check className="w-5 h-5" strokeWidth={2} /> : <s.icon className="w-5 h-5" strokeWidth={1.8} />}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-rose-700' : isDone ? 'text-rose-600' : 'text-cream-500'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-12 sm:w-20 h-0.5 mx-2 rounded-full transition-colors duration-300 ${isDone ? 'bg-gold-400' : 'bg-cream-300'}`} />
                )}
              </div>
            );
          })}
        </div>

        {dataLoading ? (
          <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-10 min-h-[400px] flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-rose-300 border-t-rose-700 animate-spin" />
          </div>
        ) : dataError ? (
          <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-10 min-h-[400px] flex items-center justify-center">
            <DataError onRetry={retryData} />
          </div>
        ) : (
        <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-6 sm:p-8 lg:p-10 min-h-[400px] flex flex-col">
          {/* Step 0 — Service */}
          {step === 0 && (
            <div className="animate-fadeIn">
              <h3 ref={headingRef} tabIndex={-1} className="font-display text-xl font-semibold text-rose-800 mb-1 focus:outline-none">{t('booking.selectService')}</h3>
              <p className="text-sm text-rose-600 mb-5">{t('booking.selectServiceHint')}</p>
              <div className="space-y-6">
                {serviceGroups.map((group) => (
                  <div key={group.category}>
                    {serviceGroups.length > 1 && (
                      <h4 className="text-sm font-semibold text-rose-700 uppercase tracking-wide mb-3">{t(`category.${group.category}`)}</h4>
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
                      className={`flex items-start gap-4 p-4 rounded-2xl border text-start transition-all duration-200 ease-silk ${
                        isSelected
                          ? 'border-gold-400 bg-gold-50 shadow-glow ring-1 ring-gold-300'
                          : blocked
                          ? 'border-cream-200 bg-cream-50 opacity-50 cursor-not-allowed'
                          : 'border-cream-200 bg-cream-50 hover:border-gold-200 hover:bg-rose-50/50'
                      }`}
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-rose-600" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h5 className="font-medium text-rose-800 text-sm">{service.name[lang]}</h5>
                          {isSelected && <Check className="w-4 h-4 text-gold-600 flex-shrink-0" strokeWidth={2.5} />}
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
                    onClick={() => chooseStylist(single.id, null)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-200 ease-silk ${
                      selectedStylist === null
                        ? 'border-gold-400 bg-gold-50 shadow-glow ring-1 ring-gold-300'
                        : 'border-cream-200 bg-cream-50 hover:border-gold-200'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-full bg-cream-200 flex items-center justify-center">
                      <User className="w-7 h-7 text-cream-500" strokeWidth={1.5} />
                    </div>
                    <span className="text-xs font-medium text-rose-600 text-center">{t('booking.noPreference')}</span>
                  </button>

                  {stylists.filter((s) => s.serviceIds.includes(single.id)).map((stylist) => {
                    const isSelected = selectedStylist === stylist.id;
                    return (
                      <button
                        key={stylist.id}
                        onClick={() => chooseStylist(single.id, stylist.id)}
                        className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-200 ease-silk ${
                          isSelected
                            ? 'border-gold-400 bg-gold-50 shadow-glow ring-1 ring-gold-300'
                            : 'border-cream-200 bg-cream-50 hover:border-gold-200'
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
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gold-500 flex items-center justify-center border-2 border-white">
                              <Check className="w-3.5 h-3.5 text-cream-50" strokeWidth={3} />
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
                        onClick={() => { setSelectedDate(day); setSelectedTime(null); }}
                        className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-20 rounded-2xl border transition-all duration-200 ease-silk ${
                          isSelected
                            ? 'border-rose-800 bg-rose-800 text-cream-50 shadow-soft'
                            : 'border-cream-200 bg-cream-50 text-rose-600 hover:border-gold-200'
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-wide opacity-70">
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
                  {slotNotice && (
                    <p role="alert" className="flex items-center gap-2 mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.8} />
                      {t(slotNotice)}
                    </p>
                  )}
                  {slotsQuery.isLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {Array.from({ length: 12 }, (_, i) => (
                        <div key={i} className="img-placeholder h-11 rounded-xl" />
                      ))}
                    </div>
                  ) : slotsQuery.isError ? (
                    <DataError onRetry={() => slotsQuery.refetch()} />
                  ) : slots.some((s) => s.available) ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {/* A time where some parts can't be placed is simply unavailable for now. */}
                      {slots.map(({ slot, available }) => (
                        <TimeSlotChip
                          key={slot}
                          state={selectedTime === slot ? 'selected' : available ? 'available' : 'disabled'}
                          disabled={!available}
                          onClick={() => {
                            if (!available) return;
                            setSelectedTime(slot);
                            setSlotNotice(null);
                          }}
                        >
                          {slot}
                        </TimeSlotChip>
                      ))}
                    </div>
                  ) : (
                    <p className="text-rose-600 text-sm py-8 text-center">{t('booking.noSlots')}</p>
                  )}
                  {visit.length > 1 && selectedTime && (
                    <section aria-labelledby="booking-plan" className="mt-6 rounded-2xl bg-cream-50 border border-cream-200 p-4">
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

              {single ? (
                <div className="rounded-2xl bg-cream-50 border border-cream-200 p-5 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-rose-600">{t('booking.summary.service')}</span>
                    <span className="text-sm font-medium text-rose-800">{single.name[lang]}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-rose-600">{t('booking.summary.stylist')}</span>
                    <span className="text-sm font-medium text-rose-800">{stylistName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-rose-600">{t('booking.summary.date')}</span>
                    <span className="text-sm font-medium text-rose-800">{selectedDate ? formatLongDate(selectedDate, lang) : '—'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-rose-600">{t('booking.summary.time')}</span>
                    <span className="text-sm font-medium text-rose-800">{selectedTime ?? '—'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-rose-600">{t('booking.summary.duration')}</span>
                    <span className="text-sm font-medium text-rose-800">{formatDuration(single.duration, lang)}</span>
                  </div>
                  <div className="border-t border-cream-200 pt-3 flex justify-between items-center">
                    <span className="text-sm font-semibold text-rose-700">{t('booking.summary.price')}</span>
                    <span className="text-lg font-display font-semibold text-rose-800">{formatPrice(single.price, lang)}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl bg-cream-50 border border-cream-200 p-5">{visitSummary}</div>
              )}

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

              {submitError && (
                <div role="alert" className="rounded-2xl border border-rust-200 bg-rust-50 p-4 text-sm text-rust-700">
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

          {/* Navigation (on the service step it sticks to the bottom of the screen with the running total) */}
          <div
            className={
              step === 0
                ? 'sticky bottom-0 z-10 mt-auto -mx-6 sm:-mx-8 lg:-mx-10 px-6 sm:px-8 lg:px-10 pt-4 pb-2 bg-white border-t border-cream-200'
                : 'mt-auto pt-6'
            }
          >
            {step === 0 && (
              <div aria-live="polite" className="text-center text-sm mb-3 empty:hidden">
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
                  <span className="w-4 h-4 rounded-full border-2 border-cream-200 border-t-cream-50 animate-spin" />
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
