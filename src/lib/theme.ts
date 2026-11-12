/**
 * Applies a salon's brand palette as CSS variables (`--brand-50` … `--brand-900`,
 * space-separated RGB channels) read by the `rose` scale in tailwind.config.js.
 * Dependency-free: also reused by the Cloudflare edge function.
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

export function applyPalette(p: Palette, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(paletteToCssVars(p))) {
    root.style.setProperty(name, value)
  }
}
