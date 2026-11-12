import { forwardRef } from 'react';
import { DayPicker } from 'react-day-picker';
import { useLang } from '../../context/LanguageContext';
import { formatLongDate } from '../../data/formatters';
import { Field } from './Field';
import { CalendarPopover, useCalendarProps } from './calendarShared';

interface Props {
  id: string;
  label: string;
  value: Date | null;
  onChange(d: Date): void;
  onBlur?(): void;
  error?: string;
}

export const DateField = forwardRef<HTMLButtonElement, Props>(function DateField(
  { id, label, value, onChange, onBlur, error },
  ref
) {
  const { t, lang } = useLang();
  const calendar = useCalendarProps();
  return (
    <Field id={id} label={label} error={error}>
      {(a11y) => (
        <CalendarPopover
          a11y={a11y}
          triggerRef={ref}
          onBlur={onBlur}
          text={value ? formatLongDate(value, lang) : null}
          placeholder={t('form.pickDate')}
        >
          <DayPicker
            {...calendar}
            mode="single"
            selected={value ?? undefined}
            defaultMonth={value ?? undefined}
            onSelect={(d) => d && onChange(d)}
          />
        </CalendarPopover>
      )}
    </Field>
  );
});
