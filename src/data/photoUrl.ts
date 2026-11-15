/** Public Supabase Storage bucket holding owner-uploaded photos (`<salon>/uploads/<uuid>.jpg`). */
export const PHOTO_BUCKET = 'salon-photos';

/** Turns a stored image value into a URL the browser can load: '' stays '', absolute URLs pass through, paths become public storage URLs. */
export function photoUrl(image: string, base: string = import.meta.env.VITE_SUPABASE_URL): string {
  if (!image) return '';
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${PHOTO_BUCKET}/${image}`;
}
