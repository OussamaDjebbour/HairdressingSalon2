// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { demoEmail, demoErrorMessage, generateDemoPassword, parseDemoArgs } from './demo';

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
    expect(parseDemoArgs(['elegance'])).toEqual({ salonId: 'elegance', dryRun: false, domain: 'demo.invalid' });
    expect(parseDemoArgs(['elegance', '--dry-run', '--domain=demo.example.com'])).toEqual({
      salonId: 'elegance', dryRun: true, domain: 'demo.example.com',
    });
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
