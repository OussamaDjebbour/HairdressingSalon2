import { useLang } from '../context/LanguageContext';
import { useCatalogue } from '../data/queries';
import type { Service } from '../data/types';

/** What a pack includes, in its order. Hidden services are named too (the catalogue holds every service). */
export function PackIncludes({ service, className }: { service: Service; className?: string }) {
  const { lang, t } = useLang();
  const { data } = useCatalogue();
  if (service.includes.length === 0 || !data) return null;
  const names = service.includes.flatMap((id) => data.filter((s) => s.id === id).map((s) => s.name[lang]));
  if (names.length === 0) return null;
  return <span className={className}>{t('services.includes').replace('{list}', names.join(', '))}</span>;
}
