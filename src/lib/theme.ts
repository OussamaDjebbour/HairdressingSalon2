/**
 * Applies a salon's brand palette as CSS variables (`--brand-50` … `--brand-900`) on the page.
 * The conversion itself lives in brandVars.ts (DOM-free, shared with the edge functions).
 */
import type { Palette } from './palette'
import { paletteToCssVars } from './brandVars'

export { paletteToCssVars }

export function applyPalette(p: Palette, root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(paletteToCssVars(p))) {
    root.style.setProperty(name, value)
  }
}
