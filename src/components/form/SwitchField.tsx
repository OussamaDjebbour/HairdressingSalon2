import * as Switch from '@radix-ui/react-switch';

interface Props {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange(c: boolean): void;
  /** Put the label before the switch (a row that starts with the day name). */
  labelFirst?: boolean;
  labelClassName?: string;
}

export function SwitchField({ id, label, checked, onCheckedChange, labelFirst, labelClassName = '' }: Props) {
  const text = (
    <label htmlFor={id} className={`cursor-pointer text-rose-900 ${labelClassName}`}>
      {label}
    </label>
  );
  return (
    <div className={`flex items-center ${labelFirst ? 'gap-2' : 'gap-3'}`}>
      {labelFirst && text}
      {/* The 44 px tap area around the 44 × 24 px track: a tap anywhere in it toggles the switch. */}
      <label htmlFor={id} className="tap inline-flex shrink-0 cursor-pointer items-center justify-center">
        <Switch.Root
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          className="inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-cream-300 p-0.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 data-[state=checked]:bg-rose-700"
        >
          <Switch.Thumb className="block h-5 w-5 rounded-full bg-white shadow-soft transition-transform data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5" />
        </Switch.Root>
      </label>
      {!labelFirst && text}
    </div>
  );
}
