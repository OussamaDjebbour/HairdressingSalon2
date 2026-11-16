import { useLang } from '../context/LanguageContext';
import type { Service } from '../data/types';
import { useServices } from '../data/queries';
import { formatPrice, formatDuration } from '../data/formatters';
import { DataError } from './DataError';
import { groupByCategory } from '../data/categories';
import { useBookingIntent } from '../context/BookingIntentContext';

/** How many service photos open the section, as a strip of results. */
const STRIP_SIZE = 3;

/** One line of the carte: tapping it opens the booking on that service. */
function Row({ service }: { service: Service }) {
  const { lang } = useLang();
  const { chooseService } = useBookingIntent();

  return (
    <li>
      <a
        href="#booking"
        onClick={() => chooseService(service.id)}
        className="group flex gap-4 sm:gap-5 py-6 border-b border-rose-900/10 transition-colors duration-300 hover:border-rose-900/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-900"
      >
        {service.image && (
          <img
            src={service.image}
            alt=""
            loading="lazy"
            className="w-14 sm:w-16 aspect-[3/4] object-cover shrink-0 self-start"
          />
        )}
        <span className="grid flex-1 grid-cols-[1fr_auto] gap-x-6 gap-y-1 min-w-0">
          <span className="font-display text-[1.45rem] sm:text-[1.65rem] leading-tight text-rose-900 group-hover:italic">
            {service.name[lang]}
          </span>
          <span className="font-display text-[1.3rem] sm:text-[1.45rem] leading-tight text-rose-900 tabular-nums whitespace-nowrap self-baseline">
            {formatPrice(service.price, lang)}
          </span>
          <span className="text-[15px] leading-relaxed text-rose-900/75 max-w-md">{service.description[lang]}</span>
          <span className="text-sm text-rose-900/70 text-end self-start pt-0.5 whitespace-nowrap">
            {formatDuration(service.duration, lang)}
          </span>
        </span>
      </a>
    </li>
  );
}

/** Three tall photos of results, the middle one set lower; scrolls sideways on a phone. Decorative. */
function Strip({ images }: { images: string[] }) {
  return (
    <div data-strip aria-hidden="true" className="max-w-6xl mx-auto flex gap-3 sm:gap-5 overflow-x-auto no-scrollbar snap-x px-6 sm:px-10 pt-6 pb-2">
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          className={`snap-start shrink-0 w-[62vw] sm:w-auto sm:flex-1 aspect-[3/4] object-cover ${i === 1 ? 'mt-10 sm:mt-16' : ''}`}
        />
      ))}
    </div>
  );
}

export function Services() {
  const { t } = useLang();
  const { data: services, isLoading, isError, refetch } = useServices();
  const groups = groupByCategory(services ?? []);
  // Two services may share a photo: show each photo once.
  const stripImages = [...new Set((services ?? []).map((s) => s.image).filter(Boolean))].slice(0, STRIP_SIZE);

  return (
    <section id="services" className="bg-pearl-50 text-rose-900 scroll-mt-16">
      {stripImages.length > 0 && <Strip images={stripImages} />}

      <div className="max-w-3xl mx-auto px-6 sm:px-10 pt-16 sm:pt-24 pb-24 sm:pb-32">
        <h2 className="font-display text-[clamp(2.75rem,10vw,5rem)] leading-none tracking-[-0.01em]">
          {t('services.title')}
        </h2>
        <p className="mt-5 text-[17px] leading-relaxed text-rose-900/65 max-w-md text-pretty">{t('services.subtitle')}</p>

        {isLoading ? (
          <ul className="mt-14 border-t border-rose-900/10" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} data-placeholder className="py-6 border-b border-rose-900/10">
                <span className="block h-6 w-2/3 bg-rose-900/5" />
                <span className="mt-3 block h-4 w-1/2 bg-rose-900/5" />
              </li>
            ))}
          </ul>
        ) : isError ? (
          <div className="mt-14">
            <DataError onRetry={() => refetch()} />
          </div>
        ) : (
          <div className="mt-14 space-y-16">
            {groups.map((group) => (
              <div key={group.category}>
                {groups.length > 1 && (
                  <h3 className="font-display italic text-[1.35rem] text-gold-700 mb-2">{t(`category.${group.category}`)}</h3>
                )}
                <ul className="border-t border-rose-900/10">
                  {group.items.map((service) => (
                    <Row key={service.id} service={service} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
