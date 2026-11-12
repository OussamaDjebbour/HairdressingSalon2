import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/auth', () => ({ signIn: vi.fn() }));
vi.mock('../data/admin', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/admin')>()),
  fetchDemoLogin: vi.fn(),
}));

import { signIn } from '../lib/auth';
import { fetchDemoLogin } from '../data/admin';
import { setCurrentSalon } from '../data/salon';
import { ELEGANCE } from '../test/salon';
import { LanguageProvider } from '../context/LanguageContext';
import { LoginForm } from './LoginForm';

const signInMock = signIn as ReturnType<typeof vi.fn>;
const demoLoginMock = fetchDemoLogin as ReturnType<typeof vi.fn>;

function setup() {
  render(
    <LanguageProvider>
      <LoginForm />
    </LanguageProvider>
  );
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' staff@salon.dz ' } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  setCurrentSalon(ELEGANCE);
});

describe('LoginForm', () => {
  it('signs in with the trimmed email', async () => {
    signInMock.mockResolvedValue(undefined);
    setup();
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith('staff@salon.dz', 'secret'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an error when sign-in fails', async () => {
    signInMock.mockRejectedValue(new Error('Invalid login credentials'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.');
  });

  it('shows both required errors on an empty submit and calls nothing', async () => {
    render(<LanguageProvider><LoginForm /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('L’e-mail est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('Le mot de passe est obligatoire.')).toBeInTheDocument();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('toggles the password visibility', () => {
    render(<LanguageProvider><LoginForm /></LanguageProvider>);
    const pw = screen.getByLabelText('Mot de passe');
    expect(pw).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(pw).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Masquer le mot de passe' }));
    expect(pw).toHaveAttribute('type', 'password');
  });

  it('shows no demo button for an ordinary salon', () => {
    render(<LanguageProvider><LoginForm /></LanguageProvider>);
    expect(screen.queryByRole('button', { name: 'Essayer la démo' })).toBeNull();
  });

  it('signs in with the fetched demo credentials on a demo salon', async () => {
    setCurrentSalon({ ...ELEGANCE, demo: true });
    demoLoginMock.mockResolvedValue({ email: 'demo@x.dz', password: 'pw' });
    signInMock.mockResolvedValue(undefined);
    render(<LanguageProvider><LoginForm /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Essayer la démo' }));
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith('demo@x.dz', 'pw'));
    expect(demoLoginMock).toHaveBeenCalledWith('elegance');
  });

  it('shows the login error when the demo login is unavailable', async () => {
    setCurrentSalon({ ...ELEGANCE, demo: true });
    demoLoginMock.mockResolvedValue(null);
    render(<LanguageProvider><LoginForm /></LanguageProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Essayer la démo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou mot de passe incorrect.');
    expect(signInMock).not.toHaveBeenCalled();
  });
});
