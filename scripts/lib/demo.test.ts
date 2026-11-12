// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  configureDemoLogin, confirmationStep, demoEmail, demoErrorMessage, describePreflight, generateDemoPassword,
  parseDemoArgs, preflightRefusal, typedConfirmationMatches, type DemoLoginOps, type DemoPreflight,
} from './demo';

describe('demoEmail', () => {
  it('is demo+<salon-id>@demo.invalid by default', () => {
    expect(demoEmail('elegance')).toBe('demo+elegance@demo.invalid');
  });
  it('accepts another domain', () => {
    expect(demoEmail('sara', 'demo.example.com')).toBe('demo+sara@demo.example.com');
  });
});

describe('generateDemoPassword', () => {
  it('is at least 16 characters from a URL-safe alphabet, and differs each time', () => {
    const a = generateDemoPassword();
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(generateDemoPassword()).not.toBe(a);
  });
});

describe('parseDemoArgs', () => {
  it('reads the salon id and flags', () => {
    expect(parseDemoArgs(['elegance'])).toEqual({ salonId: 'elegance', dryRun: false, domain: 'demo.invalid', yes: null, force: false });
    expect(parseDemoArgs(['elegance', '--dry-run', '--domain=demo.example.com'])).toEqual({
      salonId: 'elegance', dryRun: true, domain: 'demo.example.com', yes: null, force: false,
    });
  });
  it('reads --yes=<salon-id> and --force', () => {
    expect(parseDemoArgs(['elegance', '--yes=elegance', '--force'])).toMatchObject({ yes: 'elegance', force: true });
    expect(() => parseDemoArgs(['elegance', '--yes'])).toThrow(/Usage/);
    expect(() => parseDemoArgs(['elegance', '--yes='])).toThrow(/Usage/);
  });
  it('rejects a missing salon id with a readable error', () => {
    expect(() => parseDemoArgs([])).toThrow(/Usage: pnpm setup-demo <salon-id>/);
    expect(() => parseDemoArgs(['--dry-run'])).toThrow(/Usage/);
  });
  it('rejects an invalid id, extra arguments and unknown flags', () => {
    expect(() => parseDemoArgs(['Bad Id'])).toThrow(/Usage/);
    expect(() => parseDemoArgs(['a', 'b'])).toThrow(/Usage/);
    expect(() => parseDemoArgs(['a', '--nope'])).toThrow(/Usage/);
    expect(() => parseDemoArgs(['a', '--domain=not a domain'])).toThrow(/Usage/);
  });
});

describe('demoErrorMessage', () => {
  it('explains each setup_demo refusal', () => {
    expect(demoErrorMessage('not_found', 'x', 'e')).toMatch(/no salon "x"/i);
    expect(demoErrorMessage('staff_taken', 'x', 'e')).toMatch(/staff of another salon/);
    expect(demoErrorMessage('owner_account', 'x', 'e')).toMatch(/owner/);
    expect(demoErrorMessage('email_mismatch', 'x', 'e')).toMatch(/email/);
    expect(demoErrorMessage('boom', 'x', 'e')).toBe('boom');
  });
});

const realSalon: DemoPreflight = { name: 'Sara Beauty', future_bookings: 12, future_online_bookings: 4, owner_staff: 1, demo: false };
const fresh: DemoPreflight = { name: 'Élégance', future_bookings: 0, future_online_bookings: 0, owner_staff: 1, demo: false };
const demoSalon: DemoPreflight = { name: 'Élégance', future_bookings: 20, future_online_bookings: 9, owner_staff: 1, demo: true };

describe('describePreflight', () => {
  it('shows the name, future bookings, owners and the demo flag', () => {
    const text = describePreflight('sara', realSalon).join('\n');
    expect(text).toContain('Sara Beauty');
    expect(text).toMatch(/12 future bookings \(4 online\)/);
    expect(text).toMatch(/1 owner account/);
    expect(text).toMatch(/not the demo yet/);
    expect(describePreflight('elegance', demoSalon).join('\n')).toMatch(/already the demo/);
  });
});

describe('preflightRefusal', () => {
  it('refuses a salon that is not the demo and has future online bookings (real clients)', () => {
    expect(preflightRefusal('sara', realSalon, false)).toMatch(/4 future online bookings/);
    expect(preflightRefusal('sara', realSalon, false)).toMatch(/--force/);
  });
  it('lets --force through', () => {
    expect(preflightRefusal('sara', realSalon, true)).toBeNull();
  });
  it('accepts a salon without future online bookings, or one already the demo', () => {
    expect(preflightRefusal('elegance', fresh, false)).toBeNull();
    expect(preflightRefusal('elegance', { ...fresh, future_bookings: 3 }, false)).toBeNull();
    expect(preflightRefusal('elegance', demoSalon, false)).toBeNull();
  });
});

describe('confirmationStep', () => {
  it('is confirmed by --yes=<the same salon id>, with or without a terminal', () => {
    expect(confirmationStep({ salonId: 'elegance', yes: 'elegance', isTTY: false })).toEqual({ kind: 'confirmed' });
    expect(confirmationStep({ salonId: 'elegance', yes: 'elegance', isTTY: true })).toEqual({ kind: 'confirmed' });
  });
  it('refuses --yes for another salon', () => {
    const step = confirmationStep({ salonId: 'elegance', yes: 'sara', isTTY: true });
    expect(step.kind).toBe('refuse');
    expect(step.kind === 'refuse' && step.message).toMatch(/--yes=sara does not match "elegance"/);
  });
  it('asks in a terminal, refuses without one', () => {
    expect(confirmationStep({ salonId: 'elegance', yes: null, isTTY: true })).toEqual({ kind: 'prompt' });
    const step = confirmationStep({ salonId: 'elegance', yes: null, isTTY: false });
    expect(step.kind).toBe('refuse');
    expect(step.kind === 'refuse' && step.message).toMatch(/--yes=elegance/);
  });
});

describe('typedConfirmationMatches', () => {
  it('needs exactly the salon id (surrounding spaces ignored)', () => {
    expect(typedConfirmationMatches('elegance', 'elegance')).toBe(true);
    expect(typedConfirmationMatches(' elegance\n', 'elegance')).toBe(true);
    expect(typedConfirmationMatches('y', 'elegance')).toBe(false);
    expect(typedConfirmationMatches('Elegance', 'elegance')).toBe(false);
    expect(typedConfirmationMatches('', 'elegance')).toBe(false);
  });
});

describe('configureDemoLogin', () => {
  function ops(over: Partial<DemoLoginOps> = {}) {
    const calls: string[] = [];
    const o: DemoLoginOps = {
      findUser: vi.fn(async () => { calls.push('find'); return null; }),
      createUser: vi.fn(async () => { calls.push('create'); return { id: 'new-id' }; }),
      setupDemo: vi.fn(async () => { calls.push('setup_demo'); return null; }),
      setPassword: vi.fn(async () => { calls.push('setPassword'); return null; }),
      ...over,
    };
    return { o, calls };
  }

  it('new user: creates it with the password, then setup_demo', async () => {
    const { o, calls } = ops();
    expect(await configureDemoLogin(o, 'demo+e@demo.invalid', 'pw')).toEqual({ ok: true, userId: 'new-id', created: true, passwordError: null });
    expect(calls).toEqual(['find', 'create', 'setup_demo']);
    expect(o.createUser).toHaveBeenCalledWith('demo+e@demo.invalid', 'pw');
    expect(o.setupDemo).toHaveBeenCalledWith('new-id', 'pw');
    expect(o.setPassword).not.toHaveBeenCalled();
  });

  it('existing user: setup_demo first (it validates), then the same password on the auth user', async () => {
    const calls: string[] = [];
    const { o } = ops({ findUser: vi.fn(async () => { calls.push('find'); return { id: 'old-id' }; }) });
    o.setupDemo = vi.fn(async () => { calls.push('setup_demo'); return null; });
    o.setPassword = vi.fn(async () => { calls.push('setPassword'); return null; });
    expect(await configureDemoLogin(o, 'demo+e@demo.invalid', 'pw2')).toEqual({ ok: true, userId: 'old-id', created: false, passwordError: null });
    expect(calls).toEqual(['find', 'setup_demo', 'setPassword']);
    expect(o.setupDemo).toHaveBeenCalledWith('old-id', 'pw2');
    expect(o.setPassword).toHaveBeenCalledWith('old-id', 'pw2');
    expect(o.createUser).not.toHaveBeenCalled();
  });

  it('existing user refused by setup_demo (e.g. an owner): the password is never touched', async () => {
    const { o } = ops({ findUser: vi.fn(async () => ({ id: 'owner-id' })), setupDemo: vi.fn(async () => 'owner_account') });
    expect(await configureDemoLogin(o, 'e', 'pw')).toEqual({ ok: false, step: 'setup_demo', error: 'owner_account' });
    expect(o.setPassword).not.toHaveBeenCalled();
  });

  it('existing user whose password update fails: reports it (setup_demo already stored the new one)', async () => {
    const { o } = ops({ findUser: vi.fn(async () => ({ id: 'old-id' })), setPassword: vi.fn(async () => 'network down') });
    expect(await configureDemoLogin(o, 'e', 'pw')).toEqual({ ok: true, userId: 'old-id', created: false, passwordError: 'network down' });
  });

  it('new user: a failed creation stops before setup_demo', async () => {
    const { o } = ops({ createUser: vi.fn(async () => ({ error: 'email exists' })) });
    expect(await configureDemoLogin(o, 'e', 'pw')).toEqual({ ok: false, step: 'create', error: 'email exists' });
    expect(o.setupDemo).not.toHaveBeenCalled();
  });

  it('new user: a setup_demo refusal is reported', async () => {
    const { o } = ops({ setupDemo: vi.fn(async () => 'staff_taken') });
    expect(await configureDemoLogin(o, 'e', 'pw')).toEqual({ ok: false, step: 'setup_demo', error: 'staff_taken' });
  });
});
