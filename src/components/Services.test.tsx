import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

const service = {
  id: 'new-soin', category: 'beaute', icon: 'sparkles', image: '', price: 3000, duration: 45,
  name: { fr: 'Soin éclat', ar: 'عناية' }, description: { fr: 'Une courte ligne', ar: 'd' }, active: true, sortOrder: 0,
};
let list: (typeof service & Record<string, unknown>)[] = [service];
let catalogue: (typeof service)[] = [];
let state = { isLoading: false, isError: false };
let cats: { id: string; name: { fr: string; ar: string }; sortOrder: number }[] = [];
let catState = { isLoading: false, isError: false };
const refetch = vi.fn();
const refetchCats = vi.fn();
vi.mock('../data/queries', () => ({
  useCatalogue: () => ({ data: catalogue }),
  useCategories: () => ({ data: catState.isLoading || catState.isError ? undefined : cats, ...catState, refetch: refetchCats }),
  useServices: () => ({ data: state.isLoading || state.isError ? undefined : list, ...state, refetch }),
}));

import { LanguageProvider, useLang } from '../context/LanguageContext';
import { Services } from './Services';
import { BookingIntentProvider, useBookingIntent } from '../context/BookingIntentContext';

beforeEach(() => {
  list = [service];
  catalogue = [];
  state = { isLoading: false, isError: false };
  refetch.mockReset();
  refetchCats.mockReset();
  cats = [];
  catState = { isLoading: false, isError: false };
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

  it('shows one category at a time under tabs Coiffure, Beauté, Spa (equal sizes: the first one opens)', () => {
    list = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe'), mk('s3', 'beaute', 'Ongles')];
    renderCarte();
    const tabs = within(screen.getByRole('tablist', { name: 'Catégories' })).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Coiffure', 'Beauté', 'Spa & hammam']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel', { name: 'Coiffure' });
    expect(within(panel).getByText('Coupe')).toBeInTheDocument();
    expect(screen.queryByText('Hammam')).toBeNull();
    expect(screen.queryByText('Ongles')).toBeNull();

    fireEvent.click(tabs[2]);
    expect(screen.getByRole('tab', { name: 'Spa & hammam' })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel', { name: 'Spa & hammam' })).getByText('Hammam')).toBeInTheDocument();
    expect(screen.queryByText('Coupe')).toBeNull();
  });

  it('tabs follow the arrow keys (wrapping), Home and End; only the chosen tab is in the tab order', () => {
    list = [mk('s1', 'spa', 'Hammam'), mk('s2', 'coiffure', 'Coupe'), mk('s3', 'beaute', 'Ongles')];
    renderCarte();
    const tab = (name: string) => screen.getByRole('tab', { name });
    expect(tab('Coiffure')).toHaveAttribute('tabindex', '0');
    expect(tab('Beauté')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tab('Coiffure'), { key: 'ArrowRight' });
    expect(tab('Beauté')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Beauté')).toHaveFocus();
    expect(screen.getByText('Ongles')).toBeInTheDocument();
    fireEvent.keyDown(tab('Beauté'), { key: 'End' });
    expect(tab('Spa & hammam')).toHaveFocus();
    fireEvent.keyDown(tab('Spa & hammam'), { key: 'ArrowRight' });
    expect(tab('Coiffure')).toHaveFocus();
    fireEvent.keyDown(tab('Coiffure'), { key: 'ArrowLeft' });
    expect(tab('Spa & hammam')).toHaveFocus();
    fireEvent.keyDown(tab('Spa & hammam'), { key: 'Home' });
    expect(tab('Coiffure')).toHaveAttribute('aria-selected', 'true');
  });

  it('in Arabic the arrows follow the reading direction', () => {
    list = [mk('s2', 'coiffure', 'Coupe'), mk('s3', 'beaute', 'Ongles')];
    function ToArabic() {
      const { toggleLang } = useLang();
      return <button onClick={toggleLang}>to-ar</button>;
    }
    render(<LanguageProvider><ToArabic /><Services /></LanguageProvider>);
    fireEvent.click(screen.getByText('to-ar'));
    const [first, second] = screen.getAllByRole('tab');
    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(second).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(second, { key: 'ArrowRight' });
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('opens on the category with the most services, the Packs tab staying first', () => {
    list = [mk('p1', 'pack', 'Pack Mariée'), mk('s1', 'spa', 'Hammam'), mk('b1', 'beaute', 'Ongles'), mk('b2', 'beaute', 'Sourcils')];
    renderCarte();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Packs', 'Beauté', 'Spa & hammam']);
    expect(screen.getByRole('tab', { name: 'Beauté' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Sourcils')).toBeInTheDocument();
    expect(screen.queryByText('Pack Mariée')).toBeNull();
  });

  it('shows no tabs when only one category is present', () => {
    list = [mk('s1', 'coiffure', 'Coupe'), mk('s2', 'coiffure', 'Brushing')];
    renderCarte();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByRole('tabpanel')).toBeNull();
    expect(screen.getByText('Coupe')).toBeInTheDocument();
    expect(screen.getByText('Brushing')).toBeInTheDocument();
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

  it('packs come first under Packs with what they include', () => {
    const hidden = { ...mk('h1', 'coiffure', 'Masque secret'), active: false };
    const coupe = mk('c1', 'coiffure', 'Coupe');
    const pack = { ...mk('p1', 'pack', 'Pack Mariée'), includes: ['c1', 'h1'] };
    list = [coupe, pack];
    catalogue = [coupe, hidden];
    renderCarte();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Packs', 'Coiffure']);
    expect(screen.getByRole('tab', { name: 'Packs' })).toHaveAttribute('aria-selected', 'true');
    const link = screen.getByRole('link', { name: /Pack Mariée/ });
    expect(link.textContent).toContain('Comprend : Coupe, Masque secret');
  });

  it('in Arabic, what a pack includes is listed with the Arabic comma', () => {
    const coupe = { ...service, id: 'c1', category: 'coiffure', name: { fr: 'Coupe', ar: 'قص' } };
    const masque = { ...service, id: 'm1', category: 'coiffure', name: { fr: 'Masque', ar: 'قناع' } };
    list = [coupe, { ...mk('p1', 'pack', 'Pack Mariée'), includes: ['c1', 'm1'] }];
    catalogue = [coupe, masque];
    function ToArabic() {
      const { toggleLang } = useLang();
      return <button onClick={toggleLang}>to-ar</button>;
    }
    render(<LanguageProvider><ToArabic /><Services /></LanguageProvider>);
    fireEvent.click(screen.getByText('to-ar'));
    expect(screen.getByRole('link', { name: /Pack Mariée/ }).textContent).toContain('تشمل: قص، قناع');
  });

  it('a running promo shows the crossed regular price', () => {
    list = [{ ...mk('s1', 'coiffure', 'Coupe'), price: 3000, promo: { price: 2000, from: '2000-01-01', to: '2999-12-31' } }, mk('s2', 'coiffure', 'Brushing')];
    renderCarte();
    const link = screen.getByRole('link', { name: /Coupe/ });
    const crossed = link.querySelector('.line-through')!;
    expect(crossed.textContent).toMatch(/3\s?000/);
    expect(crossed.className).toContain('opacity-60');
    expect(link.textContent).toMatch(/2\s?000/);
    expect(within(link).getByText(/au lieu de/)).toHaveClass('sr-only');
    expect(screen.getByRole('link', { name: /Brushing/ }).querySelector('.line-through')).toBeNull();
  });

  it('shows the salon\'s own category as a tab after the ready-made ones, in both languages', () => {
    cats = [{ id: 'c1', name: { fr: 'Soins mariée', ar: 'عروس' }, sortOrder: 0 }];
    list = [mk('s1', 'coiffure', 'Coupe'), mk('s2', 'beaute', 'Ongles'), { ...mk('s3', 'custom', 'Henné'), customCategoryId: 'c1' }];
    function ToArabic() {
      const { toggleLang } = useLang();
      return <button onClick={toggleLang}>to-ar</button>;
    }
    render(<LanguageProvider><ToArabic /><Services /></LanguageProvider>);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Coiffure', 'Beauté', 'Soins mariée']);
    fireEvent.click(screen.getByRole('tab', { name: 'Soins mariée' }));
    expect(within(screen.getByRole('tabpanel')).getByText('Henné')).toBeInTheDocument();
    fireEvent.click(screen.getByText('to-ar'));
    expect(screen.getAllByRole('tab').at(-1)!.textContent).toBe('عروس');
  });

  it('tabs wrap instead of scrolling sideways', () => {
    cats = [1, 2, 3].map((n) => ({ id: `c${n}`, name: { fr: `Cat ${n}`, ar: `${n}` }, sortOrder: n }));
    list = [mk('s1', 'coiffure', 'A'), mk('s2', 'beaute', 'B'), mk('s3', 'spa', 'C'), ...cats.map((c) => ({ ...mk(`x${c.id}`, 'custom', c.id), customCategoryId: c.id }))];
    renderCarte();
    const tablist = screen.getByRole('tablist');
    expect(screen.getAllByRole('tab')).toHaveLength(6);
    expect(tablist.className).toContain('flex-wrap');
    expect(tablist.className).not.toContain('overflow-x-auto');
    for (const tab of screen.getAllByRole('tab')) expect(tab.id).not.toContain(':');
  });

  it('waits for the categories too, and retries the one that failed', () => {
    catState = { isLoading: true, isError: false };
    const { container, unmount } = renderCarte();
    expect(screen.queryByRole('link')).toBeNull();
    expect(container.querySelectorAll('[data-placeholder]').length).toBeGreaterThan(0);
    unmount();
    catState = { isLoading: false, isError: true };
    renderCarte();
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }));
    expect(refetchCats).toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
  });
});
