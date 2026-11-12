/**
 * After a deploy, a tab opened before it asks for the old hashed chunks (admin, settings), which no
 * longer exist: the lazy route fails and the screen goes blank. Vite fires `vite:preloadError` then;
 * we reload once so the tab picks up the new build.
 *
 * The time of the reload is kept in sessionStorage: another failure shortly after it means the chunk
 * is really missing, so we stop there instead of reloading forever. Once that window has passed (the
 * reloaded page worked), a later deploy can reload the tab again.
 */
export const CHUNK_RELOAD_KEY = 'chunk-reload';
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

interface Deps {
  storage: Storage;
  reload(): void;
  now(): number;
}

export function onPreloadError(event: { preventDefault(): void }, { storage, reload, now }: Deps): void {
  try {
    const last = Number(storage.getItem(CHUNK_RELOAD_KEY));
    if (last && now() - last < CHUNK_RELOAD_WINDOW_MS) return;
    storage.setItem(CHUNK_RELOAD_KEY, String(now()));
  } catch {
    return; // can't remember the reload: reloading could loop
  }
  event.preventDefault();
  reload();
}

export function installChunkReload(win: Window = window): void {
  win.addEventListener('vite:preloadError', (event) => {
    let storage: Storage;
    try {
      storage = win.sessionStorage; // reading it can throw when site data is blocked
    } catch {
      return;
    }
    onPreloadError(event, { storage, reload: () => win.location.reload(), now: () => Date.now() });
  });
}
