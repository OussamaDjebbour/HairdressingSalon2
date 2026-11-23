import { useLang } from '../context/LanguageContext';
import { useSalon } from '../data/salon';
import { useSalonInfo } from '../data/salonSettings';
import { claimsSentence } from '../data/formatters';

/** "La maison": the salon's story as a quote, its founder, and its claims in one plain sentence. */
export function Philosophy() {
  const { t, lang } = useLang();
  const salon = useSalon();
  const city = useSalonInfo().data?.city[lang];

  if (!salon.story) return null;
  const claims = claimsSentence(t, lang, salon.yearsOpen, salon.clientCount, city);

  return (
    <section className="bg-rose-900 text-pearl-50 py-24 sm:py-32">
      <div className="max-w-3xl mx-auto px-6 sm:px-10">
        <blockquote className="font-display italic text-[clamp(1.75rem,4.5vw,3rem)] leading-[1.2] text-balance">
          {salon.story[lang]}
        </blockquote>

        {salon.storyIntro && (
          <p className="mt-8 text-[17px] leading-relaxed text-pearl-50/70 max-w-2xl text-pretty">{salon.storyIntro[lang]}</p>
        )}

        {salon.founderName && (
          <p className="mt-10 text-[15px] text-pearl-50/70">
            <span className="font-display italic text-xl text-pearl-50">{salon.founderName[lang]}</span>
            {salon.founderRole && <>{lang === 'ar' ? '، ' : ', '}{salon.founderRole[lang]}</>}
          </p>
        )}

        {claims && <p className="mt-6 text-[15px] text-pearl-50/70">{claims}</p>}
      </div>
    </section>
  );
}
