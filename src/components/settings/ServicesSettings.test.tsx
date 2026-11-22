import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Service } from '../../data/types';
import { pickOption, optionNames } from '../../test/select';

const rpc = vi.fn();
const upload = vi.fn();
const removeFiles = vi.fn();
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    storage: { from: () => ({ upload: (...a: unknown[]) => upload(...a), remove: (...a: unknown[]) => removeFiles(...a) }) },
  },
}));

const preparePhoto = vi.fn();
vi.mock('../../lib/photo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/photo')>()),
  preparePhoto: (...a: unknown[]) => preparePhoto(...a),
}));
import { PhotoError } from '../../lib/photo';

let role: 'owner' | 'demo' | null = 'owner';
vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useMyRole: () => role,
}));

const svc = (id: string, fr: string, active: boolean, sortOrder: number): Service => ({
  id, category: 'coiffure', name: { fr, ar: `${fr}-ar` }, description: { fr: 'd', ar: 'د' },
  price: 3000, duration: 45, image: '', icon: '', active, sortOrder, customCategoryId: null, includes: [], packStylistId: null, promo: null,
});
let services: Service[] = [];
let servicesQuery: { data?: Service[]; isLoading: boolean; isError: boolean; refetch?: () => void } | null = null;
let cats: import('../../data/categories').CustomCategory[] = [];
vi.mock('../../data/queries', () => ({
  useAllServices: () => servicesQuery ?? { data: services, isLoading: false, isError: false },
  useCategories: () => ({ data: cats, isLoading: false, isError: false }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { FeedbackProvider } from '../admin/feedback';
import { ServicesSettings } from './ServicesSettings';

function renderIt(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LanguageProvider><FeedbackProvider>
          <ServicesSettings />
        </FeedbackProvider></LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const affectedRow = { id: 'b1', starts_at: '2030-01-08T09:00:00Z', client_name: 'Sara', reason: 'service_hidden' };

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation(async (fn: string) => (fn === 'admin_affected_bookings' ? { data: [], error: null } : { data: null, error: null }));
  services = [svc('h1', 'Hidden cut', false, 1), svc('a1', 'Brushing', true, 2), svc('a2', 'Coloration', true, 3)];
  servicesQuery = null;
  cats = [];
  role = 'owner';
  upload.mockReset();
  upload.mockResolvedValue({ error: null });
  removeFiles.mockReset();
  removeFiles.mockResolvedValue({ error: null });
  preparePhoto.mockReset();
  preparePhoto.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('ServicesSettings while the list is not in', () => {
  it('shows a loading state, not an empty list', () => {
    servicesQuery = { data: undefined, isLoading: true, isError: false };
    renderIt();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
    expect(screen.queryByTestId('service-name')).toBeNull();
  });

  it('shows a retry when loading failed', () => {
    const refetch = vi.fn();
    servicesQuery = { data: undefined, isLoading: false, isError: true, refetch };
    renderIt();
    expect(screen.getByText('Impossible de charger le contenu.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(refetch).toHaveBeenCalled();
  });
});

describe('ServicesSettings', () => {
  it('an empty Save shows the name and the price errors together', async () => {
    renderIt();
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Le nom est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Indiquez un prix en dinars, sans centimes (0 à 1 000 000).')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('admin_save_service', expect.anything());
  });

  it('saves a service moved to the Spa category', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    pickOption('Catégorie', 'Spa & hammam');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.objectContaining({ p_id: 'a1', p_category: 'spa' }))
    );
  });

  it('shows Spa selected when editing a spa service', () => {
    services = [{ ...svc('sp', 'Hammam', true, 1), category: 'spa' }];
    renderIt();
    fireEvent.click(screen.getByText('Hammam'));
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Spa');
  });

  it('shows an off-list duration with its unit', () => {
    services = [{ ...svc('a1', 'Brushing', true, 2), duration: 50 }];
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    expect(screen.getByLabelText('Durée')).toHaveTextContent('50 min');
  });

  it('refuses a price with decimals', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.change(screen.getByLabelText('Prix (DA)'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Indiquez un prix en dinars, sans centimes (0 à 1 000 000).')).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalledWith('admin_save_service', expect.anything());
  });

  it('shows with a chevron that a service opens for editing', () => {
    renderIt();
    const row = screen.getAllByTestId('service-name')[0].closest('li')!;
    expect(row.querySelector('.lucide-chevron-right')).not.toBeNull();
  });

  it('lists active services first, then hidden ones marked Masquée', () => {
    renderIt();
    const names = screen.getAllByTestId('service-name').map((n) => n.textContent);
    expect(names).toEqual(['Brushing', 'Coloration', 'Hidden cut']);
    expect(screen.getAllByText('Masquée')).toHaveLength(1);
  });

  it('saves with typed values: integer price, duration from the select', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.change(screen.getByLabelText('Prix (DA)'), { target: { value: '3500' } });
    pickOption('Durée', '60 min');
    fireEvent.change(screen.getByLabelText('Ordre d’affichage'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', {
        p_id: 'a1',
        p_name: { fr: 'Brushing', ar: 'Brushing-ar' },
        p_description: { fr: 'd', ar: 'د' },
        p_category: 'coiffure',
        p_custom_category_id: null,
        p_price: 3500,
        p_duration: 60,
        p_sort_order: 7,
        p_includes: [], p_pack_stylist_id: null, p_promo_price: null, p_promo_from: null, p_promo_to: null,
      })
    );
  });

  it('shows the price error when the server answers invalid_price', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'admin_save_service' ? { data: null, error: { message: 'invalid_price' } } : { data: [], error: null }
    );
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Le prix doit être/)).toBeInTheDocument();
  });

  it('hides a service, then lists affected bookings with a deep link', async () => {
    rpc.mockImplementation(async (fn: string) =>
      fn === 'admin_affected_bookings' ? { data: [affectedRow], error: null } : { data: null, error: null }
    );
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Masquer' })[0]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_service_active', { p_id: 'a1', p_active: false }));
    expect(await screen.findByText('Prestation masquée')).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: /Sara/ });
    expect(link).toHaveAttribute('href', '/admin?day=2030-01-08&booking=b1');
  });

  it('the service list marks a running promotion', () => {
    services = [
      svc('a1', 'Brushing', true, 1),
      { ...svc('a2', 'Coloration', true, 2), promo: { price: 2000, from: '2000-01-01', to: '2999-12-31' } },
      { ...svc('p1', 'Pack', true, 3), category: 'pack' },
    ];
    renderIt();
    expect(screen.getAllByTestId('service-name').map((n) => n.textContent)).toEqual(['Brushing', 'Coloration']);
    expect(screen.getByText(/Promotion en cours/)).toHaveTextContent('2 000 DA');
  });

  it('the service form doesn\'t offer the pack category', () => {
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    expect(optionNames('Catégorie')).toEqual([
      'Coiffure', 'Soins capillaires', 'Visage', 'Regard (cils & sourcils)', 'Ongles', 'Épilation', 'Maquillage', 'Beauté', 'Spa & hammam', 'Massage',
    ]);
  });

  it('offers her categories after the ready-made ones and saves one as custom', async () => {
    cats = [{ id: 'c1', name: { fr: 'Soins mariée', ar: 'عروس' }, sortOrder: 1 }];
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    expect(optionNames('Catégorie').slice(-2)).toEqual(['Massage', 'Soins mariée']);
    pickOption('Catégorie', 'Soins mariée');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.objectContaining({ p_category: 'custom', p_custom_category_id: 'c1' }))
    );
  });

  it('preselects her category when editing a custom service', () => {
    cats = [{ id: 'c1', name: { fr: 'Soins mariée', ar: 'عروس' }, sortOrder: 1 }];
    services = [{ ...svc('a1', 'Forfait', true, 1), category: 'custom', customCategoryId: 'c1' }];
    renderIt();
    fireEvent.click(screen.getByText('Forfait'));
    expect(screen.getByRole('combobox', { name: 'Catégorie' })).toHaveTextContent('Soins mariée');
  });

  it('saving a ready-made category sends no custom id', async () => {
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    pickOption('Catégorie', 'Ongles');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.objectContaining({ p_category: 'ongles', p_custom_category_id: null }))
    );
  });

  it('groups the list under category headings in order', () => {
    cats = [{ id: 'c1', name: { fr: 'Soins mariée', ar: 'عروس' }, sortOrder: 1 }];
    services = [
      { ...svc('a1', 'Forfait', true, 1), category: 'custom', customCategoryId: 'c1' },
      { ...svc('a2', 'Vernis', true, 2), category: 'ongles' },
      svc('a3', 'Brushing', true, 3),
    ];
    renderIt();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Coiffure', 'Ongles', 'Soins mariée']);
    expect(screen.getAllByTestId('service-name').map((n) => n.textContent)).toEqual(['Brushing', 'Vernis', 'Forfait']);
  });

  it('keeps an existing promotion when the service is saved', async () => {
    services = [{ ...svc('a1', 'Brushing', true, 1), promo: { price: 2000, from: '2000-01-01', to: '2999-12-31' } }];
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.objectContaining({ p_promo_price: 2000, p_promo_from: '2000-01-01', p_promo_to: '2999-12-31' }))
    );
  });

  it('removing the promotion saves without one', async () => {
    services = [{ ...svc('a1', 'Brushing', true, 1), promo: { price: 2000, from: '2000-01-01', to: '2999-12-31' } }];
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer la promotion' }));
    expect(screen.queryByRole('button', { name: 'Retirer la promotion' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.objectContaining({ p_promo_price: null, p_promo_from: null, p_promo_to: null }))
    );
  });

  it('shows no card when nothing is affected', async () => {
    renderIt();
    fireEvent.click(screen.getAllByRole('button', { name: 'Masquer' })[0]);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_set_service_active', { p_id: 'a1', p_active: false }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_affected_bookings'));
    expect(screen.queryByText(/Ces rendez-vous ne respectent plus/)).not.toBeInTheDocument();
  });
});

const photoRpcs = () => rpc.mock.calls.filter((c) => c[0] === 'admin_set_service_photo');
const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const pick = () => fireEvent.change(fileInput(), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
const fillNew = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
  fireEvent.change(screen.getByLabelText('Nom (français)'), { target: { value: 'Soin' } });
  fireEvent.change(screen.getByLabelText('Prix (DA)'), { target: { value: '2000' } });
};

describe('ServicesSettings photo', () => {
  it('a new service without a photo shows the icon and saves without photo calls', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'admin_save_service' ? { data: 'new-1', error: null } : { data: [], error: null }));
    renderIt();
    fillNew();
    expect(screen.getByRole('button', { name: 'Ajouter une photo' })).toBeInTheDocument();
    expect(document.querySelector('.lucide-scissors')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Prestation ajoutée')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
    expect(photoRpcs()).toHaveLength(0);
  });

  it('picking a file previews it, then saving uploads and attaches it', async () => {
    rpc.mockImplementation(async (fn: string) => (fn === 'admin_save_service' ? { data: 'new-1', error: null } : { data: null, error: null }));
    renderIt();
    fillNew();
    pick();
    expect(await screen.findByRole('button', { name: 'Changer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Prestation ajoutée')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(1);
    const path = upload.mock.calls[0][0] as string;
    expect(photoRpcs()).toEqual([['admin_set_service_photo', { p_id: 'new-1', p_path: path }]]);
  });

  it('removing the current photo sends a null path', async () => {
    services = [{ ...svc('a1', 'Brushing', true, 2), image: 'https://x.test/a.jpg' }];
    rpc.mockImplementation(async (fn: string) => (fn === 'admin_save_service' ? { data: 'a1', error: null } : { data: null, error: null }));
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    expect(document.querySelector('img[src="https://x.test/a.jpg"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(screen.getByRole('button', { name: 'Ajouter une photo' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(photoRpcs()).toEqual([['admin_set_service_photo', { p_id: 'a1', p_path: null }]]));
  });

  it('Annuler after picking sends nothing', async () => {
    renderIt();
    fillNew();
    pick();
    await screen.findByRole('button', { name: 'Changer' });
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('admin_save_service', expect.anything());
    expect(photoRpcs()).toHaveLength(0);
  });

  it('a file that is not a photo shows an alert and keeps the previous photo', async () => {
    preparePhoto.mockRejectedValue(new PhotoError('photo_not_image'));
    renderIt();
    fillNew();
    pick();
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce fichier n’est pas une photo.');
    expect(screen.getByRole('button', { name: 'Ajouter une photo' })).toBeInTheDocument();
  });

  it('disables Enregistrer while the photo is being prepared', async () => {
    let resolve!: (b: Blob) => void;
    preparePhoto.mockReturnValue(new Promise<Blob>((r) => { resolve = r; }));
    renderIt();
    fillNew();
    pick();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Ajouter une photo' })).toBeDisabled();
    resolve(new Blob(['x']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled());
  });

  it('retries an update of the created service after the photo step failed', async () => {
    let failOnce = true;
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'admin_save_service') return { data: 'new-1', error: null };
      if (fn === 'admin_set_service_photo' && failOnce) { failOnce = false; return { data: null, error: { message: 'invalid_photo' } }; }
      return { data: null, error: null };
    });
    renderIt();
    fillNew();
    pick();
    await screen.findByRole('button', { name: 'Changer' });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/La photo n’a pas pu être enregistrée/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText('Prestation ajoutée');
    const saves = rpc.mock.calls.filter((c) => c[0] === 'admin_save_service').map((c) => (c[1] as { p_id: string | null }).p_id);
    expect(saves).toEqual([null, 'new-1']);
  });

  it('locks the photo buttons while the save is pending', async () => {
    services = [{ ...svc('a1', 'Brushing', true, 2), image: 'https://x.test/a.jpg' }];
    let resolve!: (v: unknown) => void;
    rpc.mockImplementation((fn: string) => (fn === 'admin_save_service'
      ? new Promise((r) => { resolve = r; })
      : Promise.resolve({ data: null, error: null })));
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Changer' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Retirer' })).toBeDisabled();
    resolve({ data: 'a1', error: null });
  });

  it('invalidates the services list when the photo step fails on an existing service', async () => {
    services = [svc('a1', 'Brushing', true, 2)];
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'admin_save_service') return { data: 'a1', error: null };
      if (fn === 'admin_set_service_photo') return { data: null, error: { message: 'invalid_photo' } };
      return { data: null, error: null };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    renderIt(client);
    fireEvent.click(screen.getByText('Brushing'));
    pick();
    await screen.findByRole('button', { name: 'Changer' });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByText(/La photo n’a pas pu être enregistrée/);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['services'] });
  });

  it('demo: tapping Ajouter une photo explains and opens nothing', async () => {
    role = 'demo';
    renderIt();
    fillNew();
    const click = vi.spyOn(fileInput(), 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une photo' }));
    expect(screen.getByRole('status')).toHaveTextContent('Les photos ne peuvent pas être changées dans la démo.');
    expect(click).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.anything()));
    expect(upload).not.toHaveBeenCalled();
    expect(photoRpcs()).toHaveLength(0);
  });

  it('demo: Retirer explains, keeps the preview and sends no photo call', async () => {
    role = 'demo';
    services = [{ ...svc('a1', 'Brushing', true, 2), image: 'https://x.test/a.jpg' }];
    renderIt();
    fireEvent.click(screen.getByText('Brushing'));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(screen.getByRole('status')).toHaveTextContent('Les photos ne peuvent pas être changées dans la démo.');
    expect(document.querySelector('img[src="https://x.test/a.jpg"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_save_service', expect.anything()));
    expect(photoRpcs()).toHaveLength(0);
  });
});
