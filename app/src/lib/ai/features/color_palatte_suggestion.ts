import { hexToRgb, hsvToHex, rgbToHsv } from "../../color/colorUtils"
import type { StrokeData } from "../../types"

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const colorDistance = (a: string, b: string) => {
    const ca = hexToRgb(a)
    const cb = hexToRgb(b)
    return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b)
}

const generatePaletteSuggestions = async (strokes: StrokeData[]): Promise<string[]> => {
    const used = Array.from(new Set(strokes.map((s) => s.color))).slice(0, 24)
    if (used.length === 0) return []
    await Promise.resolve()
    const hsvSeeds = used.map((hex) => {
      const rgb = hexToRgb(hex)
      return rgbToHsv(rgb.r, rgb.g, rgb.b)
    })
    const generated: string[] = []
    for (let i = 0; i < 10; i += 1) {
      const seed = hsvSeeds[i % hsvSeeds.length]
      const h = (seed.h + 28 * (i + 1)) % 360
      const s = clamp(0.35 + (seed.s + i * 0.07) % 0.55, 0.3, 0.9)
      const v = clamp(0.55 + (seed.v + i * 0.05) % 0.4, 0.45, 0.98)
      generated.push(hsvToHex(h, s, v))
    }
    return generated.filter(
      (color, idx, arr) =>
        arr.indexOf(color) === idx && used.every((u) => colorDistance(u, color) > 24)
    )
  }

export default generatePaletteSuggestions