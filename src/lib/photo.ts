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

/** A decoded photo, ready to draw; `release` frees what decoding held on to. */
interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release(): void;
}

/**
 * Decode a picked photo the right way up. `createImageBitmap` with `imageOrientation: 'from-image'`
 * only exists from iOS/Safari 16, Chrome 112 and Firefox 111; older phones (iPhones stuck on iOS 15,
 * second-hand Androids) refuse that option or have no `createImageBitmap` at all. They fall back to
 * an <img>, which applies the photo's EXIF orientation by default (Safari 13.1+, Chrome 81+).
 */
async function decodePhoto(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // unsupported option, or not decodable this way: try the <img> path
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError('photo_unreadable');
  }
}

/** Shrink a picked photo to a JPEG (long side 1600px) ready to upload. */
export async function preparePhoto(file: File): Promise<Blob> {
  // Some Android pickers hand over a real photo with an empty type: only a stated non-image type is
  // refused here; decoding decides the rest.
  if (file.type !== '' && !file.type.startsWith('image/')) throw new PhotoError('photo_not_image');
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoError('photo_too_large');

  const photo = await decodePhoto(file);
  try {
    const { width, height } = fitWithin(photo.width, photo.height, PHOTO_LONG_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new PhotoError('photo_unreadable');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(photo.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY),
    );
    if (!blob) throw new PhotoError('photo_unreadable');
    return blob;
  } finally {
    photo.release();
  }
}
