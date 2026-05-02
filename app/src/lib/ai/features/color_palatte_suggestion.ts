import { getActiveProvider } from '../providers/activeProvider'
import type { StrokeData } from '../../types'

const MAX_INPUT_COLORS = 40
const MAX_PALETTE_COLORS = 12

const PALETTE_SYSTEM_PROMPT = `You are a color palette assistant for a digital painting app.

Your job: given a list of hex colors the user already painted with, propose one harmonious palette that complements them (accents, shadows, highlights, or new strokes). The palette must feel cohesive with the canvas.

Rules:
- Output ONLY a comma-separated list of hex colors in the form #RRGGBB (or #RGB).
- No labels, no markdown, no code fences, no explanation, no other text.`

const normalizeHexToken = (raw: string): string | null => {
  const s = raw.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{3}$/.test(s) && !/^[0-9a-fA-F]{6}$/.test(s)) return null
  const full =
    s.length === 3 ? [...s].map((c) => c + c).join('') : s.toLowerCase()
  return `#${full}`
}

const extractHexColorsFromText = (text: string): string[] => {
  const matches = text.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) ?? []
  return matches
    .map((token) => normalizeHexToken(token))
    .filter((hex): hex is string => hex !== null)
}

const buildPaletteUserPrompt = (colorsCsv: string) =>
  `These are the CSS hex colors already used in the user's strokes (up to ${MAX_INPUT_COLORS} unique colors, comma-separated):

${colorsCsv}

Propose a single harmonious palette of exactly ${MAX_PALETTE_COLORS} colors that fits and complements the above.`

const generatePaletteSuggestions = async (
  strokes: StrokeData[]
): Promise<string[]> => {
  const used = Array.from(new Set(strokes.map((s) => s.color)))
    .slice(0, MAX_INPUT_COLORS)
    .map((c) => normalizeHexToken(c))
    .filter((c): c is string => !!c)

  if (used.length === 0) return []

  const provider = getActiveProvider()
  if (!provider) return []

  const colorsCsv = used.join(', ')
  const userPrompt = buildPaletteUserPrompt(colorsCsv)

  const raw = await provider.generate(PALETTE_SYSTEM_PROMPT, userPrompt, {
    maxNewTokens: 256
  })
  if (!raw || !raw.trim()) return []

  const parsed = extractHexColorsFromText(raw)
  const seen = new Set<string>()
  const unique: string[] = []
  for (const hex of parsed) {
    const key = hex.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(hex)
    if (unique.length >= MAX_PALETTE_COLORS) break
  }

  return unique
}

export default generatePaletteSuggestions
