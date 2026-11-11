import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClosedDates, SalonHours } from '../data/types';

const calls: string[] = [];
let loggedOut = false;
vi.mock('../lib/auth', () => ({
  useSession: () => ({ session: loggedOut ? null : { user: { id: 'u1' } }, loading: false }),
  signOut: vi.fn(async () => {
    calls.push('signOut');
  }),
}));
vi.mock('../lib/push', () => ({
  disablePush: vi.fn(async () => {
    calls.push('disablePush');
    return 'off';
  }),
}));
vi.mock('../components/admin/NotificationsCard', () => ({ NotificationsCard: () => <div>notifications-card</div> }));

const day = { opens: 540, closes: 1080 };
const hours: SalonHours = { 1: null, 2: day, 3: day, 4: day, 5: day, 6: day, 7: null };
let closed: ClosedDates[] = [];
let mySalon: { data?: string; isLoading: boolean; isError: boolean; error: unknown } = {
  data: 'elegance', isLoading: false, isError: false, error: null,
};
vi.mock('../data/queries', () => ({
  useAllServices: () => ({ data: Array.from({ length: 12 }, (_, i) => ({ id: `s${i}` })) }),
  useAllStylists: () => ({ data: Array.from({ length: 4 }, (_, i) => ({ id: `y${i}` })) }),
}));
vi.mock('../data/salonSettings', () => ({
  useSalonHours: () => ({ data: hours }),
  useClosedDates: () => ({ data: closed }),
}));
vi.mock('../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/admin')>()),
  useMySalon: () => mySalon,
}));

import { LanguageProvider } from '../context/LanguageContext';
import { SettingsPage } from './SettingsPage';
import { SettingsSectionPage } from './SettingsSectionPage';

function renderPage(path = '/admin/settings') {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <LanguageProvider>
          <Routes>
            <Route path="/admin/settings" element={<SettingsPage />} />
            <Route path="/admin/settings/:section" element={<SettingsSectionPage />} />
          </Routes>
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  calls.length = 0;
  loggedOut = false;
  closed = [];
  mySalon = { data: 'elegance', isLoading: false, isError: false, error: null };
});

describe('SettingsPage', () => {
  it('lists the five sections in order with summaries, each linking to its route', () => {
    closed = [
      { id: 'a', from: '2000-01-01', to: '2000-01-05', label: null },
      { id: 'b', from: '2099-03-16', to: '2099-03-20', label: null },
    ];
    renderPage();
    const rows = [
      ['Prestations & prix', '12 prestations', '/admin/settings/services'],
      ['Coiffeuses', '4 coiffeuses', '/admin/settings/stylists'],
      ['Horaires', '09:00–18:00 · fermé dim., lun.', '/admin/settings/hours'],
      ['Jours fermés', 'Prochain : 16 mars', '/admin/settings/closed-dates'],
      ['Infos du salon', 'Adresse · WhatsApp', '/admin/settings/info'],
    ];
    const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/admin/settings/'));
    expect(links).toHaveLength(5);
    rows.forEach(([label, summary, href], i) => {
      expect(links[i]).toHaveAttribute('href', href);
      expect(within(links[i]).getByText(label)).toBeInTheDocument();
      expect(within(links[i]).getByText(summary)).toBeInTheDocument();
    });
    expect(screen.getByText('notifications-card')).toBeInTheDocument();
  });

  it('says Aucun when no closed date is coming', () => {
    closed = [{ id: 'a', from: '2000-01-01', to: '2000-01-05', label: null }];
    renderPage();
    expect(screen.getByText('Aucun')).toBeInTheDocument();
  });

  it('goes back to /admin', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Retour' })).toHaveAttribute('href', '/admin');
  });

  it('stops notifications then signs out', async () => {
    renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: /Se déconnecter/ })[0]);
    await waitFor(() => expect(calls).toEqual(['disablePush', 'signOut']));
  });

  it('shows the other-salon message to staff of another salon', () => {
    mySalon = { data: 'rival', isLoading: false, isError: false, error: null };
    renderPage();
    expect(screen.getByText('Ce compte appartient à un autre salon.')).toBeInTheDocument();
    expect(screen.queryByText('Horaires')).not.toBeInTheDocument();
  });

  it('shows the other-salon message on a section route too', () => {
    mySalon = { data: 'rival', isLoading: false, isError: false, error: null };
    renderPage('/admin/settings/hours');
    expect(screen.getByText('Ce compte appartient à un autre salon.')).toBeInTheDocument();
  });

  it('shows the login form when logged out', () => {
    loggedOut = true;
    renderPage();
    expect(screen.getByText('Connexion')).toBeInTheDocument();
    expect(screen.queryByText('Horaires')).not.toBeInTheDocument();
  });
});
