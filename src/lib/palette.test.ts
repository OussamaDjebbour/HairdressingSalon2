import { describe, expect, it } from 'vitest'
import { CREAM_50, contrastRatio, generatePalette, isHexColor, type Palette } from './palette'

const KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'] as const
const lum = (hex: string) => contrastRatio(hex, '#000000')

function readable(p: Palette) {
  for (const k of ['600', '700', '800'] as const) {
    expect(contrastRatio('#FFFFFF', p[k])).toBeGreaterThanOrEqual(4.5)
  }
  for (const k of ['800', '900'] as const) {
    expect(contrastRatio(p[k], CREAM_50)).toBeGreaterThanOrEqual(4.5)
  }
}

describe('palette', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#fff', '#fff')).toBeCloseTo(1, 5)
  })

  it('validates hex colours', () => {
    expect(isHexColor('#9D4B5F')).toBe(true)
    expect(isHexColor('#9d4b5f')).toBe(true)
    expect(isHexColor('9D4B5F')).toBe(false)
    expect(isHexColor('#FFF')).toBe(false)
    expect(isHexColor('red')).toBe(false)
  })

  it('keeps a readable base as 600, monotonic, uppercase, no warnings', () => {
    const { palette, warnings } = generatePalette('#9D4B5F')
    expect(palette['600']).toBe('#9D4B5F')
    expect(warnings).toEqual([])
    expect(Object.keys(palette)).toEqual([...KEYS])
    for (const k of KEYS) expect(palette[k]).toMatch(/^#[0-9A-F]{6}$/)
    for (let i = 1; i < KEYS.length; i++) {
      expect(lum(palette[KEYS[i - 1]])).toBeGreaterThan(lum(palette[KEYS[i]]))
    }
    readable(palette)
  })

  it.each(['#F2E205', '#7FFFD4'])('fixes unreadable base %s with warnings', (base) => {
    const { palette, warnings } = generatePalette(base)
    readable(palette)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('600')
    for (let i = 1; i < KEYS.length; i++) {
      expect(lum(palette[KEYS[i - 1]])).toBeGreaterThan(lum(palette[KEYS[i]]))
    }
  })

  it('throws on invalid input', () => {
    expect(() => generatePalette('nope')).toThrow()
    expect(() => generatePalette('#12345')).toThrow()
  })
})
