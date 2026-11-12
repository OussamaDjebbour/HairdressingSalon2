import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { LanguageProvider, useLang } from '../../context/LanguageContext';
import { SelectField } from './SelectField';
import { CheckboxField } from './CheckboxField';
import { SwitchField } from './SwitchField';
import { DateField } from './DateField';
import { DateRangeField } from './DateRangeField';
import type { Period } from '../../data/period';

const wrap = (ui: React.ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>);

afterEach(() => vi.useRealTimers());

describe('SelectField', () => {
  const stylists = [
    { value: 'amina', label: 'Amina' },
    { value: 'leila', label: 'Leila' },
  ];

  it('is named by its label and shows the selected option', () => {
    wrap(<SelectField id="s" label="Coiffeuse" value="amina" options={stylists} onValueChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Coiffeuse' });
    expect(trigger).toHaveTextContent('Amina');
  });

  it('selects an option and reports its value', () => {
    const onValueChange = vi.fn();
    wrap(<SelectField id="s" label="Coiffeuse" value="amina" options={stylists} onValueChange={onValueChange} />);
    const trigger = screen.getByRole('combobox', { name: 'Coiffeuse' });
    // Keyboard opening is unreliable in jsdom, so open with a mouse-style pointerdown.
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(screen.getByRole('option', { name: 'Leila' }));
    expect(onValueChange).toHaveBeenCalledWith('leila');
  });

  it('keeps a current value that is off the grid, in sorted place', () => {
    wrap(
      <SelectField
        id="t"
        label="Heure"
        value="10:10"
        options={[
          { value: '10:00', label: '10:00' },
          { value: '10:15', label: '10:15' },
        ]}
        onValueChange={() => {}}
      />
    );
    const trigger = screen.getByRole('combobox', { name: 'Heure' });
    expect(trigger).toHaveTextContent('10:10');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const labels = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(labels).toEqual(['10:00', '10:10', '10:15']);
  });

  it('sorts an off-grid numeric value numerically', () => {
    const opts = ['15', '90', '105', '600'].map((v) => ({ value: v, label: v }));
    wrap(<SelectField id="n" label="Durée" value="100" options={opts} onValueChange={() => {}} />);
    fireEvent.pointerDown(screen.getByRole('combobox', { name: 'Durée' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    });
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(['15', '90', '100', '105', '600']);
  });

  it('calls onBlur when the menu closes, not when it opens', () => {
    const onBlur = vi.fn();
    wrap(<SelectField id="s" label="Coiffeuse" value="amina" options={stylists} onValueChange={() => {}} onBlur={onBlur} />);
    const trigger = screen.getByRole('combobox', { name: 'Coiffeuse' });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    expect(onBlur).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'Leila' }));
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it('flags an error', () => {
    wrap(
      <SelectField id="s" label="Coiffeuse" value="" options={stylists} onValueChange={() => {}} error="form.error.required" />
    );
    expect(screen.getByRole('combobox', { name: 'Coiffeuse' })).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('CheckboxField', () => {
  it('toggles from its label', () => {
    function H() {
      const [c, setC] = useState(false);
      return <CheckboxField id="c" label="Fermé" checked={c} onCheckedChange={setC} />;
    }
    wrap(<H />);
    const box = screen.getByRole('checkbox', { name: 'Fermé' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(box).toHaveClass('tap');
    fireEvent.click(screen.getByText('Fermé'));
    expect(box).toHaveAttribute('aria-checked', 'true');
  });
});

describe('SwitchField', () => {
  it('toggles from its label', () => {
    function H() {
      const [c, setC] = useState(false);
      return <SwitchField id="w" label="Ouvert" checked={c} onCheckedChange={setC} />;
    }
    wrap(<H />);
    const sw = screen.getByRole('switch', { name: 'Ouvert' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByText('Ouvert'));
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps the track small and puts the 44 px tap area on its wrapper', () => {
    function H() {
      const [c, setC] = useState(false);
      return <SwitchField id="w" label="Ouvert" checked={c} onCheckedChange={setC} />;
    }
    wrap(<H />);
    const sw = screen.getByRole('switch', { name: 'Ouvert' });
    expect(sw).not.toHaveClass('tap');
    expect(sw).toHaveClass('h-6', 'w-11');
    const area = sw.parentElement!;
    expect(area).toHaveClass('tap');
    // a tap beside the track, inside the 44 px area, toggles it; a tap on the track toggles it once
    fireEvent.click(area);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'false');
  });
});

describe('DateField', () => {
  it('shows the date and picks another', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 0, 8, 10));
    const onChange = vi.fn();
    wrap(<DateField id="d" label="Date" value={new Date(2030, 0, 8)} onChange={onChange} />);
    const trigger = screen.getByRole('button', { name: /Date/ });
    expect(trigger).toHaveTextContent('Mar. 8 janv.');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: /vendredi 11 janvier 2030/ }));
    const d = onChange.mock.calls[0][0] as Date;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2030, 0, 11]);
  });

  it('announces the label and the full chosen date', () => {
    wrap(<DateField id="d" label="Date" value={new Date(2030, 0, 8)} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Date Mardi 8 janvier' })).toBeInTheDocument();
  });

  it('announces the placeholder when no date is chosen', () => {
    wrap(<DateField id="d" label="Date" value={null} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Date Choisir une date' })).toBeInTheDocument();
  });

  it('closes the calendar once a date is picked', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 0, 8, 10));
    function H() {
      const [v, setV] = useState<Date | null>(new Date(2030, 0, 8));
      return <DateField id="d" label="Date" value={v} onChange={setV} />;
    }
    wrap(<H />);
    fireEvent.click(screen.getByRole('button', { name: /Date/ }));
    expect(screen.getByRole('grid')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /vendredi 11 janvier 2030/ }));
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Date Vendredi 11 janvier' })).toHaveTextContent('Ven. 11 janv.');
  });
});

describe('DateField blur', () => {
  it('calls onBlur when the calendar closes, not when it opens', () => {
    const onBlur = vi.fn();
    wrap(<DateField id="d" label="Date" value={new Date(2030, 0, 8)} onChange={() => {}} onBlur={onBlur} />);
    const trigger = screen.getByRole('button', { name: /Date/ });
    fireEvent.click(trigger);
    expect(onBlur).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});

describe('DateRangeField', () => {
  function H({ onChange, arabic }: { onChange: (p: Period | null) => void; arabic?: boolean }) {
    const [v, setV] = useState<Period | null>(null);
    const { toggleLang } = useLang();
    return (
      <>
        {arabic && <button onClick={toggleLang}>lang</button>}
        <DateRangeField
          id="r"
          label="Période"
          value={v}
          onChange={(p) => {
            setV(p);
            onChange(p);
          }}
        />
      </>
    );
  }
  const open = () => fireEvent.click(screen.getByRole('button', { name: /Période/ }));
  const day = (n: number) => screen.getByRole('button', { name: new RegExp(`\\b${n} mai 2030`) });

  it('extends a range with a second click', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    const onChange = vi.fn();
    wrap(<H onChange={onChange} />);
    open();
    fireEvent.click(day(2));
    fireEvent.click(day(5));
    const last = onChange.mock.calls.at(-1)![0] as Period;
    expect([last.from.getDate(), last.to.getDate(), last.from.getMonth()]).toEqual([2, 5, 4]);
  });

  it('stays open after the first click and closes once the range is complete', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    wrap(<H onChange={() => {}} />);
    open();
    fireEvent.click(day(2));
    expect(screen.getByRole('grid')).toBeInTheDocument();
    fireEvent.click(day(5));
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });

  it('shows the period compactly and announces it in full', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    wrap(<H onChange={() => {}} />);
    open();
    fireEvent.click(day(2));
    fireEvent.click(day(5));
    const trigger = screen.getByRole('button', { name: 'Période du Jeudi 2 mai au Dimanche 5 mai' });
    expect(trigger).toHaveTextContent('Jeu. 2 → Dim. 5 mai');
  });

  it('a single click makes a one-day period', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    const onChange = vi.fn();
    wrap(<H onChange={onChange} />);
    open();
    fireEvent.click(day(2));
    const p = onChange.mock.calls[0][0] as Period;
    expect([p.from.getDate(), p.to.getDate()]).toEqual([2, 2]);
  });

  it('starts a new period after the popover was closed and reopened', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    const onChange = vi.fn();
    wrap(<H onChange={onChange} />);
    open();
    fireEvent.click(day(2));
    open(); // close
    open(); // reopen
    fireEvent.click(day(9));
    const p = onChange.mock.calls.at(-1)![0] as Period;
    expect([p.from.getDate(), p.to.getDate()]).toEqual([9, 9]);
  });

  it('lays the calendar out right-to-left in Arabic', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2030, 4, 1, 10));
    wrap(<H onChange={() => {}} arabic />);
    fireEvent.click(screen.getByText('lang'));
    fireEvent.click(screen.getByRole('button', { name: /اختيار فترة|Période|فترة/ }));
    expect(document.querySelector('.rdp-root')).toHaveAttribute('dir', 'rtl');
  });
});
