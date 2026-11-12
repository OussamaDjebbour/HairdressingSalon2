import { describe, expect, it } from 'vitest'
import type { Palette } from './palette'
import cfg from '../../tailwind.config.js?raw'
import { applyPalette, paletteToCssVars } from './theme'

const ELEGANCE: Palette = {
  '50': '#FBF1F3', '100': '#F7E0E5', '200': '#EFC1CC', '300': '#E29FB1', '400': '#D17D93',
  '500': '#B85F76', '600': '#9D4B5F', '700': '#7E3B4C', '800': '#5F2D3A', '900': '#421F28',
}
// Vitest stubs CSS imports (even ?raw) to '', and @types/node is not installed,
// so read index.css through node:fs without type information.
// @ts-ignore no node types in this project
const { readFileSync } = (await import('node:fs')) as { readFileSync: (p: string, e: string) => string }
const css = readFileSync('src/index.css', 'utf8')
const STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']

describe('theme', () => {
  it('converts a palette to space-separated channel strings', () => {
    const vars = paletteToCssVars(ELEGANCE)
    expect(Object.keys(vars)).toHaveLength(10)
    expect(vars['--brand-50']).toBe('251 241 243')
    expect(vars['--brand-600']).toBe('157 75 95')
    expect(vars['--brand-900']).toBe('66 31 40')
  })

  it('matches the :root defaults in index.css', () => {
    for (const [name, value] of Object.entries(paletteToCssVars(ELEGANCE))) {
      expect(css).toContain(`${name}: ${value};`)
    }
  })

  it('applyPalette sets the variables on the element', () => {
    const el = document.createElement('div')
    applyPalette(ELEGANCE, el)
    expect(el.style.getPropertyValue('--brand-800')).toBe('95 45 58')
  })

  it('tailwind rose scale reads every step from a brand variable', () => {
    for (const s of STEPS) {
      expect(cfg).toContain(`${s}: 'rgb(var(--brand-${s}) / <alpha-value>)'`)
    }
  })
})
