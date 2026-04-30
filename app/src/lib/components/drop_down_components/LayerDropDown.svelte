<script lang="ts">
  import getStroke from 'perfect-freehand'
  import { Layers3 } from 'lucide-svelte'
  import type { BrushStyle, LayerData, StrokeData } from '../../types'
  import DropDown from './DropDown.svelte'

  export let open = false
  export let onToggle: () => void
  export let rootEl: HTMLDivElement | null = null
  export let layers: LayerData[] = []
  export let visibleLayerIds: string[] = []
  export let strokes: StrokeData[] = []
  export let brushStyleOptions: Record<BrushStyle, Parameters<typeof getStroke>[1]>
  export let activeLayerId = ''
  export let onActiveLayerChange: (layerId: string) => void
  export let onLayerStateChange: (
    nextLayers: LayerData[],
    nextVisibleLayerIds: string[],
    nextActiveLayerId: string
  ) => void
  export let onRenameLayer: (layerId: string, name: string) => void
  export let onAddLayer: () => void

  const getTopVisibleLayerId = (list: LayerData[]) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].visible) return list[i].id
    }
    return null
  }

  const handleSelectLayer = (layerId: string) => {
    if (!visibleLayerIds.includes(layerId)) return
    onActiveLayerChange(layerId)
  }

  const handleToggleLayerVisibility = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId)
    if (!layer) return
    const nextVisible = !layer.visible
    const nextLayers = layers.map((l) => (l.id === layerId ? { ...l, visible: nextVisible } : l))
    const nextVisibleLayerIds = nextLayers.filter((l) => l.visible).map((l) => l.id)
    const topVisibleLayerId = getTopVisibleLayerId(nextLayers)
    if (nextVisibleLayerIds.length === 0 || !topVisibleLayerId) return
    const nextActiveLayerId =
      nextVisible || !nextVisibleLayerIds.includes(activeLayerId) ? topVisibleLayerId : activeLayerId
    onLayerStateChange(nextLayers, nextVisibleLayerIds, nextActiveLayerId)
  }

  const WHITE_LAYER_PREVIEW_DATA_URI =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120" viewBox="0 0 220 120"><rect width="220" height="120" fill="#ffffff"/><rect x="0.5" y="0.5" width="219" height="119" fill="none" stroke="#dbe5f0"/></svg>'
    )

  const getPathFromStroke = (points: number[][]) => {
    if (!points.length) return ''
    const [first, ...rest] = points
    return rest.reduce((acc, [x, y], i, arr) => {
      const [nextX, nextY] = arr[(i + 1) % arr.length]
      acc.push(`Q${x},${y} ${(x + nextX) / 2},${(y + nextY) / 2}`)
      return acc
    }, [`M${first[0]},${first[1]}`]).join(' ')
  }

  const renderLayerPreview = (layerId: string): string => {
    if (typeof document === 'undefined') return WHITE_LAYER_PREVIEW_DATA_URI
    const layerStrokes = strokes.filter((s) => s.layerId === layerId)
    if (layerStrokes.length === 0) return WHITE_LAYER_PREVIEW_DATA_URI
    const canvas = document.createElement('canvas')
    const width = 220
    const height = 120
    canvas.width = width
    canvas.height = height
    const pctx = canvas.getContext('2d')
    if (!pctx) return WHITE_LAYER_PREVIEW_DATA_URI

    pctx.fillStyle = '#ffffff'
    pctx.fillRect(0, 0, width, height)

    const all = layerStrokes.flatMap((s) => s.points)
    const xs = all.map((p) => p[0])
    const ys = all.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const pad = 10
    const bw = Math.max(1, maxX - minX)
    const bh = Math.max(1, maxY - minY)
    const scale = Math.min((width - pad * 2) / bw, (height - pad * 2) / bh)

    for (const stroke of layerStrokes) {
      const shifted = stroke.points.map(([x, y, p]) => [(x - minX) * scale + pad, (y - minY) * scale + pad, p] as [number, number, number])
      const options = brushStyleOptions[stroke.style] ?? brushStyleOptions.ink
      const outline = getStroke(shifted, { size: Math.max(1, stroke.size * scale), ...options })
      const path = getPathFromStroke(outline as unknown as number[][])
      if (!path) continue
      const p = new Path2D(path)
      pctx.save()
      if (stroke.mode === 'erase') {
        pctx.globalCompositeOperation = 'destination-out'
        pctx.fillStyle = '#000000'
      } else {
        pctx.globalCompositeOperation = 'source-over'
        pctx.fillStyle = stroke.color
      }
      pctx.globalAlpha = stroke.opacity
      pctx.fill(p)
      pctx.restore()
    }

    return canvas.toDataURL('image/png')
  }
</script>

<DropDown
  {open}
  {onToggle}
  pickerClass="layer-picker"
  buttonClass="nav-icon"
  menuClass="save-dropdown layer-dropdown"
  menuAlign="right"
  triggerAriaLabel="Layers"
  menuAriaLabel="Layer selector"
  title="Layers"
  bind:rootEl
>
  <span slot="trigger"><Layers3 size={16} /></span>

  <div class="layer-list">
    {#each layers as layer}
      <div class="layer-card">
        <img class="layer-preview-image" src={renderLayerPreview(layer.id)} alt={`Preview of ${layer.name}`} />
        <div class="layer-row">
          <button
            class="save-option-btn layer-select-btn"
            type="button"
            onclick={() => handleSelectLayer(layer.id)}
            title="Select layer"
          >
            {layer.id === activeLayerId ? 'Active' : 'Use'}
          </button>
          <input
            class="layer-name-input"
            type="text"
            value={layer.name}
            maxlength="40"
            aria-label={`Layer name for ${layer.id}`}
            oninput={(event) => onRenameLayer(layer.id, (event.currentTarget as HTMLInputElement).value)}
          />
          <label class="layer-check">
            <input
              type="checkbox"
              checked={layer.visible}
              onchange={() => handleToggleLayerVisibility(layer.id)}
            />
          </label>
        </div>
      </div>
    {/each}
  </div>
  <button class="save-option-btn layer-add-btn" type="button" onclick={onAddLayer}>+ Add Layer</button>
</DropDown>
