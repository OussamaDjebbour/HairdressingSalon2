import { Navigate, useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { ServicesSettings } from '../components/settings/ServicesSettings';
import { SettingsLayout } from '../components/settings/SettingsLayout';

const SECTION_TITLES: Record<string, string> = {
  services: 'settings.services',
  stylists: 'settings.stylists',
  hours: 'settings.hours',
  'closed-dates': 'settings.closedDates',
  info: 'settings.info',
};

/** The five sub-screens; each is filled in by its own task (the rest are still empty). */
export function SettingsSectionPage() {
  const { t } = useLang();
  const { section = '' } = useParams();
  const titleKey = SECTION_TITLES[section];
  if (!titleKey) return <Navigate to="/admin/settings" replace />;
  return <SettingsLayout title={t(titleKey)} backTo="/admin/settings">{section === 'services' ? <ServicesSettings /> : null}</SettingsLayout>;
}
