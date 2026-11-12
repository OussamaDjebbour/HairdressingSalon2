import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { Field } from './Field';

export type TextFieldProps = {
  id: string;
  label: string;
  optional?: boolean;
  help?: string;
  error?: string;
  multiline?: boolean;
} & UseFormRegisterReturn &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'onChange' | 'onBlur'>;

export const TextField = forwardRef<HTMLInputElement | HTMLTextAreaElement, TextFieldProps>(
  function TextField({ id, label, optional, help, error, multiline, ...control }, ref) {
    return (
      <Field id={id} label={label} optional={optional} help={help} error={error}>
        {(a11y) =>
          multiline ? (
            <textarea
              {...(control as unknown as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
              {...a11y}
              ref={ref as React.Ref<HTMLTextAreaElement>}
              className="input"
              rows={3}
            />
          ) : (
            <input {...control} {...a11y} ref={ref as React.Ref<HTMLInputElement>} className="input" />
          )
        }
      </Field>
    );
  }
);
