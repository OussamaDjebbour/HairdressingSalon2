import { Scissors, Palette, Sparkles, Hand, Brush, Heart, Clock, ArrowRight } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { services, type Service } from '../data/services';
import { formatPrice, formatDuration } from '../data/formatters';
import { SmartImage } from './SmartImage';
import { Thread } from './Thread';

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
    <div className="card-hover group overflow-hidden flex flex-col">
      <div className="relative overflow-hidden">
        <SmartImage
          src={service.image}
          alt={service.name[lang]}
          aspect="aspect-[16/10]"
          rounded="rounded-none"
          className="group-hover:scale-105 transition-transform duration-500 ease-silk"
        />
        <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm text-sm font-semibold text-rose-700 shadow-soft">
          {formatPrice(service.price, lang)}
        </div>
        <div className="absolute bottom-3 left-3 flex items-center justify-center w-10 h-10 rounded-xl bg-rose-600 text-cream-50 shadow-soft">
          <Icon className="w-5 h-5" strokeWidth={1.8} />
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-display text-lg font-semibold text-rose-800 mb-1.5">{service.name[lang]}</h3>
        <p className="text-sm text-rose-500/80 leading-relaxed mb-4 flex-1">{service.description[lang]}</p>
        <div className="flex items-center justify-between pt-3 border-t border-cream-200">
          <div className="flex items-center gap-1.5 text-sm text-rose-400">
            <Clock className="w-4 h-4" strokeWidth={1.8} />
            {formatDuration(service.duration, lang)}
          </div>
          <a
            href="#booking"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 hover:text-rose-800 transition-colors group/link"
          >
            {t('services.book')}
            <ArrowRight className="w-4 h-4 group-hover/link:translate-x-0.5 transition-transform" strokeWidth={1.8} />
          </a>
        </div>
      </div>
    </div>
  );
}

export function Services() {
  const { t } = useLang();

  return (
    <section id="services" className="relative py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <Thread variant="accent" className="w-24 h-5 text-rose-400 mx-auto mb-4" />
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-rose-800 mb-3">{t('services.title')}</h2>
          <p className="text-rose-500/80 text-lg">{t('services.subtitle')}</p>
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
