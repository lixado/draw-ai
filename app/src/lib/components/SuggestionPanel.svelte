<script lang="ts">
  import { createEventDispatcher } from 'svelte'
  import { Bot, LoaderCircle, Square } from 'lucide-svelte'
  import getStroke from 'perfect-freehand'
  import type { BrushStyle, StrokeData } from '../types'
  import type { RedoSuggestion } from '../ai/features/redo_suggestion'

  export let suggestions: RedoSuggestion[] = []
  export let currentStrokes: StrokeData[] = []
  export let loadingSuggestions = false
  export let modelStatus = 'idle'

  const dispatch = createEventDispatcher<{ pick: RedoSuggestion; stop: void }>()

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
    pencil: { thinning: 0.85, smoothing: 0.45, streamline: 0.2, simulatePressure: true },
    ink: { thinning: 0.65, smoothing: 0.65, streamline: 0.4, simulatePressure: false },
    marker: { thinning: 0.2, smoothing: 0.8, streamline: 0.55, simulatePressure: false },
    airbrush: { thinning: 0.1, smoothing: 0.9, streamline: 0.65, simulatePressure: true },
    calligraphy: { thinning: 0.95, smoothing: 0.45, streamline: 0.25, simulatePressure: false },
    watercolor: { thinning: 0.4, smoothing: 0.85, streamline: 0.5, simulatePressure: true },
    charcoal: { thinning: 0.75, smoothing: 0.35, streamline: 0.15, simulatePressure: true },
    neon: { thinning: 0.55, smoothing: 0.7, streamline: 0.5, simulatePressure: false },
    pixel: { thinning: 0, smoothing: 0, streamline: 0, simulatePressure: false },
    ribbon: { thinning: 0.8, smoothing: 0.78, streamline: 0.68, simulatePressure: true }
  }

  const drawStroke = (
    ctx: CanvasRenderingContext2D,
    stroke: StrokeData,
    colorOverride?: string,
    alpha = 1
  ) => {
    const style = stroke.style ?? 'ink'
    const options = brushStyleOptions[style] ?? brushStyleOptions.ink
    const outline = getStroke(stroke.points, { size: stroke.size, ...options })
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
      points: stroke.points.map(([x, y, pressure]) => [(x - minX) * scale + pad, (y - minY) * scale + pad, pressure])
    }))
  }

  const renderOverlayPreview = (
    baseStrokes: StrokeData[],
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

    const all = [...baseStrokes, ...suggestionStrokes]
    if (!all.length) return ''
    const normalized = normalizeStrokeSet(all, width, height)
    const baseCount = baseStrokes.length
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
</script>

<aside class="panel">
  <header>
    <h2><Bot size={14} /> Redo</h2>
    {#if loadingSuggestions}
      <div class="status-row">
        <span class="spin"><LoaderCircle size={14} /></span>
        <button class="stop-btn" type="button" onclick={() => dispatch('stop')} aria-label="Stop generation">
          <Square size={11} />
        </button>
      </div>
    {:else}
      <span>{modelStatus === 'idle' ? 'ready' : modelStatus}</span>
    {/if}
  </header>
  {#if suggestions.length === 0}
    {#if loadingSuggestions}
      <p class="hint">Preparing redo options...</p>
    {:else}
      <p class="hint">Undo a stroke to get 3 options.</p>
    {/if}
  {:else}
    <div class="grid" role="list">
      {#each suggestions as suggestion (suggestion.id)}
        <button class="tile" type="button" onclick={() => dispatch('pick', suggestion)}>
          <img
            class="thumb"
            src={renderOverlayPreview(currentStrokes, suggestion.strokes, 280, 156)}
            alt=""
          />
        </button>
      {/each}
    </div>
    {#if loadingSuggestions}
      <p class="hint">Generating more options...</p>
    {/if}
  {/if}
</aside>

<style>
  .panel {
    background: #ffffff;
    border: 1px solid #dbe5f0;
    border-radius: 14px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  h2 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 0.96rem;
  }

  .status-row {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .spin {
    animation: spin 1s linear infinite;
  }

  .stop-btn {
    width: 20px;
    height: 20px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #334155;
  }

  header span {
    font-size: 0.75rem;
    color: #64748b;
    text-transform: capitalize;
  }

  .hint {
    color: #64748b;
    font-size: 0.86rem;
  }

  .grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tile {
    border: 1px solid #dbe5f0;
    background: #f8fafc;
    border-radius: 12px;
    padding: 0;
    overflow: hidden;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    aspect-ratio: 16 / 9;
  }

  .tile:active {
    transform: translateY(1px);
  }

  .thumb {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
    pointer-events: none;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
