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
  text: string | null;
  placeholder: string;
  children: ReactNode;
}

/** The input-looking button and the popover that holds a calendar. */
export function CalendarPopover({ a11y, triggerRef, onBlur, text, placeholder, children }: Props) {
  const { dir } = useLang();
  return (
    <Popover.Root>
      <Popover.Trigger
        {...a11y}
        ref={triggerRef}
        onBlur={onBlur}
        type="button"
        className="input flex items-center gap-2 text-start"
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${text ? '' : 'text-rose-500/70'}`}>{text ?? placeholder}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          collisionPadding={12}
          dir={dir}
          className="z-[60] rounded-2xl border border-cream-300 bg-white p-3 shadow-lift"
        >
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
