import { Link } from 'react-router-dom';
import { Instagram, Facebook } from 'lucide-react';
import { useLang } from '../context/LanguageContext';
import { useSalon } from '../data/salon';
import { useSalonHours, useSalonInfo } from '../data/salonSettings';
import { groupHours } from '../data/hours';
import { formatDayName, formatPhone, salonSubtitle } from '../data/formatters';
import { minutesToTime } from '../data/week';
import { toWaNumber } from '../data/whatsapp';
import type { Weekday } from '../data/types';

/** A date falling on the given ISO weekday (1 January 2024 was a Monday). */
const dayName = (wd: Weekday, lang: 'fr' | 'ar') => formatDayName(new Date(2024, 0, wd), lang);

/** Section headings: small display italic, sentence case. */
const heading = 'font-display italic text-xl text-gold-200 mb-4';
const textLink =
  'inline-flex items-center gap-2 min-h-[44px] text-[15px] text-pearl-50/80 underline decoration-pearl-50/25 underline-offset-[6px] hover:text-pearl-50 hover:decoration-gold-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';

export function Footer() {
  const { t, lang } = useLang();
  const salon = useSalon();
  const info = useSalonInfo().data;
  const hours = useSalonHours().data;

  return (
    <footer id="contact" className="bg-rose-900 text-pearl-50">
      <div className="max-w-6xl mx-auto px-6 sm:px-10 pt-20 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          <div>
            <h3 className="font-display text-[2rem] leading-none">{salon.name[lang]}</h3>
            <p className="mt-2 text-[15px] text-gold-200">{info?.city[lang]}</p>
            <p className="mt-5 text-[15px] text-pearl-50/65 leading-relaxed max-w-xs">{salonSubtitle(t, lang, info?.city[lang])}</p>
          </div>

          <div>
            <h4 className={heading}>{t('contact.address')}</h4>
            <p className="text-[15px] text-pearl-50/70 leading-relaxed">
              {info?.address[lang].split('\n').map((line, i) => (
                <span key={i} className="block">{line}</span>
              ))}
            </p>
          </div>

          <div>
            <h4 className={heading}>{t('contact.hours')}</h4>
            <ul className="space-y-2 text-[15px] text-pearl-50/70">
              {hours &&
                groupHours(hours).map((g) => (
                  <li key={g.from} className={`flex justify-between gap-4 ${g.hours ? '' : 'text-pearl-50/60'}`}>
                    <span>
                      {g.from === g.to
                        ? dayName(g.from, lang)
                        : `${dayName(g.from, lang)} – ${dayName(g.to, lang)}`}
                    </span>
                    <span dir="ltr">
                      {g.hours ? `${minutesToTime(g.hours.opens)} – ${minutesToTime(g.hours.closes)}` : t('common.closed')}
                    </span>
                  </li>
                ))}
            </ul>
          </div>

          <div>
            <h4 className={heading}>{t('contact.phone')}</h4>
            {info?.whatsapp && (
              <a href={`tel:+${toWaNumber(info.whatsapp)}`} className={textLink} dir="ltr">
                {formatPhone(info.whatsapp)}
              </a>
            )}
            {(info?.instagramUrl || info?.facebookUrl) && (
              <div className="mt-6 flex flex-col items-start gap-1">
                {info?.instagramUrl && (
                  <a href={info.instagramUrl} className={textLink} target="_blank" rel="noopener noreferrer">
                    <Instagram className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" />
                    Instagram
                  </a>
                )}
                {info?.facebookUrl && (
                  <a href={info.facebookUrl} className={textLink} target="_blank" rel="noopener noreferrer">
                    <Facebook className="w-4 h-4" strokeWidth={1.6} aria-hidden="true" />
                    Facebook
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-16 pt-6 border-t border-pearl-50/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-[13px] text-pearl-50/50">
          <p>© {new Date().getFullYear()} {salon.name[lang]}. {t('footer.rights')}</p>
          <Link to="/admin" className="inline-flex items-center min-h-[44px] hover:text-pearl-50 transition-colors">
            {t('admin.label')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
