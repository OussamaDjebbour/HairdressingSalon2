import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../lib/auth', () => ({
  useSession: () => ({ session: { user: { id: 'u1' } }, loading: false }),
  signOut: vi.fn(),
}));
vi.mock('../components/Schedule', () => ({ Schedule: () => <div>schedule</div> }));

import { LanguageProvider } from '../context/LanguageContext';
import { AdminPage } from './AdminPage';

function renderPage() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LanguageProvider>
          <AdminPage />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('AdminPage header', () => {
  it('offers a gear link to the settings when logged in', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/admin/settings');
  });
});

describe('AdminPage header', () => {
  it('keeps only the language switch and the gear (logout lives in Réglages → Compte)', () => {
    renderPage();
    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('button', { name: /Se déconnecter/ })).toBeNull();
    expect(within(header).getByRole('button', { name: 'Toggle language' })).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Réglages' })).toHaveClass('tap');
    expect(within(header).getByRole('button', { name: 'Toggle language' })).toHaveClass('tap');
  });
});

describe('AdminPage', () => {
  it('no longer shows the notifications card (it lives in the settings)', () => {
    renderPage();
    expect(screen.queryByText('Notifications des réservations')).not.toBeInTheDocument();
  });
});
