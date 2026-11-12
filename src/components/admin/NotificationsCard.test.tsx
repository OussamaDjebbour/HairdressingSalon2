import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { PushState } from '../../lib/push';

const enable = vi.fn();
const disable = vi.fn();
const test = vi.fn();
let state: PushState = 'off';
let role: 'owner' | 'demo' | null = 'owner';

vi.mock('../../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data/admin')>()),
  useMyRole: () => role,
}));

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
  role = 'owner';
  test.mockResolvedValue(1);
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

describe('NotificationsCard edge states', () => {
  it('renders nothing while the state is loading', () => {
    state = 'loading';
    renderCard();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText('Ce navigateur ne permet pas les notifications.')).toBeNull();
  });

  it('says when the site is not configured yet', () => {
    state = 'not-configured';
    renderCard();
    expect(screen.getByText('Les notifications ne sont pas encore configurées sur ce site.')).toBeInTheDocument();
  });

  it('says when a test could not be sent anywhere', async () => {
    state = 'on';
    test.mockResolvedValue(0);
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer un test' }));
    expect(await screen.findByText(/Aucun envoi/)).toBeInTheDocument();
    expect(screen.queryByText(/Test envoyé/)).toBeNull();
  });

  it('says notifications are off in the demo instead of offering to enable them', () => {
    state = 'off';
    role = 'demo';
    renderCard();
    expect(screen.getByText('Les notifications sont désactivées dans la démo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activer' })).toBeNull();
  });

  it.each<PushState>(['on', 'needs-install', 'denied', 'unsupported', 'not-configured'])(
    'in the demo shows only the disabled message and no buttons when the push state is %s',
    (s) => {
      state = s;
      role = 'demo';
      renderCard();
      expect(screen.getByText('Les notifications sont désactivées dans la démo.')).toBeInTheDocument();
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryByText('Activées sur cet appareil.')).toBeNull();
      expect(disable).not.toHaveBeenCalled();
    }
  );
});

describe('NotificationsCard — Chrome on Android', () => {
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
  const as = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);
  afterEach(() => vi.restoreAllMocks());

  it('explains what to do if Chrome flags a notification as possible spam', () => {
    as(ANDROID);
    state = 'on';
    renderCard();
    expect(screen.getByText(/possible spam/)).toBeInTheDocument();
    expect(screen.getByText(/toujours autoriser/)).toBeInTheDocument();
  });

  it('says nothing about it on other devices', () => {
    as(MAC);
    state = 'on';
    renderCard();
    expect(screen.queryByText(/possible spam/)).toBeNull();
  });

  it('says nothing about it while notifications are off', () => {
    as(ANDROID);
    state = 'off';
    renderCard();
    expect(screen.queryByText(/possible spam/)).toBeNull();
  });
});
