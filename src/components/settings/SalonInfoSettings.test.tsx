import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

vi.mock('../../data/salonSettings', async (orig) => ({
  ...(await orig<typeof import('../../data/salonSettings')>()),
  useSalonInfo: () => ({
    data: {
      address: { fr: '12 rue Didouche', ar: 'شارع ديدوش' },
      city: { fr: 'Alger', ar: 'الجزائر' },
      whatsapp: '0555 12 34 56',
      instagramUrl: 'https://instagram.com/elegance',
      facebookUrl: null,
    },
  }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { SalonInfoSettings } from './SalonInfoSettings';

function renderIt() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <LanguageProvider>
          <SalonInfoSettings />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('SalonInfoSettings', () => {
  it('sends the five params, phone as typed and cleared Instagram as empty string', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '0661 22 33 44' } });
    fireEvent.change(screen.getByLabelText('Instagram (lien)'), { target: { value: '' } });
    save();
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_salon_info', {
        p_address: { fr: '12 rue Didouche', ar: 'شارع ديدوش' },
        p_city: { fr: 'Alger', ar: 'الجزائر' },
        p_whatsapp: '0661 22 33 44',
        p_instagram_url: '',
        p_facebook_url: '',
      })
    );
  });

  it('allows an empty WhatsApp', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '' } });
    save();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_save_salon_info', expect.objectContaining({ p_whatsapp: '' })));
  });

  it('blocks an invalid phone client-side', () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('WhatsApp'), { target: { value: '123' } });
    save();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByLabelText('WhatsApp')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert').textContent).toContain('WhatsApp invalide');
  });

  it('blocks a non-https link client-side', () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Facebook (lien)'), { target: { value: 'facebook.com/x' } });
    save();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Facebook (lien)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks the Instagram field when the server says invalid_url', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_url' } });
    renderIt();
    save();
    await waitFor(() => expect(screen.getByLabelText('Instagram (lien)')).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByRole('alert').textContent).toContain('https://');
  });
});
