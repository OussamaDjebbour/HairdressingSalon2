import { Navigate, useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { SettingsLayout } from '../components/settings/SettingsLayout';

const SECTION_TITLES: Record<string, string> = {
  services: 'settings.services',
  stylists: 'settings.stylists',
  hours: 'settings.hours',
  'closed-dates': 'settings.closedDates',
  info: 'settings.info',
};

/** Placeholder for the five sub-screens; each is filled by its own task. */
export function SettingsSectionPage() {
  const { t } = useLang();
  const { section = '' } = useParams();
  const titleKey = SECTION_TITLES[section];
  if (!titleKey) return <Navigate to="/admin/settings" replace />;
  return <SettingsLayout title={t(titleKey)} backTo="/admin/settings">{null}</SettingsLayout>;
}
