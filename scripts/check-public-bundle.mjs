// Run after `pnpm build`: fails if the public entry pulls in admin-ui or grew > 30 KB gzip.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { checkPublicBundle } from './check-public-bundle-lib.mjs';

const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
const { entryGzipKB } = JSON.parse(readFileSync('scripts/public-bundle-baseline.json', 'utf8'));
const sizes = {};
for (const chunk of Object.values(manifest)) {
  if (chunk.file.endsWith('.js')) sizes[chunk.file] = gzipSync(readFileSync(`dist/${chunk.file}`)).length;
}
const result = checkPublicBundle(manifest, sizes, entryGzipKB);
console.log(`Public entry closure: ${result.entryKB.toFixed(1)} KB gzip (baseline ${entryGzipKB} KB, limit +30 KB)`);
if (!result.ok) {
  for (const r of result.reasons) console.error(`FAIL: ${r}`);
  process.exit(1);
}
console.log('OK');
