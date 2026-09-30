import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../lib/auth', () => ({ signIn: vi.fn() }));

import { signIn } from '../lib/auth';
import { LanguageProvider } from '../context/LanguageContext';
import { LoginForm } from './LoginForm';

const signInMock = signIn as ReturnType<typeof vi.fn>;

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

beforeEach(() => vi.clearAllMocks());

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
});
