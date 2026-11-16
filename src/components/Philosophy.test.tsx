import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setCurrentSalon } from '../data/salon';
import { ELEGANCE } from '../test/salon';

vi.mock('../data/salonSettings', () => ({
  useSalonInfo: () => ({ data: { city: { fr: 'Alger', ar: 'الجزائر العاصمة' } } }),
}));

import { LanguageProvider } from '../context/LanguageContext';
import { Philosophy } from './Philosophy';
import { Hero } from './Hero';

const renderIt = (ui: React.ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);
afterEach(() => setCurrentSalon(ELEGANCE));

describe('La maison', () => {
  it('shows the story as a quote, the intro, the founder and the claims sentence', () => {
    renderIt(<Philosophy />);
    expect(screen.getByText(ELEGANCE.story!.fr).tagName).toBe('BLOCKQUOTE');
    expect(screen.getByText(/Depuis quinze ans au cœur d’Alger/)).toBeInTheDocument();
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText(/Fondatrice & coiffeuse/)).toBeInTheDocument();
    expect(screen.getByText('Depuis 15 ans à Alger. Plus de 2 500 clientes.')).toBeInTheDocument();
  });

  it('is hidden when the salon has no story', () => {
    setCurrentSalon({ ...ELEGANCE, story: null });
    const { container } = renderIt(<Philosophy />);
    expect(container).toBeEmptyDOMElement();
  });

  it('claims without a story move under the hero line', () => {
    setCurrentSalon({ ...ELEGANCE, story: null });
    renderIt(<Hero />);
    expect(screen.getByText('Depuis 15 ans à Alger. Plus de 2 500 clientes.')).toBeInTheDocument();
  });

  it('the hero carries no claims sentence when the story shows it', () => {
    renderIt(<Hero />);
    expect(screen.queryByText(/Plus de 2 500 clientes/)).toBeNull();
  });
});
