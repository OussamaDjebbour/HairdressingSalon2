import { useState, type FormEvent } from 'react';
import { useLang } from '../context/LanguageContext';
import { signIn } from '../lib/auth';

export function LoginForm() {
  const { t } = useLang();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(false);
    try {
      await signIn(email.trim(), password);
    } catch {
      setError(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-4 py-20">
      <form onSubmit={onSubmit} className="card p-8 space-y-5">
        <h1 className="font-display text-2xl font-semibold text-rose-900">{t('admin.login.title')}</h1>
        <div>
          <label htmlFor="admin-email" className="label">{t('admin.login.email')}</label>
          <input
            id="admin-email"
            type="email"
            autoComplete="username"
            required
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="admin-password" className="label">{t('admin.login.password')}</label>
          <input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            required
            dir="ltr"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-rust-700">{t('admin.login.error')}</p>
        )}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {t('admin.login.submit')}
        </button>
      </form>
    </div>
  );
}
