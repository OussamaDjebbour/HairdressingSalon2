import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLang } from '../context/LanguageContext';
import { signIn } from '../lib/auth';
import { fetchDemoLogin } from '../data/admin';
import { currentSalonId, useSalon } from '../data/salon';
import { MSG } from '../data/schemas';
import { TextField } from './form/TextField';
import { PasswordField } from './form/PasswordField';
import { FormSummary } from './form/FormSummary';

const loginSchema = z.object({
  email: z.string().trim().min(1, MSG.emailRequired).pipe(z.email(MSG.email)),
  password: z.string().min(1, MSG.passwordRequired),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { t } = useLang();
  const salon = useSalon();
  const {
    register,
    handleSubmit,
    formState: { errors, submitCount },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), mode: 'onTouched', defaultValues: { email: '', password: '' } });
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async ({ email, password }: LoginValues) => {
    setPending(true);
    setError(false);
    try {
      await signIn(email, password);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  const onDemo = async () => {
    setPending(true);
    setError(false);
    try {
      const login = await fetchDemoLogin(currentSalonId());
      if (!login) throw new Error('no_demo');
      await signIn(login.email, login.password);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-20">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="card p-8 space-y-5">
        <h1 className="font-display text-2xl font-semibold text-rose-900">{t('admin.login.title')}</h1>
        <TextField
          id="admin-email"
          label={t('admin.login.email')}
          type="email"
          autoComplete="username"
          dir="ltr"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          id="admin-password"
          label={t('admin.login.password')}
          autoComplete="current-password"
          dir="ltr"
          error={errors.password?.message}
          {...register('password')}
        />
        {submitCount > 0 && <FormSummary count={Object.keys(errors).length} />}
        {error && (
          <p role="alert" className="text-sm text-rust-700">{t('admin.login.error')}</p>
        )}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {t('admin.login.submit')}
        </button>
        {salon.demo && (
          <button type="button" disabled={pending} onClick={onDemo} className="btn-secondary w-full">
            {t('admin.login.demo')}
          </button>
        )}
      </form>
    </div>
  );
}
