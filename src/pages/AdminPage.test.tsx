import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const calls: string[] = [];
vi.mock('../lib/auth', () => ({
  useSession: () => ({ session: { user: { id: 'u1' } }, loading: false }),
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

describe('AdminPage logout', () => {
  it('stops notifications on this device before signing out', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Se déconnecter/ }));
    await waitFor(() => expect(calls).toEqual(['disablePush', 'signOut']));
  });
});

describe('AdminPage', () => {
  it('no longer shows the notifications card (it lives in the settings)', () => {
    renderPage();
    expect(screen.queryByText('Notifications des réservations')).not.toBeInTheDocument();
  });
});
