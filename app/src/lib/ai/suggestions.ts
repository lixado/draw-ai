import getStroke from 'perfect-freehand'
import type { BrushStyle, StrokeData } from '../types'
import { prewarmParameterGenerationModel } from './techniques/parameterGeneration'
import { suggestionEngine } from './engine/suggestionEngine'

export type RedoSuggestion = {
  id: string
  previewUrl: string
  strokes: StrokeData[]
}

type SuggestionResult = {
  modelStatus: 'idle' | 'ready'
  suggestions: RedoSuggestion[]
}

type SuggestionStreamHandlers = {
  onSuggestion: (suggestion: RedoSuggestion) => void | Promise<void>
}

const getPathFromStroke = (points: number[][]) => {
  if (!points.length) return ''
  const [first, ...rest] = points
  return rest
    .reduce((acc: string[], [x, y], i, arr) => {
      const [nextX, nextY] = arr[(i + 1) % arr.length]
      acc.push(`Q${x},${y} ${(x + nextX) / 2},${(y + nextY) / 2}`)
      return acc
    }, [`M${first[0]},${first[1]}`])
    .join(' ')
}

const brushStyleOptions: Record<BrushStyle, Parameters<typeof getStroke>[1]> = {
  pencil: {
    thinning: 0.85,
    smoothing: 0.45,
    streamline: 0.2,
    simulatePressure: true
  },
  ink: {
    thinning: 0.65,
    smoothing: 0.65,
    streamline: 0.4,
    simulatePressure: false
  },
  marker: {
    thinning: 0.2,
    smoothing: 0.8,
    streamline: 0.55,
    simulatePressure: false
  },
  airbrush: {
    thinning: 0.1,
    smoothing: 0.9,
    streamline: 0.65,
    simulatePressure: true
  },
  calligraphy: {
    thinning: 0.95,
    smoothing: 0.45,
    streamline: 0.25,
    simulatePressure: false
  },
  watercolor: {
    thinning: 0.4,
    smoothing: 0.85,
    streamline: 0.5,
    simulatePressure: true
  },
  charcoal: {
    thinning: 0.75,
    smoothing: 0.35,
    streamline: 0.15,
    simulatePressure: true
  },
  neon: {
    thinning: 0.55,
    smoothing: 0.7,
    streamline: 0.5,
    simulatePressure: false
  },
  pixel: {
    thinning: 0,
    smoothing: 0,
    streamline: 0,
    simulatePressure: false
  },
  ribbon: {
    thinning: 0.8,
    smoothing: 0.78,
    streamline: 0.68,
    simulatePressure: true
  }
}

const drawStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: StrokeData,
  colorOverride?: string,
  alpha = 1
) => {
  const style = stroke.style ?? 'ink'
  const options = brushStyleOptions[style] ?? brushStyleOptions.ink
  const outline = getStroke(stroke.points, {
    size: stroke.size,
    ...options
  })

  const pathData = getPathFromStroke(outline as unknown as number[][])
  if (!pathData) return

  const p = new Path2D(pathData)
  ctx.save()
  if (stroke.mode === 'erase') {
    ctx.globalCompositeOperation = 'destination-out'
    ctx.globalAlpha = alpha
    ctx.fillStyle = '#000000'
    ctx.fill(p)
  } else {
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = alpha
    ctx.fillStyle = colorOverride ?? stroke.color
    ctx.fill(p)
  }
  ctx.restore()
}

const normalizeStrokeSet = (strokes: StrokeData[], width: number, height: number): StrokeData[] => {
  if (!strokes.length) return []
  const allPoints = strokes.flatMap((stroke) => stroke.points)
  const xs = allPoints.map((p) => p[0])
  const ys = allPoints.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const pad = 14
  const rectW = Math.max(1, maxX - minX)
  const rectH = Math.max(1, maxY - minY)
  const scale = Math.min((width - pad * 2) / rectW, (height - pad * 2) / rectH)

  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map(([x, y, pressure]) => [
      (x - minX) * scale + pad,
      (y - minY) * scale + pad,
      pressure
    ])
  }))
}

const renderOverlayPreview = (
  currentStrokes: StrokeData[],
  suggestionStrokes: StrokeData[],
  width: number,
  height: number
): string => {
  if (typeof document === 'undefined') return ''

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const all = [...currentStrokes, ...suggestionStrokes]
  if (!all.length) return ''
  const normalized = normalizeStrokeSet(all, width, height)
  const baseCount = currentStrokes.length
  const base = normalized.slice(0, baseCount)
  const overlay = normalized.slice(baseCount)

  for (const stroke of base) {
    const alpha = 0.32 * (typeof stroke.opacity === 'number' ? stroke.opacity : 1)
    drawStroke(ctx, stroke, '#111827', alpha)
  }
  for (const stroke of overlay) {
    const alpha = typeof stroke.opacity === 'number' ? stroke.opacity : 1
    drawStroke(ctx, stroke, '#2563eb', alpha)
  }

  ctx.strokeStyle = '#e2e8f0'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
  return canvas.toDataURL('image/png')
}

export const generateUndoSuggestions = async (
  undoneStrokes: StrokeData[],
  currentStrokes: StrokeData[]
): Promise<SuggestionResult> => {
  if (undoneStrokes.length === 0) {
    return { modelStatus: 'ready', suggestions: [] }
  }
  const generated = await suggestionEngine.generateBatch({ currentStrokes, undoneStrokes }, 3)

  const suggestions: RedoSuggestion[] = generated
    .filter((result) => result.strokes.length > 0)
    .map((result) => {
      const previewUrl = renderOverlayPreview(currentStrokes, result.strokes, 280, 156)
      return { id: crypto.randomUUID(), previewUrl, strokes: result.strokes }
    })

  return {
    modelStatus: 'ready',
    suggestions
  }
}

export const generateUndoSuggestionsStream = async (
  undoneStrokes: StrokeData[],
  currentStrokes: StrokeData[],
  handlers: SuggestionStreamHandlers
): Promise<SuggestionResult> => {
  if (undoneStrokes.length === 0) {
    return { modelStatus: 'ready', suggestions: [] }
  }

  const total = 3
  const suggestions: RedoSuggestion[] = []
  await suggestionEngine.generateStream(
    { currentStrokes, undoneStrokes },
    total,
    async (result) => {
    if (result.strokes.length === 0 || result.source !== 'model') {
      console.log(`[drawAi:suggestions] #${result.index + 1}/${result.total} ${result.modelId} failed (no suggestion)`)
      return
    }
    console.log(`[drawAi:suggestions] #${result.index + 1}/${result.total} ${result.modelId} model`)
    const suggestion: RedoSuggestion = {
      id: crypto.randomUUID(),
      previewUrl: renderOverlayPreview(currentStrokes, result.strokes, 280, 156),
      strokes: result.strokes
    }
    suggestions.push(suggestion)
    await handlers.onSuggestion(suggestion)
    }
  )

  return {
    modelStatus: 'ready',
    suggestions
  }
}

export const prewarmSuggestionModel = async (): Promise<void> => {
  await prewarmParameterGenerationModel()
}
