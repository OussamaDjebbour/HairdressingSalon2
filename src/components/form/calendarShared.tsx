import { useState } from 'react';
import type { ReactNode } from 'react';
import { CalendarDays } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { fr, arDZ } from 'react-day-picker/locale';
import type { FieldA11y } from './Field';
import { useLang } from '../../context/LanguageContext';
import 'react-day-picker/style.css';

export function useCalendarProps() {
  const { lang, dir, t } = useLang();
  return {
    locale: lang === 'ar' ? arDZ : fr,
    dir,
    weekStartsOn: 0 as const,
    labels: { labelPrevious: () => t('form.prevMonth'), labelNext: () => t('form.nextMonth') },
    className: 'salon-calendar',
  };
}

interface Props {
  a11y: FieldA11y;
  triggerRef: React.Ref<HTMLButtonElement>;
  onBlur?(): void;
  /** Called each time the popover opens. */
  onOpen?(): void;
  /** The chosen value, compact enough for a phone-width field ("Jeu. 12 nov."). */
  text: string | null;
  /** The same value in full, for screen readers ("Jeudi 12 novembre"). */
  spoken: string | null;
  placeholder: string;
  /** The calendar; `close` shuts the popover once the choice is complete. */
  children(close: () => void): ReactNode;
}

/**
 * The input-looking button and the popover that holds a calendar. The button is named by the
 * field's label and the full chosen value ("Date Jeudi 12 novembre"), like a Select announces its own.
 */
export function CalendarPopover({ a11y, triggerRef, onBlur, onOpen, text, spoken, placeholder, children }: Props) {
  const { dir } = useLang();
  const valueId = `${a11y.id}-value`;
  const [open, setOpen] = useState(false);
  const change = (next: boolean) => {
    setOpen(next);
    if (next) onOpen?.();
    else onBlur?.(); // touched once the user is done picking, not when the calendar opens
  };
  return (
    <Popover.Root open={open} onOpenChange={change}>
      <Popover.Trigger
        {...a11y}
        aria-labelledby={`${a11y.id}-label ${valueId}`}
        ref={triggerRef}
        onBlur={() => {
          if (!open) onBlur?.();
        }}
        type="button"
        className="input flex items-center gap-2 text-start"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <span id={valueId} className="sr-only">{spoken ?? placeholder}</span>
        <span aria-hidden="true" className={`min-w-0 flex-1 truncate ${text ? '' : 'text-rose-500/70'}`}>
          {text ?? placeholder}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          dir={dir}
          className="z-[60] rounded-2xl border border-cream-300 bg-white p-3 shadow-lift"
        >
          {children(() => change(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
