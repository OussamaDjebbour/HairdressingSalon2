import { Navigate, useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import { ServicesSettings } from '../components/settings/ServicesSettings';
import { StylistsSettings } from '../components/settings/StylistsSettings';
import { HoursSettings } from '../components/settings/HoursSettings';
import { ClosedDatesSettings } from '../components/settings/ClosedDatesSettings';
import { SalonInfoSettings } from '../components/settings/SalonInfoSettings';
import { SettingsLayout } from '../components/settings/SettingsLayout';

const SECTION_TITLES: Record<string, string> = {
  services: 'settings.services',
  stylists: 'settings.stylists',
  hours: 'settings.hours',
  'closed-dates': 'settings.closedDates',
  info: 'settings.info',
};

/** The five settings sub-screens. */
export function SettingsSectionPage() {
  const { t } = useLang();
  const { section = '' } = useParams();
  const titleKey = SECTION_TITLES[section];
  if (!titleKey) return <Navigate to="/admin/settings" replace />;
  return <SettingsLayout title={t(titleKey)} backTo="/admin/settings">{section === 'services' ? <ServicesSettings /> : section === 'stylists' ? <StylistsSettings /> : section === 'hours' ? <HoursSettings /> : section === 'closed-dates' ? <ClosedDatesSettings /> : <SalonInfoSettings />}</SettingsLayout>;
}
