import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

const service = {
  id: 'new-soin', category: 'beaute', icon: 'sparkles', image: '', price: 3000, duration: 45,
  name: { fr: 'Soin éclat', ar: 'عناية' }, description: { fr: 'Une courte ligne', ar: 'd' }, active: true, sortOrder: 0,
};
let list = [service];
let state = { isLoading: false, isError: false };
const refetch = vi.fn();
vi.mock('../data/queries', () => ({
  useServices: () => ({ data: state.isLoading || state.isError ? undefined : list, ...state, refetch }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Services } from './Services';
import { BookingIntentProvider, useBookingIntent } from '../context/BookingIntentContext';

beforeEach(() => {
  list = [service];
  state = { isLoading: false, isError: false };
  refetch.mockReset();
});

const mk = (id: string, category: string, fr: string, image = '') => ({ ...service, id, category, image, name: { fr, ar: fr } });
const renderCarte = () => render(<LanguageProvider><Services /></LanguageProvider>);

describe('Services (La carte)', () => {
  it('each service is one link to #booking with name, description, price and duration', () => {
    renderCarte();
    const link = screen.getByRole('link', { name: /Soin éclat/ });
    expect(link).toHaveAttribute('href', '#booking');
    for (const text of ['Soin éclat', 'Une courte ligne']) expect(within(link).getByText(text)).toBeInTheDocument();
    expect(link.textContent).toMatch(/3\s?000/);
    expect(link.textContent).toMatch(/45/);
    expect(link).toHaveAccessibleName(/Soin éclat.*3\s?000/);
  });

  it('tells the booking which service was chosen when a row is clicked', () => {
    const seen: unknown[] = [];
    function Probe() {
      const { request } = useBookingIntent();
      seen.push(request);
      return null;
    }
    render(<LanguageProvider><BookingIntentProvider><Probe /><Services /></BookingIntentProvider></LanguageProvider>);
    fireEvent.click(screen.getByRole('link', { name: /Soin éclat/ }));
    expect(seen.at(-1)).toEqual({ serviceId: 'new-soin', seq: 1 });
    fireEvent.click(screen.getByRole('link', { name: /Soin éclat/ }));
    expect(seen.at(-1)).toEqual({ serviceId: 'new-soin', seq: 2 });
  });

  it('still renders without a provider', () => {
    renderCarte();
    const link = screen.getByRole('link', { name: /Soin éclat/ });
    expect(link).toHaveAttribute('href', '#booking');
    fireEvent.click(link);
  });

  it('groups under headings Coiffure, Beauté, Spa when several categories are present', () => {
    list = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe'), mk('s3', 'beaute', 'Ongles')];
    renderCarte();
    const headings = screen.getAllByRole('heading', { level: 3 }).filter((h) => ['Coiffure', 'Beauté', 'Spa'].includes(h.textContent ?? ''));
    expect(headings.map((h) => h.textContent)).toEqual(['Coiffure', 'Beauté', 'Spa']);
    const group = (h: HTMLElement) => within(h.parentElement!);
    expect(group(headings[0]).getByText('Coupe')).toBeInTheDocument();
    expect(group(headings[0]).queryByText('Hammam')).toBeNull();
    expect(group(headings[1]).getByText('Ongles')).toBeInTheDocument();
    expect(group(headings[2]).getByText('Hammam')).toBeInTheDocument();
  });

  it('shows no heading when only one category is present', () => {
    list = [mk('s1', 'coiffure', 'Coupe'), mk('s2', 'coiffure', 'Brushing')];
    renderCarte();
    for (const name of ['Coiffure', 'Beauté', 'Spa']) expect(screen.queryByRole('heading', { name })).toBeNull();
  });

  it('a row with a photo shows it as a thumbnail; a row without stays text only', () => {
    list = [mk('s1', 'coiffure', 'Coupe', 'https://x.test/a.jpg'), mk('s2', 'coiffure', 'Brushing')];
    renderCarte();
    const thumb = screen.getByRole('link', { name: /Coupe/ }).querySelector('img');
    expect(thumb).toHaveAttribute('src', 'https://x.test/a.jpg');
    expect(thumb).toHaveAttribute('loading', 'lazy');
    expect(thumb).toHaveAttribute('alt', '');
    expect(screen.getByRole('link', { name: /Brushing/ }).querySelector('img')).toBeNull();
  });



  it('shows quiet placeholder rows while loading', () => {
    state = { isLoading: true, isError: false };
    const { container } = renderCarte();
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelectorAll('[data-placeholder]').length).toBeGreaterThan(0);
  });

  it('shows DataError with retry on failure', () => {
    state = { isLoading: false, isError: true };
    renderCarte();
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(refetch).toHaveBeenCalled();
  });


  it('has no photo strip: each service photo appears once, on its own row', () => {
    list = [1, 2, 3, 4].map((n) => mk(`s${n}`, 'coiffure', `S${n}`, `https://x.test/${n}.jpg`));
    const { container } = renderCarte();
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['https://x.test/1.jpg', 'https://x.test/2.jpg', 'https://x.test/3.jpg', 'https://x.test/4.jpg']);
    for (const img of container.querySelectorAll('img')) expect(img.closest('a')).not.toBeNull();
  });

  it('text-only rows when no service has a photo', () => {
    list = [mk('s1', 'coiffure', 'Coupe'), mk('s2', 'coiffure', 'Brushing')];
    const { container } = renderCarte();
    expect(container.querySelector('img')).toBeNull();
  });

  it('each row ends with a Réserver cue', () => {
    renderCarte();
    expect(within(screen.getByRole('link', { name: /Soin éclat/ })).getByText('Réserver')).toBeInTheDocument();
  });
});
