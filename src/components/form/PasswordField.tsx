import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLang } from '../../context/LanguageContext';
import { Field } from './Field';
import type { TextFieldProps } from './TextField';

export const PasswordField = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(
  function PasswordField({ id, label, optional, help, error, multiline: _multiline, ...control }, ref) {
    const { t } = useLang();
    const [shown, setShown] = useState(false);
    const Icon = shown ? EyeOff : Eye;

    return (
      <Field id={id} label={label} optional={optional} help={help} error={error}>
        {(a11y) => (
          // A password reads left to right in both languages; the wrapper takes the same direction so the
          // eye button (end-0) sits on the side the input's pe-12 padding keeps free.
          <div className="relative" dir="ltr">
            <input
              {...control}
              {...a11y}
              dir="ltr"
              ref={ref as React.Ref<HTMLInputElement>}
              type={shown ? 'text' : 'password'}
              className="input pe-12"
            />
            <button
              type="button"
              onClick={() => setShown((s) => !s)}
              aria-label={t(shown ? 'form.hidePassword' : 'form.showPassword')}
              className="tap absolute inset-y-0 end-0 flex items-center justify-center text-rose-600 hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 rounded-xl"
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </Field>
    );
  }
);
