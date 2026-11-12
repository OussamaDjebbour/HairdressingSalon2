import { forwardRef } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import { Field } from './Field';

export interface Option {
  value: string;
  label: string;
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onValueChange(v: string): void;
  onBlur?(): void;
  error?: string;
  optional?: boolean;
  help?: string;
  placeholder?: string;
  /** Render item text left-to-right (times such as 10:15 in an Arabic page). */
  dirLtrValues?: boolean;
  /** A narrow trigger for short values (a time in an hours row): small text and a small arrow. */
  compact?: boolean;
  /** Label for a current value that isn't among the options (e.g. "50 min" for an old duration). */
  formatValue?(value: string): string;
}

/** Options plus the current value when it is not on the list (kept at its sorted place). */
function withCurrent(options: Option[], value: string, formatValue?: (value: string) => string): Option[] {
  if (!value || options.some((o) => o.value === value)) return options;
  const next = [...options];
  const at = next.findIndex((o) => o.value.localeCompare(value, undefined, { numeric: true }) > 0);
  next.splice(at === -1 ? next.length : at, 0, { value, label: formatValue ? formatValue(value) : value });
  return next;
}

export const SelectField = forwardRef<HTMLButtonElement, SelectFieldProps>(function SelectField(
  { id, label, value, options, onValueChange, onBlur, error, optional, help, placeholder, dirLtrValues, compact, formatValue },
  ref
) {
  const items = withCurrent(options, value, formatValue);
  return (
    <Field id={id} label={label} optional={optional} help={help} error={error}>
      {(a11y) => (
        <Select.Root
          value={value}
          onValueChange={onValueChange}
          onOpenChange={(open) => {
            if (!open) onBlur?.(); // touched once the menu closes, not when it opens
          }}
        >
          <Select.Trigger
            {...a11y}
            ref={ref}
            className={
              compact
                ? 'input flex min-h-11 items-center justify-center gap-0.5 px-1.5 py-2 text-sm'
                : 'input flex items-center gap-2 text-start'
            }
          >
            <span className={compact ? 'whitespace-nowrap' : 'min-w-0 flex-1 truncate'} dir={dirLtrValues ? 'ltr' : undefined}>
              <Select.Value placeholder={placeholder} />
            </span>
            <Select.Icon className={compact ? 'shrink-0 text-rose-500' : 'ms-auto shrink-0 text-rose-600'}>
              <ChevronDown className={compact ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden="true" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              sideOffset={6}
              collisionPadding={12}
              className={`z-[60] max-h-[min(20rem,var(--radix-select-content-available-height))] ${
                compact ? 'min-w-[var(--radix-select-trigger-width)]' : 'w-[var(--radix-select-trigger-width)]'
              } overflow-hidden rounded-xl border border-cream-300 bg-white shadow-lift`}
            >
              <Select.Viewport className="p-1">
                {items.map((o) => (
                  <Select.Item
                    key={o.value}
                    value={o.value}
                    className="tap flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-rose-900 outline-none data-[highlighted]:bg-cream-100 data-[state=checked]:font-medium"
                  >
                    <Select.ItemText>
                      <span dir={dirLtrValues ? 'ltr' : undefined}>{o.label}</span>
                    </Select.ItemText>
                    <Select.ItemIndicator className="ms-auto text-gold-600">
                      <Check className="h-4 w-4" aria-hidden="true" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      )}
    </Field>
  );
});
