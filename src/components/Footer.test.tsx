import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { eleganceHours } from './admin/fixtures';
import type { SalonHours, SalonInfo } from '../data/types';

let hours: SalonHours;
let info: SalonInfo;

vi.mock('../data/salonSettings', () => ({
  useSalonHours: () => ({ data: hours }),
  useSalonInfo: () => ({ data: info }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Footer } from './Footer';

const renderFooter = () =>
  render(
    <MemoryRouter>
      <LanguageProvider>
        <Footer />
      </LanguageProvider>
    </MemoryRouter>
  );

const row = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

beforeEach(() => {
  hours = eleganceHours;
  info = {
    address: { fr: '12 Rue Didouche Mourad\nAlger Centre 16000', ar: 'x' },
    city: { fr: 'Alger', ar: 'الجزائر' },
    whatsapp: '0561234567',
    instagramUrl: null,
    facebookUrl: 'https://facebook.com/elegance',
  };
});

describe('Footer', () => {
  it('lists one line per group of hours, Monday to Sunday', () => {
    renderFooter();
    const lines = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toEqual(['LundiFermé', 'Mardi – Samedi09:00 – 18:00', 'DimancheFermé']);
  });

  it('gives a day with different hours its own line', () => {
    hours = { ...eleganceHours, 4: { opens: 600, closes: 960 } };
    renderFooter();
    expect(row('Mardi – Mercredi')).toHaveTextContent('09:00 – 18:00');
    expect(row('Jeudi')).toHaveTextContent('10:00 – 16:00');
    expect(row('Vendredi – Samedi')).toHaveTextContent('09:00 – 18:00');
  });

  it('shows address lines, city, phone and only the social links that are set', () => {
    renderFooter();
    expect(screen.getByText('12 Rue Didouche Mourad')).toBeInTheDocument();
    expect(screen.getByText('Alger Centre 16000')).toBeInTheDocument();
    expect(screen.getByText('Alger')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0561 23 45 67' })).toHaveAttribute('href', 'tel:+213561234567');
    expect(screen.queryByRole('link', { name: 'Instagram' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Facebook' })).toHaveAttribute('href', 'https://facebook.com/elegance');
  });
});
