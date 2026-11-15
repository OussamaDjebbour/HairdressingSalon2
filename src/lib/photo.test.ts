import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_BYTES, PhotoError, fitWithin, preparePhoto } from './photo';

describe('fitWithin', () => {
  it('scales landscape down', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it('scales portrait down', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('never scales up', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('preparePhoto', () => {
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  const origToBlob = HTMLCanvasElement.prototype.toBlob;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (URL as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
    HTMLCanvasElement.prototype.getContext = origGetContext;
    HTMLCanvasElement.prototype.toBlob = origToBlob;
  });

  async function codeOf(p: Promise<unknown>) {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(PhotoError);
      return (e as PhotoError).code;
    }
    return null;
  }

  it('rejects a non-image', async () => {
    const f = new File(['x'], 'a.txt', { type: 'text/plain' });
    expect(await codeOf(preparePhoto(f))).toBe('photo_not_image');
  });

  it('rejects a too-large file', async () => {
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    Object.defineProperty(f, 'size', { value: MAX_PHOTO_BYTES + 1 });
    expect(await codeOf(preparePhoto(f))).toBe('photo_too_large');
  });

  it('reports an undecodable image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    stubImage('fail');
    stubObjectUrls();
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(await codeOf(preparePhoto(f))).toBe('photo_unreadable');
  });

  it('resizes, fills white before drawing, and encodes jpeg', async () => {
    const bitmap = { width: 4032, height: 3024, close: vi.fn() };
    const cib = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', cib);
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) {
        calls.push(`fillStyle=${v}`);
      },
      fillRect: vi.fn(() => calls.push('fillRect')),
      drawImage: vi.fn(() => calls.push('drawImage')),
    };
    let canvas: HTMLCanvasElement | undefined;
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
      canvas = this;
      return ctx;
    }) as never;
    const out = new Blob(['j'], { type: 'image/jpeg' });
    const toBlob = vi.fn((cb: BlobCallback, _type?: string, _q?: number) => cb(out));
    HTMLCanvasElement.prototype.toBlob = toBlob as never;

    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    const res = await preparePhoto(f);

    expect(res).toBe(out);
    expect(cib).toHaveBeenCalledWith(f, { imageOrientation: 'from-image' });
    expect(canvas!.width).toBe(1600);
    expect(canvas!.height).toBe(1200);
    expect(calls[0]).toMatch(/^fillStyle=(#fff|#ffffff)$/);
    expect(calls.indexOf('fillRect')).toBeGreaterThan(-1);
    expect(calls.indexOf('fillRect')).toBeLessThan(calls.indexOf('drawImage'));
    expect(toBlob.mock.calls[0][1]).toBe('image/jpeg');
    expect(toBlob.mock.calls[0][2]).toBe(0.82);
    expect(bitmap.close).toHaveBeenCalled();
  });

  /** A canvas that records its size and what was drawn on it. */
  function stubCanvas() {
    const drawn: unknown[] = [];
    let canvas: HTMLCanvasElement | undefined;
    HTMLCanvasElement.prototype.getContext = vi.fn(function (this: HTMLCanvasElement) {
      canvas = this;
      return { fillRect() {}, drawImage: (src: unknown) => drawn.push(src) };
    }) as never;
    const out = new Blob(['j'], { type: 'image/jpeg' });
    HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) => cb(out)) as never;
    return { out, drawn, size: () => ({ width: canvas!.width, height: canvas!.height }) };
  }

  /** An <img> whose decode() succeeds (with the given size) or fails. */
  function stubImage(result: { width: number; height: number } | 'fail') {
    const images: { src: string }[] = [];
    vi.stubGlobal(
      'Image',
      class {
        src = '';
        naturalWidth = result === 'fail' ? 0 : result.width;
        naturalHeight = result === 'fail' ? 0 : result.height;
        constructor() {
          images.push(this);
        }
        decode() {
          return result === 'fail' ? Promise.reject(new Error('bad')) : Promise.resolve();
        }
      },
    );
    return images;
  }

  /** jsdom has no object URLs: install stand-ins (removed in afterEach). */
  function stubObjectUrls() {
    const revoked: string[] = [];
    URL.createObjectURL = vi.fn(() => 'blob:photo');
    URL.revokeObjectURL = vi.fn((u: string) => void revoked.push(u));
    return revoked;
  }

  it('falls back to an <img> when createImageBitmap refuses the orientation option (iOS 15 and older)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new TypeError('unsupported option')));
    const images = stubImage({ width: 3024, height: 4032 });
    const revoked = stubObjectUrls();
    const c = stubCanvas();

    const res = await preparePhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' }));

    expect(res).toBe(c.out);
    expect(images[0].src).toBe('blob:photo');
    expect(c.drawn[0]).toBe(images[0]);
    expect(c.size()).toEqual({ width: 1200, height: 1600 });
    expect(revoked).toEqual(['blob:photo']);
  });

  it('falls back to an <img> when createImageBitmap does not exist (iOS 14 and older)', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    stubImage({ width: 800, height: 600 });
    stubObjectUrls();
    const c = stubCanvas();

    expect(await preparePhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(c.out);
    expect(c.size()).toEqual({ width: 800, height: 600 });
  });

  it('reports unreadable when neither way can decode it, and frees the object URL', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    stubImage('fail');
    const revoked = stubObjectUrls();
    expect(await codeOf(preparePhoto(new File(['x'], 'a.jpg', { type: 'image/jpeg' })))).toBe('photo_unreadable');
    expect(revoked).toEqual(['blob:photo']);
  });

  it('accepts a photo whose file type is empty (some Android pickers) and lets decoding decide', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close() {} }));
    const c = stubCanvas();
    expect(await preparePhoto(new File(['x'], 'IMG_0001', { type: '' }))).toBe(c.out);
  });

  it('reports a typeless file that is not an image as unreadable', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    stubImage('fail');
    stubObjectUrls();
    expect(await codeOf(preparePhoto(new File(['x'], 'notes', { type: '' })))).toBe('photo_unreadable');
  });

  it('reports a null blob as unreadable', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close() {} }));
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ fillRect() {}, drawImage() {} })) as never;
    HTMLCanvasElement.prototype.toBlob = ((cb: BlobCallback) => cb(null)) as never;
    const f = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(await codeOf(preparePhoto(f))).toBe('photo_unreadable');
  });
});
