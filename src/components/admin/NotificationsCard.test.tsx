import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PushState } from '../../lib/push';

const enable = vi.fn();
const disable = vi.fn();
const test = vi.fn();
let state: PushState = 'off';

vi.mock('../../lib/push', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/push')>()),
  usePushState: () => ({ state, enable, disable, test, busy: false, error: false }),
}));

import { LanguageProvider } from '../../context/LanguageContext';
import { NotificationsCard } from './NotificationsCard';

function renderCard() {
  render(
    <LanguageProvider>
      <NotificationsCard />
    </LanguageProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  test.mockResolvedValue(undefined);
});

describe('NotificationsCard', () => {
  it('offers to turn notifications on', () => {
    state = 'off';
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Activer' }));
    expect(enable).toHaveBeenCalledWith('fr');
  });

  it('walks iPhone users through adding the site to the home screen', () => {
    state = 'needs-install';
    renderCard();
    expect(screen.getByText('Touchez le bouton Partager dans Safari.')).toBeInTheDocument();
    expect(screen.getByText('Choisissez « Sur l’écran d’accueil ».')).toBeInTheDocument();
    expect(screen.getByText('Ouvrez Élégance depuis la nouvelle icône, puis revenez ici.')).toBeInTheDocument();
  });

  it('sends a test once enabled', async () => {
    state = 'on';
    renderCard();
    expect(screen.getByText('Activées sur cet appareil.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer un test' }));
    expect(test).toHaveBeenCalled();
    expect(await screen.findByText('Test envoyé — il doit arriver dans quelques secondes.')).toBeInTheDocument();
  });

  it('explains blocked notifications', () => {
    state = 'denied';
    renderCard();
    expect(screen.getByText(/Les notifications sont bloquées/)).toBeInTheDocument();
  });
});
