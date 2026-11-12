/**
 * Brand palette generation. Pure TypeScript, zero dependencies: shared by the
 * browser app, the Cloudflare edge function and the Node provisioning script.
 *
 * Colour space: OKLab / OKLCH (Björn Ottosson). Lighter shades (50-500) mix the
 * base toward white and darker shades (700-900) toward black by interpolating
 * in OKLab, which keeps hue stable; out-of-gamut results have their chroma
 * reduced (hue and lightness kept) until they fit sRGB. The base becomes `600`.
 *
 * Readability rule (WCAG AA, 4.5:1): white text on 600/700/800 and 800/900 text
 * on cream-50. A failing shade is darkened in small OKLCH lightness steps until
 * it passes, and a warning naming the shade and the check is returned.
 * Output is uppercase `#RRGGBB` under the keys "50"..."900" (as stored in the DB).
 */

export type Palette = Record<
  '50' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900',
  string
>
type Key = keyof Palette

export const CREAM_50 = '#FDFBF8'

const KEYS: Key[] = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
const HEX_RE = /^#[0-9a-fA-F]{6}$/
const LIGHTNESS_STEP = 0.01
const AA = 4.5

export function isHexColor(s: string): boolean {
  return typeof s === 'string' && HEX_RE.test(s)
}

type RGB = [number, number, number] // 0-255
type Lab = [number, number, number]

function parseHex(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(rgb: RGB): string {
  return (
    '#' +
    rgb
      .map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

const toLinear = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) =>
  255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(fg: string, bg: string): number {
  const norm = (h: string) => (/^#[0-9a-fA-F]{3}$/.test(h) ? '#' + [...h.slice(1)].map((c) => c + c).join('') : h)
  const a = relativeLuminance(norm(fg))
  const b = relativeLuminance(norm(bg))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function rgbToOklab(rgb: RGB): Lab {
  const [r, g, b] = rgb.map(toLinear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** Linear sRGB, unclamped. */
function oklabToLinear([L, a, b]: Lab): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLCH -> hex, reducing chroma until the colour fits sRGB. */
function lchToHex(L: number, C: number, h: number): string {
  L = Math.min(1, Math.max(0, L))
  const inGamut = (c: number) => {
    const lin = oklabToLinear([L, c * Math.cos(h), c * Math.sin(h)])
    return lin.every((v) => v >= -0.0005 && v <= 1.0005)
  }
  let c = C
  if (!inGamut(c)) {
    let lo = 0
    let hi = C
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(mid)) lo = mid
      else hi = mid
    }
    c = lo
  }
  const lin = oklabToLinear([L, c * Math.cos(h), c * Math.sin(h)])
  return toHex(lin.map(fromLinear) as RGB)
}

const toLch = (hex: string) => {
  const [L, a, b] = rgbToOklab(parseHex(hex))
  return { L, C: Math.hypot(a, b), h: Math.atan2(b, a) }
}

/** Mix base toward white (t>0 amount) in OKLab, return hex. */
function mixHex(base: string, target: Lab, t: number): string {
  const lab = rgbToOklab(parseHex(base))
  const mixed = lab.map((v, i) => v + (target[i] - v) * t) as Lab
  return lchToHex(mixed[0], Math.hypot(mixed[1], mixed[2]), Math.atan2(mixed[2], mixed[1]))
}

const WHITE: Lab = [1, 0, 0]
const BLACK: Lab = [0, 0, 0]
const LIGHT_MIX: Record<string, number> = { '50': 0.92, '100': 0.82, '200': 0.64, '300': 0.46, '400': 0.28, '500': 0.12 }
const DARK_MIX: Record<string, number> = { '700': 0.2, '800': 0.4, '900': 0.6 }

type Check = { key: Key; label: string; ok: (hex: string) => boolean }
const CHECKS: Check[] = [
  ...(['600', '700', '800'] as Key[]).map((key) => ({
    key,
    label: `white text on ${key}`,
    ok: (hex: string) => contrastRatio('#FFFFFF', hex) >= AA,
  })),
  ...(['800', '900'] as Key[]).map((key) => ({
    key,
    label: `${key} text on cream-50`,
    ok: (hex: string) => contrastRatio(hex, CREAM_50) >= AA,
  })),
]

/** Darken `hex` in small OKLCH lightness steps until `ok` passes. */
function darkenUntil(hex: string, ok: (h: string) => boolean): string {
  const { L, C, h } = toLch(hex)
  let l = L
  let out = hex
  while (!ok(out) && l > 0) {
    l -= LIGHTNESS_STEP
    out = lchToHex(l, C, h)
  }
  return out
}

export function generatePalette(base: string): { palette: Palette; warnings: string[] } {
  if (!isHexColor(base)) throw new Error(`Invalid hex colour "${base}" (expected #RRGGBB)`)
  const warnings: string[] = []
  const p = {} as Record<Key, string>
  p['600'] = base.toUpperCase()

  // Fix 600 first so every other shade derives from a readable base.
  for (const c of CHECKS.filter((c) => c.key === '600')) {
    if (!c.ok(p['600'])) {
      p['600'] = darkenUntil(p['600'], c.ok)
      warnings.push(`Shade 600 darkened to ${p['600']}: failed ${c.label} (AA 4.5:1)`)
    }
  }

  for (const [k, t] of Object.entries(LIGHT_MIX)) p[k as Key] = mixHex(p['600'], WHITE, t)
  for (const [k, t] of Object.entries(DARK_MIX)) p[k as Key] = mixHex(p['600'], BLACK, t)

  for (const c of CHECKS) {
    if (c.key === '600' || c.ok(p[c.key])) continue
    p[c.key] = darkenUntil(p[c.key], c.ok)
    warnings.push(`Shade ${c.key} darkened to ${p[c.key]}: failed ${c.label} (AA 4.5:1)`)
  }

  // Keep the scale strictly darker step by step (darkening may have reordered it).
  for (let i = 1; i < KEYS.length; i++) {
    const prev = relativeLuminance(p[KEYS[i - 1]])
    if (relativeLuminance(p[KEYS[i]]) >= prev) {
      p[KEYS[i]] = darkenUntil(p[KEYS[i]], (h) => relativeLuminance(h) < prev)
    }
  }

  return { palette: p, warnings }
}
