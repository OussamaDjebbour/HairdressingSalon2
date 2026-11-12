/**
 * A salon's brand palette as CSS variables (`--brand-50` … `--brand-900`, space-separated RGB
 * channels) read by the `rose` scale in tailwind.config.js. Dependency-free and DOM-free:
 * also used by the Cloudflare edge functions to inline the colours in the page head.
 */
import type { Palette } from './palette'

const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const

export function paletteToCssVars(p: Palette): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const step of STEPS) {
    const hex = p[step].replace('#', '')
    const n = parseInt(hex, 16)
    vars[`--brand-${step}`] = `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
  }
  return vars
}
