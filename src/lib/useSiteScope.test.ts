import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSiteScope } from './useSiteScope';

afterEach(() => document.documentElement.classList.remove('site'));

describe('useSiteScope', () => {
  it('adds the site class to <html> on mount', () => {
    renderHook(() => useSiteScope());
    expect(document.documentElement).toHaveClass('site');
  });

  it('removes the site class on unmount', () => {
    const { unmount } = renderHook(() => useSiteScope());
    unmount();
    expect(document.documentElement).not.toHaveClass('site');
  });
});
