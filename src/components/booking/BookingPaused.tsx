import { MessageCircle } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { waLink } from '../../data/whatsapp';

/**
 * The booking section while online booking is paused (the salon's subscription): no wizard, just how to
 * reach the salon. Says nothing about payment.
 */
export function BookingPaused({ waNumber }: { waNumber: string | null }) {
  const { t } = useLang();
  return (
    <section id="booking" className="relative py-20 lg:py-28 bg-pearl-100">
      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="font-display font-semibold leading-tight text-rose-900 text-[clamp(2rem,4vw,3rem)] mb-6">{t('booking.title')}</h2>
        <p className="text-lg text-rose-900">{t('booking.paused.title')}</p>
        <p className="mt-2 text-rose-900/70">{t(waNumber ? 'booking.paused.whatsapp' : 'booking.paused.noWhatsapp')}</p>
        {waNumber && (
          <a href={waLink(waNumber)} target="_blank" rel="noopener noreferrer" className="btn-whatsapp mt-6">
            <MessageCircle className="w-4 h-4" strokeWidth={1.8} aria-hidden="true" />
            {t('booking.contactWhatsapp')}
          </a>
        )}
      </div>
    </section>
  );
}
