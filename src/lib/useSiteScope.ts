import { useEffect } from 'react';

/**
 * Marks the document as the client page while mounted: the `site` class on <html> scopes the client
 * page's fonts, pearl grounds and restyled shared classes (index.css), so the admin keeps its own look.
 * On <html> rather than a wrapper so Radix portals and toasts rendered into <body> are covered too.
 */
export function useSiteScope(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('site');
    return () => root.classList.remove('site');
  }, []);
}
