import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import type { Service } from '../data/types';
import { useServices, useCategories } from '../data/queries';
import { formatDuration } from '../data/formatters';
import { DataError } from './DataError';
import { categoryLabel, groupServices, largestGroup, type CategoryKey } from '../data/categories';
import { CategorySection } from './CategorySection';
import { useBookingIntent } from '../context/BookingIntentContext';
import { effectivePrice } from '../data/pricing';
import { PriceTag } from './PriceTag';
import { PackIncludes } from './PackIncludes';

/** One line of the carte: tapping it opens the booking on that service. */
function Row({ service }: { service: Service }) {
  const { lang, t } = useLang();
  const { chooseService } = useBookingIntent();
  const { price, regular } = effectivePrice(service);

  return (
    <li>
      <a
        href="#booking"
        onClick={() => chooseService(service.id)}
        className="group flex gap-4 sm:gap-5 py-5 border-b border-rose-900/10 transition-colors duration-300 hover:border-rose-900/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-rose-900"
      >
        {service.image && (
          <img
            src={service.image}
            alt=""
            loading="lazy"
            className="w-28 sm:w-36 aspect-[3/4] object-cover shrink-0 self-start"
          />
        )}
        <span className="flex flex-1 flex-col min-w-0">
          <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="min-w-0 break-words font-display text-[1.3rem] sm:text-[1.65rem] leading-tight text-rose-900 group-hover:italic">
              {service.name[lang]}
            </span>
            <span className="font-display text-[1.2rem] sm:text-[1.45rem] leading-tight text-rose-900 tabular-nums text-end">
              <PriceTag price={price} regular={regular} />
            </span>
          </span>
          <span className="mt-1.5 text-[15px] leading-relaxed text-rose-900/75 text-pretty">{service.description[lang]}</span>
          {service.category === 'pack' && (
            <PackIncludes service={service} className="mt-1.5 text-[15px] leading-relaxed text-rose-900/75 text-pretty" />
          )}
          <span className="mt-2 flex items-center justify-between gap-4 text-sm">
            <span className="text-rose-900/70 whitespace-nowrap">{formatDuration(service.duration, lang)}</span>
            <span className="inline-flex items-center gap-1 text-rose-900 underline decoration-rose-900/25 underline-offset-4 group-hover:decoration-rose-900">
              {t('services.book')}
              <ChevronRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.6} aria-hidden="true" />
            </span>
          </span>
        </span>
      </a>
    </li>
  );
}

export function Services() {
  const { t, lang } = useLang();
  const servicesQ = useServices();
  const categoriesQ = useCategories();
  const services = servicesQ.data;
  const custom = categoriesQ.data ?? [];
  const isLoading = servicesQ.isLoading || categoriesQ.isLoading;
  const isError = servicesQ.isError || categoriesQ.isError;
  const refetch = () => {
    if (servicesQ.isError) servicesQ.refetch();
    if (categoriesQ.isError) categoriesQ.refetch();
  };
  const groups = groupServices(services ?? [], custom);
  // The largest category is open until the client opens or closes others (several may be open).
  const [openKeys, setOpenKeys] = useState<CategoryKey[] | null>(null);
  const open = openKeys ?? (groups.length ? [largestGroup(groups)!.key] : []);
  const list = (items: Service[]) => (
    <ul>
      {items.map((service) => (
        <Row key={service.id} service={service} />
      ))}
    </ul>
  );

  return (
    <section id="services" className="bg-pearl-50 text-rose-900 scroll-mt-16">
      <div className="max-w-3xl mx-auto px-6 sm:px-10 pt-24 sm:pt-32 pb-24 sm:pb-32">
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
            <DataError onRetry={refetch} />
          </div>
        ) : (
          <div className="mt-12">
            {groups.length === 1 ? (
              <div className="border-t border-rose-900/10">{list(groups[0].items)}</div>
            ) : (
              <div className="border-t border-rose-900/10">
                {groups.map(({ key, items }) => {
                  const isOpen = open.includes(key);
                  return (
                    <CategorySection
                      key={key}
                      as="h3"
                      id={`carte-${key}`}
                      label={categoryLabel(key, custom, t, lang)}
                      count={items.length}
                      open={isOpen}
                      onToggle={() => setOpenKeys(isOpen ? open.filter((k) => k !== key) : [...open, key])}
                    >
                      {list(items)}
                    </CategorySection>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
