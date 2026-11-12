import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('./data/currentSalon', () => ({ resolveSalon: vi.fn() }));

import { resolveSalon } from './data/currentSalon';
import { currentSalonId, setCurrentSalon } from './data/salon';
import { startApp } from './bootstrap';
import { ELEGANCE } from './test/salon';

const resolve = resolveSalon as ReturnType<typeof vi.fn>;
const FakeApp = () => <p>the app for {currentSalonId()}</p>;
const SARA = { ...ELEGANCE, id: 'sara', name: { fr: 'Sara Beauté', ar: 'سارة' },
  palette: { ...ELEGANCE.palette, '600': '#3355CC' } };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  document.documentElement.removeAttribute('style');
  document.title = '';
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setCurrentSalon(ELEGANCE);
});

async function start(host: string, search = '') {
  await act(() => startApp(root, { host, search }, FakeApp));
}

describe('startApp', () => {
  it('renders the app for the salon of this address, with its colours and name', async () => {
    resolve.mockResolvedValue(SARA);

    await start('sara-salon.com', '?x=1');

    expect(resolve).toHaveBeenCalledWith('sara-salon.com', '?x=1');
    expect(screen.getByText('the app for sara')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--brand-600')).toBe('51 85 204');
    expect(document.title).toBe('Sara Beauté — Salon de beauté');
  });

  it('keeps Élégance’s tab title exactly as today', async () => {
    resolve.mockResolvedValue(ELEGANCE);

    await start('localhost:5173');

    expect(document.title).toBe('Élégance — Salon de beauté');
  });

  it('shows "salon introuvable" for an unknown address, never another salon', async () => {
    resolve.mockResolvedValue(null);

    await start('unknown.com');

    expect(screen.getByRole('heading', { name: 'Salon introuvable' })).toBeInTheDocument();
    expect(screen.queryByText(/the app/)).not.toBeInTheDocument();
    expect(() => currentSalonId()).toThrow();
    expect(document.documentElement.style.getPropertyValue('--brand-600')).toBe('');
    expect(document.title).toBe('Salon introuvable');

    fireEvent.click(screen.getByRole('button', { name: 'Toggle language' }));
    expect(screen.getByRole('heading', { name: 'الصالون غير موجود' })).toBeInTheDocument();
  });

  it('offers a retry when the lookup fails, and retrying can succeed', async () => {
    resolve.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce(SARA);

    await start('sara-salon.com');

    expect(screen.getByRole('heading', { name: 'Connexion impossible' })).toBeInTheDocument();
    expect(screen.queryByText(/the app/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    });

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('the app for sara')).toBeInTheDocument();
  });
});
