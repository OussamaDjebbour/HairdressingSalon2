import { Scissors, Palette, Sparkles, Hand, Brush, Heart, Clock, ArrowRight } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { services, type Service } from '../data/services';
import { formatPrice, formatDuration } from '../data/formatters';
import { SmartImage } from './SmartImage';

const iconMap: Record<string, typeof Scissors> = {
  scissors: Scissors,
  palette: Palette,
  sparkles: Sparkles,
  hand: Hand,
  brush: Brush,
  heart: Heart,
};

function ServiceCard({ service }: { service: Service }) {
  const { lang, t } = useLang();
  const Icon = iconMap[service.icon] ?? Scissors;

  return (
    <article className="group flex flex-col bg-white rounded-2xl border border-cream-200 overflow-hidden transition-all duration-300 ease-silk hover:shadow-lift hover:-translate-y-0.5 hover:border-gold-200">
      <div className="relative overflow-hidden">
        <SmartImage
          src={service.image}
          alt={service.name[lang]}
          aspect="aspect-[16/11]"
          rounded="rounded-none"
          className="group-hover:scale-[1.04] transition-transform duration-700 ease-silk"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-rose-900/15 to-transparent" />
      </div>

      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-2.5 mb-2">
          <Icon className="w-4 h-4 text-gold-600 flex-shrink-0" strokeWidth={1.8} />
          <h3 className="font-display text-xl font-semibold text-rose-900">{service.name[lang]}</h3>
        </div>
        <p className="text-sm text-rose-600 leading-relaxed mb-6 flex-1 text-pretty">
          {service.description[lang]}
        </p>

        <div className="flex items-end justify-between pt-4 border-t border-cream-200">
          <div>
            <span className="block text-[0.65rem] uppercase tracking-[0.18em] text-rose-600 mb-1.5">
              {t('services.from')}
            </span>
            <span className="font-display text-lg font-semibold text-rose-900 inline-block border-b-2 border-gold-300 pb-0.5">
              {formatPrice(service.price, lang)}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2.5">
            <span className="flex items-center gap-1.5 text-xs text-rose-600">
              <Clock className="w-3.5 h-3.5" strokeWidth={1.8} />
              {formatDuration(service.duration, lang)}
            </span>
            <a
              href="#booking"
              className="link-gilt inline-flex items-center gap-1.5 text-sm font-medium text-rose-700 hover:text-rose-900 transition-colors"
            >
              {t('services.book')}
              <ArrowRight className="w-4 h-4 rtl:rotate-180" strokeWidth={1.8} />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

export function Services() {
  const { t } = useLang();

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </div>
    </section>
  );
}
