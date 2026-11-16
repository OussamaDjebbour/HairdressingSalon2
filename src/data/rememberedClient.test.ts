import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetClient, loadClient, saveClient } from './rememberedClient';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('remembered client', () => {
  it('save then load returns the client', () => {
    saveClient('elegance', { name: 'Nadia', phone: '0555123456' });
    expect(loadClient('elegance')).toEqual({ name: 'Nadia', phone: '0555123456' });
  });
  it('forget clears it', () => {
    saveClient('elegance', { name: 'Nadia', phone: '0555123456' });
    forgetClient('elegance');
    expect(loadClient('elegance')).toBeNull();
  });
  it('stored per salon', () => {
    saveClient('elegance', { name: 'Nadia', phone: '0555123456' });
    expect(loadClient('yasmine')).toBeNull();
  });
  it('ignores a malformed saved value', () => {
    localStorage.setItem('salon:elegance:client', '{"name":42}');
    expect(loadClient('elegance')).toBeNull();
  });
  it('load/save survive a throwing storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => saveClient('elegance', { name: 'Nadia', phone: '0555123456' })).not.toThrow();
    expect(loadClient('elegance')).toBeNull();
    expect(() => forgetClient('elegance')).not.toThrow();
  });
});
