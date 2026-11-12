export type ManifestChunk = { file: string; imports?: string[]; isEntry?: boolean; dynamicImports?: string[] };
export function checkPublicBundle(
  manifest: Record<string, ManifestChunk>,
  sizes: Record<string, number>,
  baselineKB: number,
): { ok: boolean; entryKB: number; reasons: string[] };
