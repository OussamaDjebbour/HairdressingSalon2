import { useState, useMemo } from 'react';
import {
  Scissors, Palette, Sparkles, Hand, Brush, Heart,
  Clock, Check, ChevronLeft, ChevronRight, Calendar, User,
  MessageCircle, Sparkle,
} from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { services, stylists, generateTimeSlots, getBookedSlots, type Service } from '../data/services';
import { formatPrice, formatDuration, formatLongDate } from '../data/formatters';
import { TimeSlotChip } from './TimeSlotChip';
import { SmartImage } from './SmartImage';

const iconMap: Record<string, typeof Scissors> = {
  scissors: Scissors, palette: Palette, sparkles: Sparkles,
  hand: Hand, brush: Brush, heart: Heart,
};

type Step = 0 | 1 | 2 | 3;
const WHATSAPP_NUMBER = '213561234567';

export function Booking() {
  const { lang, t } = useLang();
  const [step, setStep] = useState<Step>(0);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedStylist, setSelectedStylist] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const upcomingDays = useMemo(() => {
    const days: Date[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      if (d.getDay() !== 0 && d.getDay() !== 1) days.push(d);
    }
    return days;
  }, []);

  const allSlots = useMemo(() => generateTimeSlots(selectedDate ?? new Date()), [selectedDate]);
  const bookedSlots = useMemo(
    () => getBookedSlots(selectedDate ?? new Date(), selectedStylist),
    [selectedDate, selectedStylist]
  );

  const isAvailable = (slot: string) => !bookedSlots.includes(slot);

  const steps = [
    { label: t('booking.step.service'), icon: Sparkle },
    { label: t('booking.step.stylist'), icon: User },
    { label: t('booking.step.datetime'), icon: Calendar },
    { label: t('booking.step.confirm'), icon: Check },
  ];

  const canProceed = () => {
    if (step === 0) return selectedService !== null;
    if (step === 1) return true;
    if (step === 2) return selectedDate !== null && selectedTime !== null;
    if (step === 3) return clientName.trim() !== '' && clientPhone.trim() !== '';
    return false;
  };

  const handleNext = () => { if (step < 3) setStep((s) => (s + 1) as Step); };
  const handleBack = () => { if (step > 0) setStep((s) => (s - 1) as Step); };

  const stylistName = selectedStylist
    ? stylists.find((s) => s.id === selectedStylist)?.name ?? ''
    : t('booking.noPreference');

  const buildWhatsAppMessage = () => {
    const lines: string[] = [];
    if (lang === 'fr') {
      lines.push('Bonjour, je souhaite prendre rendez-vous:');
      lines.push('');
      lines.push(`• Prestation: ${selectedService?.name.fr}`);
      lines.push(`• Coiffeuse: ${stylistName}`);
      lines.push(`• Date: ${selectedDate ? formatLongDate(selectedDate, 'fr') : ''}`);
      lines.push(`• Heure: ${selectedTime ?? ''}`);
      lines.push(`• Durée: ${selectedService ? formatDuration(selectedService.duration, 'fr') : ''}`);
      lines.push(`• Prix: ${selectedService ? formatPrice(selectedService.price, 'fr') : ''}`);
      lines.push('');
      lines.push(`Nom: ${clientName}`);
      lines.push(`Téléphone: ${clientPhone}`);
    } else {
      lines.push('مرحباً، أرغب في حجز موعد:');
      lines.push('');
      lines.push(`• الخدمة: ${selectedService?.name.ar}`);
      lines.push(`• الخبيرة: ${stylistName}`);
      lines.push(`• التاريخ: ${selectedDate ? formatLongDate(selectedDate, 'ar') : ''}`);
      lines.push(`• الوقت: ${selectedTime ?? ''}`);
      lines.push(`• المدة: ${selectedService ? formatDuration(selectedService.duration, 'ar') : ''}`);
      lines.push(`• السعر: ${selectedService ? formatPrice(selectedService.price, 'ar') : ''}`);
      lines.push('');
      lines.push(`الاسم: ${clientName}`);
      lines.push(`الهاتف: ${clientPhone}`);
    }
    return lines.join('\n');
  };

  const handleWhatsAppSend = () => {
    const msg = encodeURIComponent(buildWhatsAppMessage());
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
    setSubmitted(true);
  };

  const resetBooking = () => {
    setStep(0);
    setSelectedService(null);
    setSelectedStylist(null);
    setSelectedDate(null);
    setSelectedTime(null);
    setClientName('');
    setClientPhone('');
    setSubmitted(false);
  };

  if (submitted) {
    return (
      <section id="booking" className="relative py-20 lg:py-28 bg-cream-100/50">
        <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-sage-100 mb-6 animate-fadeIn">
            <Check className="w-10 h-10 text-sage-600" strokeWidth={2} />
            <div className="absolute inset-0 rounded-full bg-sage-200/40 animate-ping" />
          </div>
          <h2 className="font-display text-3xl font-semibold text-rose-800 mb-3">{t('booking.successTitle')}</h2>
          <p className="text-rose-600 text-lg mb-8">{t('booking.successText')}</p>
          <button onClick={resetBooking} className="btn-secondary btn-lg">{t('booking.newBooking')}</button>
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

        <div className="bg-white rounded-3xl shadow-card border border-cream-200 p-6 sm:p-8 lg:p-10 min-h-[400px] flex flex-col">
          {/* Step 0 — Service */}
          {step === 0 && (
            <div className="animate-fadeIn">
              <h3 className="font-display text-xl font-semibold text-rose-800 mb-5">{t('booking.selectService')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {services.map((service) => {
                  const Icon = iconMap[service.icon] ?? Scissors;
                  const isSelected = selectedService?.id === service.id;
                  return (
                    <button
                      key={service.id}
                      onClick={() => setSelectedService(service)}
                      className={`flex items-start gap-4 p-4 rounded-2xl border text-start transition-all duration-200 ease-silk ${
                        isSelected
                          ? 'border-gold-400 bg-gold-50 shadow-glow ring-1 ring-gold-300'
                          : 'border-cream-200 bg-cream-50 hover:border-gold-200 hover:bg-rose-50/50'
                      }`}
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-rose-600" strokeWidth={1.8} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-medium text-rose-800 text-sm">{service.name[lang]}</h4>
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
          )}

          {/* Step 1 — Stylist */}
          {step === 1 && (
            <div className="animate-fadeIn">
              <h3 className="font-display text-xl font-semibold text-rose-800 mb-5">{t('booking.selectStylist')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <button
                  onClick={() => setSelectedStylist(null)}
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

                {stylists.map((stylist) => {
                  const isSelected = selectedStylist === stylist.id;
                  return (
                    <button
                      key={stylist.id}
                      onClick={() => setSelectedStylist(stylist.id)}
                      className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-200 ease-silk ${
                        isSelected
                          ? 'border-gold-400 bg-gold-50 shadow-glow ring-1 ring-gold-300'
                          : 'border-cream-200 bg-cream-50 hover:border-gold-200'
                      }`}
                    >
                      <div className="relative">
                        <SmartImage
                          src={stylist.image}
                          alt={stylist.name}
                          aspect="aspect-square"
                          rounded="rounded-full"
                          className="w-16 h-16"
                        />
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
            </div>
          )}

          {/* Step 2 — Date & Time */}
          {step === 2 && (
            <div className="animate-fadeIn space-y-6">
              <div>
                <h3 className="font-display text-xl font-semibold text-rose-800 mb-4">{t('booking.selectDate')}</h3>
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
                  {allSlots.some(isAvailable) ? (
                    <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 gap-2.5">
                      {allSlots.map((slot) => {
                        const available = isAvailable(slot);
                        const isSelected = selectedTime === slot;
                        return (
                          <TimeSlotChip
                            key={slot}
                            state={isSelected ? 'selected' : available ? 'available' : 'disabled'}
                            disabled={!available}
                            onClick={() => available && setSelectedTime(slot)}
                          >
                            {slot}
                          </TimeSlotChip>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-rose-600 text-sm py-8 text-center">{t('booking.noSlots')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Confirm */}
          {step === 3 && (
            <div className="animate-fadeIn space-y-6">
              <h3 className="font-display text-xl font-semibold text-rose-800 mb-2">{t('booking.summary')}</h3>

              <div className="rounded-2xl bg-cream-50 border border-cream-200 p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-rose-600">{t('booking.summary.service')}</span>
                  <span className="text-sm font-medium text-rose-800">{selectedService?.name[lang]}</span>
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
                  <span className="text-sm font-medium text-rose-800">{selectedService ? formatDuration(selectedService.duration, lang) : '—'}</span>
                </div>
                <div className="border-t border-cream-200 pt-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-rose-700">{t('booking.summary.price')}</span>
                  <span className="text-lg font-display font-semibold text-rose-800">{selectedService ? formatPrice(selectedService.price, lang) : '—'}</span>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="booking-name" className="label">{t('booking.clientName')}</label>
                  <input id="booking-name" name="name" type="text" autoComplete="name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder={t('booking.clientNamePlaceholder')} className="input" />
                </div>
                <div>
                  <label htmlFor="booking-phone" className="label">{t('booking.clientPhone')}</label>
                  <input id="booking-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder={t('booking.clientPhonePlaceholder')} className="input" dir="ltr" />
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-rose-700 mb-2 flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[#25D366]" strokeWidth={1.8} />
                  {t('booking.whatsappPreview')}
                </p>
                <div className="rounded-2xl bg-[#25D366]/5 border border-[#25D366]/20 p-4">
                  <pre className="text-xs text-rose-600 whitespace-pre-wrap font-sans leading-relaxed">{buildWhatsAppMessage()}</pre>
                </div>
                <p className="text-xs text-rose-600 mt-2">{t('booking.whatsappHint')}</p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-auto pt-6">
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
              <button onClick={handleWhatsAppSend} disabled={!canProceed()} className="btn-whatsapp">
                <MessageCircle className="w-5 h-5" strokeWidth={1.8} />
                {t('booking.whatsappSend')}
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
