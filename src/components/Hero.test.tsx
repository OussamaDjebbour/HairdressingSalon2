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
  // First on purpose: React prints each unknown-prop warning once per module.
  it('renders without React warnings', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHero();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('shows the salon name as the h1 and the tagline in the page language only', () => {
    renderHero();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Élégance');
    expect(within(hero()).getByText('Votre beauté, notre savoir-faire')).toBeInTheDocument();
    expect(within(hero()).queryByText('جمالكِ، خبرتنا')).toBeNull();
  });

  it('links Prendre rendez-vous to #booking and La carte des soins to #services', () => {
    renderHero();
    expect(within(hero()).getByRole('link', { name: 'Prendre rendez-vous' })).toHaveAttribute('href', '#booking');
    expect(within(hero()).getByRole('link', { name: 'La carte des soins' })).toHaveAttribute('href', '#services');
  });

  it('says where the salon is and how its clients rate it', () => {
    renderHero();
    expect(within(hero()).getByText('Maison de beauté à Alger, notée 4,9 sur 5 par 240 clientes')).toBeInTheDocument();
  });

  it('omits the rating when the salon has none', () => {
    setCurrentSalon({ ...ELEGANCE, rating: null });
    renderHero();
    expect(within(hero()).getByText('Maison de beauté à Alger')).toBeInTheDocument();
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

  it('in Arabic the switch reads Français and only the Arabic tagline shows', () => {
    renderHero();
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le site en arabe' }));
    expect(screen.getByRole('button', { name: 'عرض الموقع بالفرنسية' })).toHaveTextContent('Français');
    expect(within(hero()).queryByText('Votre beauté, notre savoir-faire')).toBeNull();
    expect(within(hero()).getByText('جمالكِ، خبرتنا')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Élégance');
  });

  it('shades the top of the photo so the bar stays readable on a bright photo', () => {
    renderHero();
    expect(hero().querySelector('[data-top-scrim]')).not.toBeNull();
  });
});
