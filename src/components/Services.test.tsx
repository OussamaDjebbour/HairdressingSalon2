import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

const service = {
  id: 'new-soin', category: 'beaute', icon: 'sparkles', image: '', price: 3000, duration: 45,
  name: { fr: 'Soin éclat', ar: 'عناية' }, description: { fr: 'd', ar: 'd' }, active: true, sortOrder: 0,
};
let list = [service];
vi.mock('../data/queries', () => ({
  useServices: () => ({ data: list, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Services } from './Services';
import { BookingIntentProvider, useBookingIntent } from '../context/BookingIntentContext';

beforeEach(() => {
  list = [service];
});

const mk = (id: string, category: string, fr: string) => ({ ...service, id, category, name: { fr, ar: fr } });

describe('Services', () => {
  it('shows the category icon tile, not an endless shimmer, for a service without a photo', () => {
    const { container } = render(
      <LanguageProvider>
        <Services />
      </LanguageProvider>
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.img-placeholder')).toBeNull();
    expect(within(screen.getByRole('link')).getByText('Soin éclat')).toBeInTheDocument();
    expect(container.querySelector('a svg[aria-hidden]')).not.toBeNull();
  });

  it('shows a photo tile as one link to #booking with name, line, price, duration and Réserver', () => {
    list = [{ ...service, image: 'https://x.test/a.jpg', description: { fr: 'Une courte ligne', ar: 'd' } }];
    const { container } = render(<LanguageProvider><Services /></LanguageProvider>);
    const link = screen.getByRole('link', { name: /Soin éclat/ });
    expect(link).toHaveAttribute('href', '#booking');
    for (const text of ['Soin éclat', 'Une courte ligne', 'Réserver']) expect(within(link).getByText(text)).toBeInTheDocument();
    expect(link.textContent).toMatch(/3\s?000/);
    expect(link.textContent).toMatch(/45/);
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://x.test/a.jpg');
  });

  it('tells the booking which service was chosen when a tile is clicked', () => {
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
    render(<LanguageProvider><Services /></LanguageProvider>);
    const link = screen.getByRole('link', { name: /Soin éclat/ });
    expect(link).toHaveAttribute('href', '#booking');
    fireEvent.click(link);
  });

  it('groups under headings Coiffure, Beauté, Spa when several categories are present', () => {
    list = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe'), mk('s3', 'beaute', 'Ongles')];
    render(<LanguageProvider><Services /></LanguageProvider>);
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
    render(<LanguageProvider><Services /></LanguageProvider>);
    for (const name of ['Coiffure', 'Beauté', 'Spa']) expect(screen.queryByRole('heading', { name })).toBeNull();
  });
});
