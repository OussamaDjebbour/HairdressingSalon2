import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';

export interface FieldA11y {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

interface FieldProps {
  id: string;
  label: string;
  optional?: boolean;
  help?: string;
  /** An i18n key (form.error.*), not a sentence. */
  error?: string;
  children: (a11y: FieldA11y) => ReactNode;
}

/** A label, a control, an optional help line and an error line, wired together for screen readers. */
export function Field({ id, label, optional, help, error, children }: FieldProps) {
  const { t } = useLang();
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ');

  return (
    <div>
      <label id={`${id}-label`} htmlFor={id} className="label">
        {label}
        {optional && <span className="ms-1.5 font-normal text-rose-600">({t('form.optional')})</span>}
      </label>
      {children({
        id,
        'aria-invalid': Boolean(error),
        'aria-describedby': describedBy || undefined,
      })}
      {help && (
        <p id={helpId} className="field-help mt-1.5">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error mt-1.5">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t(error)}</span>
        </p>
      )}
    </div>
  );
}
