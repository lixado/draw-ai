<script lang="ts">
  import getStroke from 'perfect-freehand'
  import { onMount } from 'svelte'
  import {
    Brush,
    Feather,
    Highlighter,
    Paintbrush,
    PenLine,
    Pencil,
    Sparkles,
    SprayCan,
    Square,
    Waves
  } from 'lucide-svelte'
  import type { BrushStyle } from '../types'

  export let value: BrushStyle
  export let open = false
  export let options: Array<{ id: BrushStyle; label: string }> = []

  export let onToggle: () => void
  export let onPick: (id: BrushStyle) => void

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

  const toPath = (points: number[][]) => {
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

  const sampleLine = [
    [8, 30, 0.35],
    [22, 12, 0.5],
    [36, 34, 0.3],
    [50, 16, 0.7],
    [64, 36, 0.3],
    [78, 18, 0.65],
    [92, 30, 0.4]
  ] as [number, number, number][]

  let previewMap: Record<string, string> = {}
  const brushIconMap: Record<BrushStyle, typeof Pencil> = {
    pencil: Pencil,
    ink: PenLine,
    marker: Highlighter,
    airbrush: SprayCan,
    calligraphy: Feather,
    watercolor: Waves,
    charcoal: Brush,
    neon: Sparkles,
    pixel: Square,
    ribbon: Paintbrush
  }
  const buildPreview = (id: BrushStyle) => {
    if (typeof document === 'undefined') return ''
    const c = document.createElement('canvas')
    c.width = 100
    c.height = 42
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, c.width, c.height)
    const outline = getStroke(sampleLine, { size: 9, ...brushStyleOptions[id] })
    const path = toPath(outline as unknown as number[][])
    if (path) {
      ctx.fillStyle = '#0f172a'
      ctx.fill(new Path2D(path))
    }
    return c.toDataURL('image/png')
  }

  onMount(() => {
    previewMap = options.reduce(
      (acc, option) => ({ ...acc, [option.id]: buildPreview(option.id) }),
      {} as Record<string, string>
    )
  })
</script>

<div class="picker brush-picker">
  <button type="button" class="brush-swatch" aria-label="Selected brush style" aria-expanded={open} onclick={onToggle}>
    <Paintbrush size={16} />
  </button>

  {#if open}
    <div class="brush-dropdown" role="menu" aria-label="Choose brush">
      <div class="brush-styles" role="list">
        {#each options as option}
          {@const BrushIcon = brushIconMap[option.id] ?? Paintbrush}
          <button
            type="button"
            class="brush-style-btn"
            aria-label={`Brush style ${option.label}`}
            onclick={() => onPick(option.id)}
            aria-pressed={value === option.id}
          >
            <span class="brush-icon"><BrushIcon size={14} /></span>
            <img class="brush-preview-img" src={previewMap[option.id]} alt="" />
            <span>{option.label}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .brush-style-btn {
    height: auto;
    min-height: 54px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brush-icon {
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #334155;
    flex: 0 0 auto;
  }

  .brush-preview-img {
    width: 100px;
    height: 42px;
    object-fit: contain;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: #fff;
    flex: 0 0 auto;
  }
</style>
