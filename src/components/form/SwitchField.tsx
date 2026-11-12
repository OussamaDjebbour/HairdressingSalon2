import * as Switch from '@radix-ui/react-switch';

interface Props {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange(c: boolean): void;
}

export function SwitchField({ id, label, checked, onCheckedChange }: Props) {
  return (
    <div className="flex items-center gap-3">
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="tap relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full bg-cream-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-200 data-[state=checked]:bg-rose-700"
      >
        <Switch.Thumb className="block h-5 w-5 translate-x-1 rounded-full bg-white shadow-soft transition-transform rtl:-translate-x-1 data-[state=checked]:translate-x-6 rtl:data-[state=checked]:-translate-x-6" />
      </Switch.Root>
      <label htmlFor={id} className="cursor-pointer text-rose-900">
        {label}
      </label>
    </div>
  );
}
