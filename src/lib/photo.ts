export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.82;

export type PhotoErrorCode = 'photo_not_image' | 'photo_too_large' | 'photo_unreadable';

export class PhotoError extends Error {
  code: PhotoErrorCode;
  constructor(code: PhotoErrorCode) {
    super(code);
    this.name = 'PhotoError';
    this.code = code;
  }
}

/** Scale down to fit `longSide` on the longer side, keeping the ratio; never scales up. */
export function fitWithin(
  width: number,
  height: number,
  longSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= longSide) return { width, height };
  const scale = longSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Shrink a picked photo to a JPEG (long side 1600px) ready to upload. */
export async function preparePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new PhotoError('photo_not_image');
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoError('photo_too_large');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoError('photo_unreadable');
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, PHOTO_LONG_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('photo_unreadable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY),
    );
    if (!blob) throw new PhotoError('photo_unreadable');
    return blob;
  } finally {
    bitmap.close();
  }
}
