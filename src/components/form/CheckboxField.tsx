import * as Checkbox from '@radix-ui/react-checkbox';
import { Check } from 'lucide-react';

interface Props {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange(c: boolean): void;
}

export function CheckboxField({ id, label, checked, onCheckedChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={(c) => onCheckedChange(c === true)}
        className="group tap flex shrink-0 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-200"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-cream-300 bg-cream-50 text-white transition-colors group-data-[state=checked]:bg-rose-700">
          <Checkbox.Indicator>
            <Check className="h-4 w-4" aria-hidden="true" />
          </Checkbox.Indicator>
        </span>
      </Checkbox.Root>
      <label htmlFor={id} className="cursor-pointer text-rose-900">
        {label}
      </label>
    </div>
  );
}
