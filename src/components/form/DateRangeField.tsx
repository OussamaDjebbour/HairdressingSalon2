import { forwardRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import { useLang } from '../../context/LanguageContext';
import { formatLongDate } from '../../data/formatters';
import type { Period } from '../../data/period';
import { Field } from './Field';
import { CalendarPopover, useCalendarProps } from './calendarShared';

export type { Period };

interface Props {
  id: string;
  label: string;
  value: Period | null;
  onChange(p: Period | null): void;
  onBlur?(): void;
  error?: string;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const DateRangeField = forwardRef<HTMLButtonElement, Props>(function DateRangeField(
  { id, label, value, onChange, onBlur, error },
  ref
) {
  const { t, lang } = useLang();
  const calendar = useCalendarProps();
  // true after the first click of a range, until the second one
  const [extending, setExtending] = useState(false);

  const text = value
    ? sameDay(value.from, value.to)
      ? formatLongDate(value.from, lang)
      : `${formatLongDate(value.from, lang)} → ${formatLongDate(value.to, lang)}`
    : null;

  const pick = (d: Date) => {
    if (extending && value) {
      const [from, to] = d < value.from ? [d, value.from] : [value.from, d];
      onChange({ from, to });
      setExtending(false);
    } else {
      onChange({ from: d, to: d });
      setExtending(true);
    }
  };

  return (
    <Field id={id} label={label} error={error}>
      {(a11y) => (
        <CalendarPopover
          a11y={a11y}
          triggerRef={ref}
          onBlur={onBlur}
          onOpen={() => setExtending(false)}
          text={text}
          placeholder={t('form.pickPeriod')}
        >
          <DayPicker
            {...calendar}
            modifiers={value ? { range: { from: value.from, to: value.to }, rangeEdge: [value.from, value.to] } : undefined}
            modifiersClassNames={{ range: 'range-day', rangeEdge: 'range-edge' }}
            defaultMonth={value?.from}
            onDayClick={pick}
          />
        </CalendarPopover>
      )}
    </Field>
  );
});
