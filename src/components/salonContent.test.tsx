import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { eleganceHours } from './admin/fixtures';
import { setCurrentSalon, type CurrentSalon } from '../data/salon';
import { ELEGANCE } from '../test/salon';
import { clientMessage } from '../data/whatsapp';

vi.mock('../data/salonSettings', () => ({
  useSalonHours: () => ({ data: eleganceHours }),
  useSalonInfo: () => ({
    data: {
      address: { fr: 'x', ar: 'x' },
      city: { fr: 'Oran', ar: 'وهران' },
      whatsapp: '0561234567',
      instagramUrl: null,
      facebookUrl: null,
    },
  }),
}));
vi.mock('../data/queries', () => ({
  useStylists: () => ({ data: [{ id: 'a' }, { id: 'b' }] }),
}));
vi.mock('../lib/auth', () => ({ useSession: () => ({ session: null, loading: false }) }));
vi.mock('./LoginForm', () => ({ LoginForm: () => null }));

import { LanguageProvider, translations } from '../context/LanguageContext';
import { salonSubtitle } from '../data/formatters';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { Hero } from './Hero';
import { TrustBadges } from './TrustBadges';
import { Philosophy } from './Philosophy';
import { AdminShell } from './admin/AdminShell';

const YASMINE: CurrentSalon = {
  id: 'yasmine',
  name: { fr: 'Salon Yasmine', ar: 'Salon Yasmine' },
  palette: ELEGANCE.palette,
  heroImage: '',
  founderName: null,
  founderRole: null,
  story: null,
  storyIntro: null,
  yearsOpen: null,
  clientCount: null,
  rating: null,
  reviewCount: null,
};

const renderAll = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LanguageProvider>{ui}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );

const page = (
  <>
    <Navbar />
    <Hero />
    <TrustBadges />
    <Philosophy />
    <Footer />
  </>
);

afterEach(() => setCurrentSalon(ELEGANCE));

describe('a salon without claims or story', () => {
  beforeEach(() => setCurrentSalon(YASMINE));

  it('shows its own name and never Élégance', () => {
    const { container } = renderAll(page);
    expect(screen.getAllByText('Salon Yasmine').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/© \d{4} Salon Yasmine/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('Élégance');
  });

  it('puts the salon city in the subtitle', () => {
    renderAll(<Hero />);
    expect(screen.getByText(/au cœur d\u2019Oran,/)).toBeInTheDocument();
  });

  it('shows only the stylist count, no rating line and no story', () => {
    renderAll(page);
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('15+')).toBeNull();
    expect(screen.queryByText('4,9')).toBeNull();
    expect(screen.queryByText(/avis vérifiés/)).toBeNull();
    expect(screen.queryByText('La maison')).toBeNull();
  });

  it('shows a photo-less tile instead of a hero image', () => {
    renderAll(<Hero />);
    expect(screen.queryByRole('img', { name: 'Salon de coiffure et beauté' })?.tagName).not.toBe('IMG');
  });

  it('names the salon in the admin header', () => {
    renderAll(<AdminShell>{() => null}</AdminShell>);
    expect(screen.getByText('Salon Yasmine')).toBeInTheDocument();
  });

  it('names the salon in WhatsApp messages', () => {
    const b = { clientName: 'Sara', startsAt: new Date('2030-01-08T09:00:00Z'), serviceName: { fr: 'Coupe', ar: 'قص' } };
    expect(clientMessage('confirmed', { ...b, lang: 'fr' })).toContain('chez Salon Yasmine');
    expect(clientMessage('confirmed', { ...b, lang: 'ar' })).toContain('Salon Yasmine');
  });
});

describe('Élégance', () => {
  it('keeps its claims, story and founder', () => {
    renderAll(page);
    expect(screen.getByText('15+')).toBeInTheDocument();
    expect(screen.getByText('2 500+')).toBeInTheDocument();
    expect(screen.getAllByText('4,9').length).toBeGreaterThan(0);
    expect(screen.getByText('240 avis vérifiés')).toBeInTheDocument();
    expect(screen.getByText('Amina')).toBeInTheDocument();
    expect(screen.getByText(/Fondatrice & coiffeuse/)).toBeInTheDocument();
    expect(screen.getByText(/Depuis quinze ans/)).toBeInTheDocument();
  });

  it('shows its claims in Arabic exactly as before: Latin "15+", "2 500+", "4,9"; Arabic digits for counts', () => {
    renderAll(page);
    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle language' })[0]);
    expect(screen.getByText('15+')).toBeInTheDocument();
    expect(screen.getByText('2 500+')).toBeInTheDocument();
    expect(screen.getAllByText('4,9')).toHaveLength(2);
    expect(screen.getByText('٢٤٠ تقييم')).toBeInTheDocument();
    expect(screen.getByText('٢')).toBeInTheDocument();
  });
});

describe('salonSubtitle', () => {
  const FR = 'Un salon de coiffure et beauté au cœur d’Alger, où chaque visite est un moment de soin et de détente.';
  const AR = 'صالون تجميل وحلاقة في قلب الجزائر العاصمة، حيث كل زيارة لحظة عناية وراحة.';
  const tr = (lang: 'fr' | 'ar') => (k: string) => translations[lang][k];

  it('equals the original Élégance copy in both languages', () => {
    expect(salonSubtitle(tr('fr'), 'fr', 'Alger')).toBe(FR);
    expect(salonSubtitle(tr('ar'), 'ar', 'الجزائر العاصمة')).toBe(AR);
  });
  it('elides before a vowel or h, not before a consonant', () => {
    expect(salonSubtitle(tr('fr'), 'fr', 'Éloued')).toContain('au cœur d’Éloued,');
    expect(salonSubtitle(tr('fr'), 'fr', 'Blida')).toContain('au cœur de Blida,');
  });
  it('drops the city while it is missing', () => {
    expect(salonSubtitle(tr('fr'), 'fr', undefined)).toBe(
      'Un salon de coiffure et beauté, où chaque visite est un moment de soin et de détente.'
    );
    expect(salonSubtitle(tr('fr'), 'fr', '')).not.toContain('de ,');
    expect(salonSubtitle(tr('ar'), 'ar', undefined)).not.toContain('{city}');
  });
});
