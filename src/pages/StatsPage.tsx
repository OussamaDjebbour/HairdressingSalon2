import { useLang } from '../context/LanguageContext';
import { SettingsLayout } from '../components/settings/SettingsLayout';
import { StatsView } from '../components/admin/StatsView';

/** /admin/stats: the owner's Statistiques, in the back-office chrome with a back arrow to the agenda. */
export function StatsPage() {
  const { t } = useLang();
  return (
    <SettingsLayout title={t('stats.title')} backTo="/admin">
      <StatsView />
    </SettingsLayout>
  );
}
