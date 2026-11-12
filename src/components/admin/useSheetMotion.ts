import { useEffect, useRef, useState } from 'react';

/**
 * When the sheet is really closed: the slide-down (`duration-200` in Sheet) plus a little time for it
 * to start, so it is seen reaching the bottom rather than vanishing on the way.
 */
export const SHEET_EXIT_MS = 240;

export type SheetMotionState = 'entering' | 'open' | 'closing';

/** Animate only when the device can tell us, and hasn't asked for reduced motion. */
function animates(): boolean {
  return typeof window.matchMedia === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A sheet's slide in and out. `dismiss(then)` plays the slide-down, then runs `then` (which
 * unmounts the sheet); with reduced motion it runs `then` at once. Calling it twice does nothing more.
 */
export function useSheetMotion() {
  const [state, setState] = useState<SheetMotionState>('entering');
  const closing = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // One frame at the start position, then slide in.
    const frame = window.requestAnimationFrame(() => setState((s) => (s === 'entering' ? 'open' : s)));
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer.current);
    };
  }, []);

  const dismiss = (then: () => void) => {
    if (closing.current) return;
    if (!animates()) {
      then();
      return;
    }
    closing.current = true;
    setState('closing');
    timer.current = window.setTimeout(then, SHEET_EXIT_MS);
  };

  return { state, dismiss };
}
