import { Clock, ArrowRight } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import type { Service } from '../data/types';
import { useServices } from '../data/queries';
import { formatPrice, formatDuration } from '../data/formatters';
import { SmartImage } from './SmartImage';
import { ServiceCardSkeleton } from './ServiceCardSkeleton';
import { DataError } from './DataError';
import { groupByCategory } from '../data/categories';
import { serviceIcon } from './serviceIcons';
import { useBookingIntent } from '../context/BookingIntentContext';

function ServiceTile({ service }: { service: Service }) {
  const { lang, t } = useLang();
  const { chooseService } = useBookingIntent();
  const Icon = serviceIcon(service.icon);

  return (
    <a
      href="#booking"
      onClick={() => chooseService(service.id)}
      className="group relative block overflow-hidden rounded-2xl aspect-[16/10] sm:aspect-[4/3] bg-rose-100 transition-shadow duration-300 ease-silk hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
    >
      {service.image ? (
        <div className="absolute inset-0 transition-transform duration-700 ease-silk group-hover:scale-[1.04]">
          <SmartImage src={service.image} alt="" aspect="h-full w-full" rounded="" />
        </div>
      ) : (
        // A service added in the settings has no photo yet: show its category icon instead of a shimmer.
        <Icon
          className="absolute top-4 end-4 w-16 h-16 text-rose-300/70"
          strokeWidth={1.2}
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-full bg-gradient-to-t from-rose-900/90 from-30% via-rose-900/80 via-60% to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5 text-cream-50">
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold leading-snug">{service.name[lang]}</h3>
          <p className="line-clamp-1 text-sm text-cream-50/90">{service.description[lang]}</p>
          <span className="mt-1 flex items-center gap-1.5 text-xs text-cream-50/90">
            <Clock className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden="true" />
            {formatDuration(service.duration, lang)}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="font-display text-lg font-semibold">{formatPrice(service.price, lang)}</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-300">
            {t('services.book')}
            <ArrowRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} aria-hidden="true" />
          </span>
        </div>
      </div>
    </a>
  );
}

export function Services() {
  const { t } = useLang();
  const { data: services, isLoading, isError, refetch } = useServices();

  return (
    <section id="services" className="relative py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mb-14">
          <p className="eyebrow mb-4">{t('services.kicker')}</p>
          <h2 className="font-display font-semibold text-rose-900 text-[clamp(2rem,4vw,3rem)] leading-tight">
            {t('services.title')}
          </h2>
          <p className="mt-4 text-lg text-rose-600 text-pretty">{t('services.subtitle')}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ServiceCardSkeleton key={i} />
            ))}
          </div>
        ) : isError ? (
          <DataError onRetry={() => refetch()} />
        ) : (
          <div className="space-y-12">
            {(() => {
              const groups = groupByCategory(services ?? []);
              return groups.map((group) => (
                <div key={group.category} className="space-y-6">
                  {groups.length > 1 && (
                    <h3 className="font-display text-xl font-semibold text-rose-800">{t(`category.${group.category}`)}</h3>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                    {group.items.map((service: Service) => (
                      <ServiceTile key={service.id} service={service} />
                    ))}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}
      </div>
    </section>
  );
}
