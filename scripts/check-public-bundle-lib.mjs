// Pure core of the public-bundle check (kept separate so Vitest can import it).
const MAX_GROWTH_KB = 30;

/**
 * manifest: Vite's manifest.json. sizes: gzip bytes per emitted file (manifest `file`).
 * Returns the entry closure's gzip KB (entry + static imports) and whether the gate passes.
 */
export function checkPublicBundle(manifest, sizes, baselineKB) {
  const reasons = [];
  const seen = new Set();
  const entries = Object.keys(manifest).filter((k) => manifest[k].isEntry);
  const stack = [...entries];
  while (stack.length) {
    const key = stack.pop();
    if (seen.has(key)) continue;
    seen.add(key);
    for (const dep of manifest[key]?.imports ?? []) stack.push(dep);
  }
  let bytes = 0;
  for (const key of seen) {
    const chunk = manifest[key];
    if (!chunk) continue;
    bytes += sizes[chunk.file] ?? 0;
    if (chunk.file.includes('admin-ui')) {
      reasons.push(`the public entry statically imports the admin-ui chunk (${chunk.file})`);
    }
  }
  const entryKB = bytes / 1024;
  if (entryKB > baselineKB + MAX_GROWTH_KB) {
    reasons.push(
      `entry closure is ${entryKB.toFixed(1)} KB gzip, more than ${MAX_GROWTH_KB} KB over the baseline (${baselineKB} KB)`,
    );
  }
  return { ok: reasons.length === 0, entryKB, reasons };
}
