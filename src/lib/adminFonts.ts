/**
 * The admin's fonts (Inter, Fraunces). index.html only links the client page's fonts, so a
 * client on a slow phone never downloads these; the admin adds them when it loads.
 */
export const ADMIN_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700' +
  '&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400;1,9..144,500;1,9..144,600' +
  '&display=swap';

/** Adds the admin's font stylesheet to <head>, once. */
export function loadAdminFonts(doc: Document = document): void {
  if (doc.head.querySelector('link[data-admin-fonts]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = ADMIN_FONTS_URL;
  link.setAttribute('data-admin-fonts', '');
  doc.head.appendChild(link);
}
