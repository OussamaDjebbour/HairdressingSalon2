import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LanguageProvider } from '../../context/LanguageContext';
import { Field } from './Field';
import { TextField } from './TextField';
import { PasswordField } from './PasswordField';
import { FormSummary } from './FormSummary';
import { applyServerError } from './serverErrors';

const wrap = (ui: React.ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);

describe('Field', () => {
  it('links the control to its error', () => {
    wrap(
      <Field id="n" label="Nom" error="form.error.nameRequired">
        {(a) => <input {...a} />}
      </Field>
    );
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const msg = screen.getByText('Le nom est obligatoire.');
    expect(input.getAttribute('aria-describedby')).toContain(msg.closest('p')!.id);
  });

  it('points to the help when there is no error', () => {
    wrap(
      <Field id="n" label="Nom" help="Aide">
        {(a) => <input {...a} />}
      </Field>
    );
    const input = screen.getByLabelText('Nom');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Aide').id);
  });

  it('marks an optional field', () => {
    wrap(
      <Field id="n" label="Nom" optional>
        {(a) => <input {...a} />}
      </Field>
    );
    expect(screen.getByText(/facultatif/)).toBeInTheDocument();
  });
});

const schema = z.object({ name: z.string().min(2, 'form.error.nameLength') });

function Harness() {
  const { register, formState } = useForm<{ name: string }>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: { name: '' },
  });
  return (
    <TextField id="name" label="Nom" error={formState.errors.name?.message} {...register('name')} />
  );
}

describe('TextField', () => {
  it('validates on blur, then clears as you type', async () => {
    wrap(<Harness />);
    const input = screen.getByLabelText('Nom');
    fireEvent.change(input, { target: { value: 'a' } });
    expect(screen.queryByText(/2 à 80/)).not.toBeInTheDocument();
    fireEvent.blur(input);
    expect(await screen.findByText('Le nom doit contenir 2 à 80 caractères.')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'ab' } });
    await waitFor(() => expect(screen.queryByText(/2 à 80/)).not.toBeInTheDocument());
  });
});

describe('PasswordField', () => {
  it('toggles visibility', () => {
    wrap(<PasswordField id="p" label="Mot de passe" name="p" onChange={vi.fn()} onBlur={vi.fn()} />);
    const input = screen.getByLabelText('Mot de passe');
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Afficher le mot de passe' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Masquer le mot de passe' })).toBeInTheDocument();
  });
});

describe('FormSummary', () => {
  it('announces the count', () => {
    wrap(<FormSummary count={2} />);
    expect(screen.getByRole('alert')).toHaveTextContent('2 champs à corriger.');
  });
  it('renders nothing for zero', () => {
    wrap(<FormSummary count={0} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('applyServerError', () => {
  it('maps a known code to its field', () => {
    const setError = vi.fn();
    expect(applyServerError('invalid_phone', { invalid_phone: 'clientPhone' }, setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith('clientPhone', { type: 'server', message: 'admin.error.invalid_phone' });
  });
  it('uses the given key prefix', () => {
    const setError = vi.fn();
    applyServerError('x', { x: 'f' }, setError, 'settings.error');
    expect(setError).toHaveBeenCalledWith('f', { type: 'server', message: 'settings.error.x' });
  });
  it('returns false for an unknown code', () => {
    const setError = vi.fn();
    expect(applyServerError('nope', {}, setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});
