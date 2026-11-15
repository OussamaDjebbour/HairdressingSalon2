import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

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

const mk = (id: string, category: string, fr: string) => ({ ...service, id, category, name: { fr, ar: fr } });

describe('Services', () => {
  it('shows the category icon tile, not an endless shimmer, for a service without a photo', () => {
    const { container } = render(
      <LanguageProvider>
        <Services />
      </LanguageProvider>
    );
    expect(screen.getByRole('img', { name: 'Soin éclat' })).toBeInTheDocument();
    expect(container.querySelector('.img-placeholder')).toBeNull();
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
    list = [service];
  });

  it('shows no heading when only one category is present', () => {
    list = [mk('s1', 'coiffure', 'Coupe'), mk('s2', 'coiffure', 'Brushing')];
    render(<LanguageProvider><Services /></LanguageProvider>);
    for (const name of ['Coiffure', 'Beauté', 'Spa']) expect(screen.queryByRole('heading', { name })).toBeNull();
    list = [service];
  });
});
