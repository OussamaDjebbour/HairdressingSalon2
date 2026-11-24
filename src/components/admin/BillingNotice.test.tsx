import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { LanguageProvider, useLang } from '../../context/LanguageContext';
import { BillingNotice } from './BillingNotice';

function ToArabic() {
  const { toggleLang } = useLang();
  return <button onClick={toggleLang}>to-ar</button>;
}

function renderIt() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LanguageProvider>
        <ToArabic />
        <BillingNotice />
      </LanguageProvider>
    </QueryClientProvider>
  );
}

const answer = (data: unknown) => rpc.mockResolvedValue({ data, error: null });

beforeEach(() => rpc.mockReset());

describe('BillingNotice', () => {
  it('asks admin_billing', async () => {
    answer({ state: 'none' });
    renderIt();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_billing'));
  });

  it('a few days before: says until when it is paid, quietly', async () => {
    answer({ state: 'soon', paid_until: '2030-01-31', paused_from: '2030-02-04' });
    renderIt();
    const note = await screen.findByText('Votre abonnement est réglé jusqu’au 31 janvier.');
    expect(note.closest('[role]')).toBeNull();
  });

  it('during the grace days: warns when online booking will pause', async () => {
    answer({ state: 'grace', paid_until: '2030-01-31', paused_from: '2030-02-04' });
    renderIt();
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Votre abonnement a expiré le 31 janvier. Sans règlement, la réservation en ligne sera suspendue le 4 février.'
    );
  });

  it('once paused: says since when, and that the agenda still works', async () => {
    answer({ state: 'paused', paid_until: '2030-01-31', paused_from: '2030-02-04' });
    renderIt();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'La réservation en ligne est suspendue depuis le 4 février. Votre agenda fonctionne normalement. Réglez votre abonnement pour la rétablir.'
    );
  });

  it.each([
    ['ok', { state: 'ok', paid_until: '2030-03-31', paused_from: '2030-04-04' }],
    ['none', { state: 'none' }],
  ])('says nothing when %s', async (_name, data) => {
    answer(data);
    const { container } = renderIt();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('to-ar');
  });

  it('says nothing when the question fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const { container } = renderIt();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe('to-ar');
  });

  it('reads in Arabic', async () => {
    answer({ state: 'paused', paid_until: '2030-01-31', paused_from: '2030-02-04' });
    renderIt();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByText('to-ar'));
    expect(screen.getByRole('alert')).toHaveTextContent('الحجز عبر الموقع متوقف منذ 4 فيفري.');
  });
});
