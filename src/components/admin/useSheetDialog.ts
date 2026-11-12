import { useEffect, useRef } from 'react';

/** Where Radix portals its menus and calendars (outside the sheet in the DOM, above it on screen). */
const PORTAL = '[data-radix-popper-content-wrapper]';
const FOCUSABLE = 'button:not([disabled]):not([tabindex="-1"]), input:not([tabindex="-1"]), select:not([tabindex="-1"]), a[href]';

/** True when the event happened inside an open Radix menu or calendar. */
export function isInPortal(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(PORTAL);
}

/**
 * Bottom-sheet dialog behaviour: focus moves in on open and back where it was on close,
 * Escape asks to close, Tab stays inside. Returns the ref for the dialog element.
 * An open Radix menu or calendar (portalled outside the sheet) counts as part of it:
 * Escape closes that first, and Tab may move through it.
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
        // Radix closes its own menu on this Escape; the sheet stays.
        if (document.querySelector(PORTAL)) return;
        requestCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || e.defaultPrevented || !dialogRef.current) return;
      const focusables = [dialogRef.current, ...Array.from(document.querySelectorAll<HTMLElement>(PORTAL))].flatMap((root) =>
        Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
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
