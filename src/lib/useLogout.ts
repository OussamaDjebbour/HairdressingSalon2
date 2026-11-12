import { useQueryClient } from '@tanstack/react-query';
import { signOut } from './auth';
import { disablePush } from './push';

/** Logs staff out: stops notifications on this device first, then drops the session and cached admin data. */
export function useLogout() {
  const queryClient = useQueryClient();
  return async () => {
    try {
      // A logged-out device must not keep receiving client names.
      await disablePush().catch(() => undefined);
      await signOut();
    } catch {
      // Session may still be active (e.g. offline); the header stays in its logged-in state so staff can retry.
    } finally {
      queryClient.removeQueries({ queryKey: ['admin'] });
    }
  };
}
