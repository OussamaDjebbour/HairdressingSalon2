import { describe, it, expect } from 'vitest';
import type { z } from 'zod';
import {
  clientNameSchema, mobilePhoneSchema, optionalMobilePhoneSchema, optionalHttpsUrlSchema, periodSchema,
} from './schemas';

const msg = (s: z.ZodType, v: unknown) => {
  const r = s.safeParse(v);
  return r.success ? 'ok' : r.error.issues[0].message;
};

describe('schemas', () => {
  it('client name', () => {
    expect(msg(clientNameSchema, '')).toBe('form.error.nameRequired');
    expect(msg(clientNameSchema, 'a')).toBe('form.error.nameLength');
    expect(msg(clientNameSchema, 'a'.repeat(81))).toBe('form.error.nameLength');
    expect(msg(clientNameSchema, ' Nour ')).toBe('ok');
  });
  it('phone', () => {
    expect(msg(mobilePhoneSchema, '')).toBe('form.error.phoneRequired');
    expect(msg(mobilePhoneSchema, '021 12 34 56')).toBe('form.error.phone');
    expect(msg(mobilePhoneSchema, '+213 555 12 34 56')).toBe('ok');
    expect(msg(optionalMobilePhoneSchema, '')).toBe('ok');
    expect(msg(optionalMobilePhoneSchema, '021 12 34 56')).toBe('form.error.phone');
  });
  it('https url', () => {
    expect(msg(optionalHttpsUrlSchema, '')).toBe('ok');
    expect(msg(optionalHttpsUrlSchema, 'http://x')).toBe('form.error.url');
    expect(msg(optionalHttpsUrlSchema, 'https://x.dz')).toBe('ok');
  });
  it('period', () => {
    expect(msg(periodSchema, null)).toBe('form.error.periodRequired');
    expect(msg(periodSchema, { from: new Date(2026, 0, 5), to: new Date(2026, 0, 1) })).not.toBe('ok');
    expect(msg(periodSchema, { from: new Date(2026, 0, 1), to: new Date(2026, 0, 1) })).toBe('ok');
  });
});
