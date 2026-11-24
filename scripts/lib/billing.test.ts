// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { addMonths, algiersToday, nextPaidUntil, parseArgs } from './billing';

describe('addMonths', () => {
  it('adds calendar months, keeping the day', () => {
    expect(addMonths('2027-11-15', 2)).toBe('2028-01-15');
    expect(addMonths('2027-03-31', 12)).toBe('2028-03-31');
  });
  it('cuts the day at the end of a shorter month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('nextPaidUntil', () => {
  it('paid ahead: extends from the current date, losing no day', () => {
    expect(nextPaidUntil('2027-03-10', '2027-02-01', 1)).toBe('2027-04-10');
  });
  it('paying late: extends from today, so the new period is whole', () => {
    expect(nextPaidUntil('2027-01-20', '2027-02-01', 1)).toBe('2027-03-01');
  });
  it('never billed: from today', () => {
    expect(nextPaidUntil(null, '2027-02-01', 12)).toBe('2028-02-01');
  });
});

describe('algiersToday', () => {
  it('is the date in Algiers (UTC+1), not UTC', () => {
    expect(algiersToday(new Date('2027-01-31T23:30:00Z'))).toBe('2027-02-01');
    expect(algiersToday(new Date('2027-01-31T22:30:00Z'))).toBe('2027-01-31');
  });
});

describe('parseArgs', () => {
  it('no arguments lists the salons', () => {
    expect(parseArgs([])).toEqual({ kind: 'list' });
  });
  it('reads --until, --months and --stop', () => {
    expect(parseArgs(['sara', '--until', '2027-01-31'])).toEqual({ kind: 'set', salonId: 'sara', until: '2027-01-31' });
    expect(parseArgs(['sara', '--months', '12'])).toEqual({ kind: 'extend', salonId: 'sara', months: 12 });
    expect(parseArgs(['sara', '--stop'])).toEqual({ kind: 'stop', salonId: 'sara' });
  });
  it.each([
    [['sara', '--months', '0']],
    [['sara', '--months', '25']],
    [['sara', '--months', '1.5']],
    [['sara', '--until', '31/01/2027']],
    [['sara', '--until', '2027-02-30']],
    [['sara']],
    [['sara', '--stop', '--months', '1']],
    [['--months', '1']],
    [['sara', '--nope']],
  ])('refuses %j with the usage line', (argv) => {
    expect(() => parseArgs(argv)).toThrow(/Usage: pnpm salon-paid/);
  });
});
