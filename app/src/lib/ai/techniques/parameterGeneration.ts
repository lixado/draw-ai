import type { StrokeData } from '../../types'
import {
  generateParameterCandidate,
  prewarmParameterProvider,
  type ParameterCandidate
} from '../parameterProvider'

type ParamSchema = {
  strokeCount: number
  offsetX: number
  offsetY: number
  waveAmp: number
  mirrorAxis: 'none' | 'vertical' | 'horizontal'
  scale: number
}

export type ParameterSuggestionResult = {
  strokes: StrokeData[]
  source: 'model' | 'failed'
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

const normalizeCandidateParams = (
  candidate: ParameterCandidate | null,
  maxStrokeCount: number
): ParamSchema | null => {
  if (!candidate) return null
  const axis =
    candidate.mirrorAxis === 'vertical' ||
    candidate.mirrorAxis === 'horizontal' ||
    candidate.mirrorAxis === 'none'
      ? candidate.mirrorAxis
      : 'none'
  return {
    strokeCount: Math.round(clamp(Number(candidate.strokeCount ?? 1), 1, maxStrokeCount)),
    offsetX: clamp(Number(candidate.offsetX ?? 0), -80, 80),
    offsetY: clamp(Number(candidate.offsetY ?? 0), -80, 80),
    waveAmp: clamp(Number(candidate.waveAmp ?? 8), 0, 28),
    mirrorAxis: axis,
    scale: clamp(Number(candidate.scale ?? 1), 0.6, 1.7)
  }
}

const applyParamsToStroke = (stroke: StrokeData, params: ParamSchema): StrokeData => {
  const xs = stroke.points.map((p) => p[0])
  const ys = stroke.points.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2

  const points = stroke.points.map(([x, y, pressure], idx) => {
    let rx = x - cx
    let ry = y - cy
    if (params.mirrorAxis === 'vertical') rx = -rx
    if (params.mirrorAxis === 'horizontal') ry = -ry
    const nx = cx + rx * params.scale + params.offsetX
    const ny = cy + ry * params.scale + params.offsetY + Math.sin(idx / 2) * params.waveAmp
    return [nx, ny, pressure] as [number, number, number]
  })

  return {
    ...stroke,
    id: crypto.randomUUID(),
    points
  }
}

export const prewarmParameterGenerationModel = async (): Promise<void> => {
  await prewarmParameterProvider()
}

// Technique #3: model-generated numeric parameters -> deterministic stroke transform.
export const generateParameterSuggestionStrokes = async (
  allStrokes: StrokeData[],
  undoneStrokes: StrokeData[]
): Promise<ParameterSuggestionResult> => {
  if (undoneStrokes.length === 0) return { strokes: [], source: 'failed' }
  const maxStrokeCount = Math.min(undoneStrokes.length, 6)

  const candidate = await generateParameterCandidate({
    totalStrokes: allStrokes.length,
    undoneCount: undoneStrokes.length,
    maxStrokeCount
  })
  const parsed = normalizeCandidateParams(candidate, maxStrokeCount)
  if (!parsed) {
    return { strokes: [], source: 'failed' }
  }

  const selected = undoneStrokes.slice(0, parsed.strokeCount)
  return {
    strokes: selected.map((stroke) => applyParamsToStroke(stroke, parsed)),
    source: 'model'
  }
}

