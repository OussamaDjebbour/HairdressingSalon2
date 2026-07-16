import { Award, Users, Scissors, Star } from 'lucide-react';
import { useLang } from '../context/LanguageContext';

export function TrustBadges() {
  const { t, lang } = useLang();

  const stats = [
    { icon: Award, value: '15+', label: t('trust.years'), color: 'text-rose-600', bg: 'bg-rose-100' },
    { icon: Users, value: '2 500+', label: t('trust.clients'), color: 'text-sage-600', bg: 'bg-sage-100' },
    { icon: Scissors, value: lang === 'ar' ? '٣' : '3', label: t('trust.stylists'), color: 'text-gold-600', bg: 'bg-gold-100' },
    { icon: Star, value: '4.9', label: t('trust.reviews'), color: 'text-amber-600', bg: 'bg-amber-100' },
  ];

  return (
    <section className="relative py-12 lg:py-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {stats.map((stat, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center p-6 rounded-2xl bg-white border border-cream-200 shadow-soft hover:shadow-card transition-shadow duration-300 ease-silk"
            >
              <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${stat.bg} mb-3`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} strokeWidth={1.8} />
              </div>
              <p className="font-display text-3xl font-semibold text-rose-800 mb-1">{stat.value}</p>
              <p className="text-sm text-rose-500/70">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
