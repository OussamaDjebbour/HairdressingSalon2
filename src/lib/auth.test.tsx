import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { unsubscribe } = vi.hoisted(() => ({ unsubscribe: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe } } })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

import { supabase } from './supabase';
import { signIn, useSession } from './auth';

beforeEach(() => vi.clearAllMocks());

describe('useSession', () => {
  it('loads the current session and unsubscribes on unmount', async () => {
    (supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    });

    const { result, unmount } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual({ user: { id: 'u1' } });

    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('signIn', () => {
  it('throws when Supabase returns an error', async () => {
    (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: new Error('Invalid login credentials'),
    });
    await expect(signIn('a@b.c', 'x')).rejects.toThrow('Invalid login credentials');
  });
});
