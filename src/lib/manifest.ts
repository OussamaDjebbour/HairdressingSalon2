import { useEffect } from 'react';

/**
 * Links the installable-app manifest only while the staff admin is open, so a client who adds the public
 * site to their home screen doesn't get an app that opens on the staff login (start_url is /admin).
 * On Cloudflare Pages `/manifest.webmanifest` is answered per salon by functions/manifest.webmanifest.ts
 * (salon name and colours); public/manifest.webmanifest is Élégance's copy for local development.
 */
export function useAdminManifest(): void {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.webmanifest';
    document.head.appendChild(link);
    return () => link.remove();
  }, []);
}
