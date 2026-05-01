<script context="module" lang="ts">
  export const canvasPresets = [
    { id: 'infinite', label: 'Infinite', width: 0, height: 0 },
    { id: '1024x1024', label: '1024 x 1024', width: 1024, height: 1024 },
    { id: '1536x1536', label: '1536 x 1536', width: 1536, height: 1536 },
    { id: '2048x1536', label: '2048 x 1536', width: 2048, height: 1536 },
    { id: '2732x2048', label: '2732 x 2048', width: 2732, height: 2048 }
  ] as const

  export type CanvasPreset = (typeof canvasPresets)[number]
  export type CanvasPresetId = CanvasPreset['id']
</script>

<script lang="ts">
  import { Infinity as InfinityIcon, Ruler } from 'lucide-svelte'
  import DropDown from './DropDown.svelte'
  import type { LayerData, StrokeData } from '../../types'

  export let open = false
  export let onToggle: () => void
  export let rootEl: HTMLDivElement | null = null
  export let strokes: StrokeData[] = []
  export let undoneStack: StrokeData[] = []
  export let undoneContext: StrokeData[] = []
  export let clearUndoSnapshot:
    | {
        strokes: StrokeData[]
        layers: LayerData[]
        activeLayerId: string
        visibleLayerIds: string[]
      }
    | null = null
  export let canvasPresetId: CanvasPresetId = 'infinite'
  export let canvasWidth = 0
  export let canvasHeight = 0

  const applyCanvasPreset = (nextId: CanvasPresetId) => {
    const next = canvasPresets.find((preset) => preset.id === nextId)
    if (!next) return
    const prevWidth = canvasWidth
    const prevHeight = canvasHeight
    canvasPresetId = next.id
    if (next.width > 0 && next.height > 0 && prevWidth > 0 && prevHeight > 0) {
      const sx = next.width / prevWidth
      const sy = next.height / prevHeight
      strokes = strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map(([x, y, p]) => [x * sx, y * sy, p])
      }))
      undoneStack = undoneStack.map((stroke) => ({
        ...stroke,
        points: stroke.points.map(([x, y, p]) => [x * sx, y * sy, p])
      }))
      undoneContext = undoneContext.map((stroke) => ({
        ...stroke,
        points: stroke.points.map(([x, y, p]) => [x * sx, y * sy, p])
      }))
    }
    canvasWidth = next.width
    canvasHeight = next.height
    clearUndoSnapshot = null
  }
</script>

<DropDown
  {open}
  {onToggle}
  pickerClass="canvas-picker"
  buttonClass="nav-icon"
  menuClass="save-dropdown canvas-dropdown"
  menuAlign="left"
  triggerAriaLabel="Canvas size options"
  menuAriaLabel="Canvas size options"
  title="Canvas"
  bind:rootEl
>
  <span slot="trigger"><Ruler size={16} /></span>

  <div class="canvas-current">
    Current:
    {#if canvasPresetId === 'infinite'}
      <span class="infinite-indicator" aria-label="Infinite canvas"><InfinityIcon size={13} /></span>
    {:else}
      {`${canvasWidth} x ${canvasHeight}`}
    {/if}
  </div>
  {#each canvasPresets as preset}
    <button class="save-option-btn" type="button" onclick={() => applyCanvasPreset(preset.id)}>
      {#if preset.id === 'infinite'}
        <span class="infinite-indicator" aria-label="Infinite canvas"><InfinityIcon size={14} /></span>
      {:else}
        {preset.label}
      {/if}
    </button>
  {/each}
</DropDown>
