import { useEffect, useRef } from 'react';

/**
 * Bottom-sheet dialog behaviour: focus moves in on open and back where it was on close,
 * Escape asks to close, Tab stays inside. Returns the ref for the dialog element.
 */
export function useSheetDialog(requestClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, select, a[href]')
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return dialogRef;
}
