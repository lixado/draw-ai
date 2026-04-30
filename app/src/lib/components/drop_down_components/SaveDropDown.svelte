<script lang="ts">
  import { Save } from 'lucide-svelte'
  import JSZip from 'jszip'
  import getStroke from 'perfect-freehand'
  import type { BrushStyle, LayerData, StrokeData } from '../../types'
  import DropDown from './DropDown.svelte'

  export let open = false
  export let onToggle: () => void
  export let onClose: () => void
  export let drawingCanvasRef: { getPngDataUrl?: () => string } | null = null
  export let strokes: StrokeData[] = []
  export let layers: LayerData[] = []
  export let visibleStrokes: StrokeData[] = []
  export let brushStyleOptions: Record<BrushStyle, Parameters<typeof getStroke>[1]>
  export let rootEl: HTMLDivElement | null = null

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

  const downloadFile = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const pngBlobFromDataUrl = (dataUrl: string): Blob | null => {
    const payload = dataUrl.split(',')[1]
    if (!payload) return null
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
    return new Blob([bytes], { type: 'image/png' })
  }

  const sanitizeLayerFileName = (name: string, fallback: string) => {
    const cleaned = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return cleaned || fallback
  }

  const buildLayerPngDataUrl = (layerId: string): string => {
    if (typeof document === 'undefined') return ''
    const canvas = document.createElement('canvas')
    const width = Math.max(1, Math.floor(window.innerWidth))
    const height = Math.max(1, Math.floor(window.innerHeight))
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)

    const layerStrokes = strokes.filter((s) => s.layerId === layerId)
    for (const stroke of layerStrokes) {
      const options = brushStyleOptions[stroke.style] ?? brushStyleOptions.ink
      const outline = getStroke(stroke.points, { size: stroke.size, ...options })
      const path = getPathFromStroke(outline as unknown as number[][])
      if (!path) continue
      const p = new Path2D(path)
      ctx.save()
      if (stroke.mode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out'
        ctx.fillStyle = '#000000'
      } else {
        ctx.globalCompositeOperation = 'source-over'
        ctx.fillStyle = stroke.color
      }
      ctx.globalAlpha = stroke.opacity
      ctx.fill(p)
      ctx.restore()
    }

    return canvas.toDataURL('image/png')
  }

  const buildSvgMarkup = () => {
    if (visibleStrokes.length === 0) return ''
    const allPoints = visibleStrokes.flatMap((s) => s.points)
    const xs = allPoints.map((p) => p[0])
    const ys = allPoints.map((p) => p[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)
    const pad = 16
    const width = Math.max(1, Math.ceil(maxX - minX + pad * 2))
    const height = Math.max(1, Math.ceil(maxY - minY + pad * 2))

    const paths = visibleStrokes
      .map((stroke) => {
        const shifted = stroke.points.map(([x, y, p]) => [x - minX + pad, y - minY + pad, p] as [number, number, number])
        const options = brushStyleOptions[stroke.style] ?? brushStyleOptions.ink
        const outline = getStroke(shifted, { size: stroke.size, ...options })
        const d = getPathFromStroke(outline as unknown as number[][])
        if (!d) return ''
        const color = stroke.mode === 'erase' ? '#ffffff' : stroke.color
        return `<path d="${d}" fill="${color}" fill-opacity="${stroke.opacity}" />`
      })
      .join('\n')

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#ffffff" />${paths}</svg>`
  }

  const handleSavePng = () => {
    const dataUrl = drawingCanvasRef?.getPngDataUrl?.()
    if (!dataUrl) return
    const blob = pngBlobFromDataUrl(dataUrl)
    if (!blob) return
    downloadFile(`drawai-${Date.now()}.png`, blob)
    onClose()
  }

  const handleSaveEachLayerPng = async () => {
    const stamp = Date.now()
    const zip = new JSZip()
    for (const layer of layers) {
      const dataUrl = buildLayerPngDataUrl(layer.id)
      const blob = pngBlobFromDataUrl(dataUrl)
      if (!blob) continue
      const safeLayerName = sanitizeLayerFileName(layer.name, layer.id)
      zip.file(`${safeLayerName}.png`, blob)
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    downloadFile(`drawai-layers-${stamp}.zip`, zipBlob)
    onClose()
  }

  const handleSaveSvg = () => {
    const svg = buildSvgMarkup()
    if (!svg) return
    downloadFile(`drawai-${Date.now()}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    onClose()
  }
</script>

<DropDown
  {open}
  {onToggle}
  pickerClass="save-picker"
  buttonClass="nav-icon"
  menuClass="save-dropdown"
  triggerAriaLabel="Save"
  menuAriaLabel="Save options"
  title="Save"
  bind:rootEl
>
  <span slot="trigger"><Save size={16} /></span>

  <button class="save-option-btn" type="button" onclick={handleSavePng}>PNG</button>
  <button class="save-option-btn" type="button" onclick={handleSaveEachLayerPng}>
    Save each layer individually as PNG
  </button>
  <button class="save-option-btn" type="button" onclick={handleSaveSvg}>SVG</button>
</DropDown>
