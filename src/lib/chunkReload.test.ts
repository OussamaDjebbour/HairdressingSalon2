import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS, installChunkReload, onPreloadError } from './chunkReload';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

describe('onPreloadError', () => {
  let storage: Storage;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('reloads once on the first failed chunk and records it', () => {
    const reload = vi.fn();
    const event = { preventDefault: vi.fn() };
    onPreloadError(event, { storage, reload, now: () => 1000 });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(storage.getItem(CHUNK_RELOAD_KEY)).toBe('1000');
  });

  it('does not reload again right after a reload (no loop when the chunk is really gone)', () => {
    const reload = vi.fn();
    storage.setItem(CHUNK_RELOAD_KEY, '1000');
    const event = { preventDefault: vi.fn() };
    onPreloadError(event, { storage, reload, now: () => 1000 + 5_000 });
    expect(reload).not.toHaveBeenCalled();
    // the error is left to surface instead of being swallowed
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('reloads again for a later deploy, once the earlier reload is old', () => {
    const reload = vi.fn();
    storage.setItem(CHUNK_RELOAD_KEY, '1000');
    onPreloadError({ preventDefault: vi.fn() }, { storage, reload, now: () => 1000 + CHUNK_RELOAD_WINDOW_MS + 1 });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when it cannot remember the reload (would loop)', () => {
    const reload = vi.fn();
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error('blocked');
    };
    broken.setItem = () => {
      throw new Error('blocked');
    };
    onPreloadError({ preventDefault: vi.fn() }, { storage: broken, reload, now: () => 1 });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('installChunkReload', () => {
  it('reloads the page when Vite reports a failed chunk, once', () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const win = Object.assign(target, { sessionStorage: memoryStorage(), location: { reload } }) as unknown as Window;
    installChunkReload(win);
    const first = new Event('vite:preloadError', { cancelable: true });
    win.dispatchEvent(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);
    win.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
