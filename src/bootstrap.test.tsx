import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent } from '@testing-library/react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('./data/currentSalon', () => ({ resolveSalon: vi.fn() }));

import { resolveSalon } from './data/currentSalon';
import { currentSalonId, setCurrentSalon } from './data/salon';
import { startApp } from './bootstrap';
import { ELEGANCE } from './test/salon';
import indexHtml from '../index.html?raw';

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
  document.head.innerHTML =
    '<meta name="theme-color" content="#421F28"><meta name="apple-mobile-web-app-title" content="Salon">';
});

const meta = (name: string) => document.head.querySelector(`meta[name="${name}"]`)?.getAttribute('content');

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setCurrentSalon(ELEGANCE);
});

async function start(host: string, search = '') {
  await act(() => startApp(root, { host, search }, FakeApp));
}

describe('the built page head (before the edge or the app names the salon)', () => {
  it('names no salon and no city', () => {
    const head = new DOMParser().parseFromString(indexHtml, 'text/html');
    expect(head.title).toBe('Salon de beauté');
    expect(head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe('Salon');
    expect(head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Salon de coiffure et de beauté. Réservez votre rendez-vous en ligne.',
    );
    expect(indexHtml).not.toMatch(/Élégance|Alger/);
  });
});

describe('startApp', () => {
  it('renders the app for the salon of this address, with its colours and name', async () => {
    resolve.mockResolvedValue(SARA);

    await start('sara-salon.com', '?x=1');

    expect(resolve).toHaveBeenCalledWith('sara-salon.com', '?x=1');
    expect(screen.getByText('the app for sara')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--brand-600')).toBe('51 85 204');
    expect(document.title).toBe('Sara Beauté — Salon de beauté');
    expect(meta('theme-color')).toBe(SARA.palette['900']);
    expect(meta('apple-mobile-web-app-title')).toBe('Sara Beauté');
  });

  it('keeps Élégance’s tab title exactly as today', async () => {
    resolve.mockResolvedValue(ELEGANCE);

    await start('localhost:5173');

    expect(document.title).toBe('Élégance — Salon de beauté');
    expect(meta('theme-color')).toBe('#421F28');
    expect(meta('apple-mobile-web-app-title')).toBe('Élégance');
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
