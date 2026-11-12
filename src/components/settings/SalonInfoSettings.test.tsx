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
    fireEvent.change(screen.getByLabelText(/^WhatsApp/), { target: { value: '0661 22 33 44' } });
    fireEvent.change(screen.getByLabelText(/^Instagram \(lien\)/), { target: { value: '' } });
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
    fireEvent.change(screen.getByLabelText(/^WhatsApp/), { target: { value: '' } });
    save();
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_save_salon_info', expect.objectContaining({ p_whatsapp: '' })));
  });

  it('shows the phone error on blur, before any Save', async () => {
    renderIt();
    const wa = screen.getByLabelText(/^WhatsApp/);
    fireEvent.change(wa, { target: { value: '12345' } });
    fireEvent.blur(wa);
    expect(await screen.findByText(/Numéro de mobile algérien invalide/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks an invalid phone client-side', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText(/^WhatsApp/), { target: { value: '123' } });
    save();
    await waitFor(() => expect(screen.getByLabelText(/^WhatsApp/)).toHaveAttribute('aria-invalid', 'true'));
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.getByText(/Numéro de mobile algérien invalide/)).toBeInTheDocument();
  });

  it('blocks a non-https link client-side', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText(/^Facebook \(lien\)/), { target: { value: 'facebook.com/x' } });
    save();
    await waitFor(() => expect(screen.getByLabelText(/^Facebook \(lien\)/)).toHaveAttribute('aria-invalid', 'true'));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks an uppercase HTTPS:// link like the server does', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText(/^Instagram \(lien\)/), { target: { value: 'HTTPS://instagram.com/x' } });
    save();
    await waitFor(() => expect(screen.getByLabelText(/^Instagram \(lien\)/)).toHaveAttribute('aria-invalid', 'true'));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('flags an address or city over 200 characters', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText('Adresse (français)'), { target: { value: 'x'.repeat(201) } });
    fireEvent.change(screen.getByLabelText('Ville (français)'), { target: { value: 'y'.repeat(201) } });
    save();
    await waitFor(() => expect(screen.getAllByText('Ce texte ne doit pas dépasser 200 caractères.')).toHaveLength(2));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('flags Facebook, not Instagram, for a bad Facebook link', async () => {
    renderIt();
    fireEvent.change(screen.getByLabelText(/^Facebook \(lien\)/), { target: { value: 'not a url' } });
    save();
    await waitFor(() => expect(screen.getByLabelText(/^Facebook \(lien\)/)).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByLabelText(/^Instagram \(lien\)/)).toHaveAttribute('aria-invalid', 'false');
  });

  it('marks the Arabic address optional with the fallback help, and keeps the WhatsApp help', () => {
    renderIt();
    expect(screen.getByText('العنوان (arabe)').closest('label')).toHaveTextContent('facultatif');
    expect(screen.getAllByText('Laissé vide, le texte français est utilisé.').length).toBeGreaterThan(0);
    expect(screen.getByText('Laissez vide pour masquer les liens WhatsApp sur le site.')).toBeInTheDocument();
  });

  it('marks WhatsApp, Instagram and Facebook optional', () => {
    renderIt();
    for (const id of ['info-whatsapp', 'info-instagram', 'info-facebook']) {
      expect(document.querySelector(`label[for="${id}"]`)).toHaveTextContent('(facultatif)');
    }
  });

  it('marks the WhatsApp field when the server says invalid_phone', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_phone' } });
    renderIt();
    save();
    await waitFor(() => expect(screen.getByLabelText(/^WhatsApp/)).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByLabelText(/^Instagram \(lien\)/)).toHaveAttribute('aria-invalid', 'false');
  });

  it('marks the Instagram field when the server says invalid_url', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'invalid_url' } });
    renderIt();
    save();
    await waitFor(() => expect(screen.getByLabelText(/^Instagram \(lien\)/)).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByLabelText(/^Facebook \(lien\)/)).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText('Le lien doit commencer par https://.')).toBeInTheDocument();
  });
});
