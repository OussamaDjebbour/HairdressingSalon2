import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { setCurrentSalon } from '../data/salon';
import { ELEGANCE } from '../test/salon';

vi.mock('../data/salonSettings', () => ({
  useSalonInfo: () => ({ data: { city: { fr: 'Alger', ar: 'الجزائر العاصمة' } } }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Hero } from './Hero';
import { Navbar } from './Navbar';

const renderHero = () => render(<LanguageProvider><Navbar /><Hero /></LanguageProvider>);
const hero = () => document.getElementById('home') as HTMLElement;

afterEach(() => setCurrentSalon(ELEGANCE));

describe('Hero', () => {
  it('shows the salon name as the h1 and both taglines', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Élégance');
    expect(within(hero()).getByText('Votre beauté, notre savoir-faire')).toHaveAttribute('lang', 'fr');
    expect(within(hero()).getByText('جمالكِ، خبرتنا')).toHaveAttribute('lang', 'ar');
  });

  it('links Prendre rendez-vous to #booking and La carte des soins to #services', () => {
    renderHero();
    expect(within(hero()).getByRole('link', { name: 'Prendre rendez-vous' })).toHaveAttribute('href', '#booking');
    expect(within(hero()).getByRole('link', { name: 'La carte des soins' })).toHaveAttribute('href', '#services');
  });

  it('shows Maison de beauté, Alger — 4,9/5', () => {
    renderHero();
    expect(within(hero()).getByText('Maison de beauté, Alger — 4,9/5')).toBeInTheDocument();
  });

  it('omits the rating when the salon has none', () => {
    setCurrentSalon({ ...ELEGANCE, rating: null });
    renderHero();
    expect(within(hero()).getByText('Maison de beauté, Alger')).toBeInTheDocument();
  });

  it('hero without a photo shows the brand field and no img', () => {
    setCurrentSalon({ ...ELEGANCE, heroImage: '' });
    renderHero();
    expect(hero().querySelector('img')).toBeNull();
    expect(hero()).toHaveClass('bg-rose-900');
  });

  it('loads the hero photo first, not lazily', () => {
    renderHero();
    const img = hero().querySelector('img')!;
    expect(img).toHaveAttribute('src', ELEGANCE.heroImage);
    expect(img).not.toHaveAttribute('loading', 'lazy');
  });

  it('in Arabic the switch reads Français and both taglines show', () => {
    renderHero();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le site en arabe' }));
    expect(screen.getByRole('button', { name: 'عرض الموقع بالفرنسية' })).toHaveTextContent('Français');
    expect(within(hero()).getByText('Votre beauté, notre savoir-faire')).toBeInTheDocument();
    expect(within(hero()).getByText('جمالكِ، خبرتنا')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Élégance');
  });
});
