<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Bot, Eraser, Expand, Layers3, RotateCcw, RotateCw, Save, Trash2 } from 'lucide-svelte'
  import JSZip from 'jszip'
  import getStroke from 'perfect-freehand'
  import logoUrl from './assets/logo.png'
  import DrawingCanvas from './lib/components/DrawingCanvas.svelte'
  import BrushSelector from './lib/components/BrushSelector.svelte'
  import ModelSelector from './lib/components/ModelSelector.svelte'
  import SuggestionPanel from './lib/components/SuggestionPanel.svelte'
  import type { BrushStyle, LayerData, StrokeData, StrokeStack } from './lib/types'
  import {
    generateUndoSuggestionsStream,
    prewarmSuggestionModel,
    type RedoSuggestion
  } from './lib/ai/suggestions'
  import {
    createGroqParameterProvider,
    resetParameterProvider,
    setParameterProvider,
    setProviderWarningHandler
  } from './lib/ai/parameterProvider'

  let strokes: StrokeData[] = []
  let undoneStack: StrokeStack = []
  let undoneContext: StrokeData[] = []
  let suggestions: RedoSuggestion[] = []
  let loadingSuggestions = false
  let modelStatus = 'idle'
  let suggestionRequestId = 0
  let showModelSelector = true
  let showProviderWarning = false
  let providerWarningMessage = ''
  type ProviderMode = 'local' | 'groq'
  const ENV_GROQ_API_KEY = (import.meta.env.VITE_GROQ_API_KEY ?? '').trim()
  let providerMode: ProviderMode = 'local'
  let groqApiKey = ''
  const isIPad = /iPad|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document
  const MAX_UNDO_CONTEXT = 5

  // Brush state (used by DrawingCanvas + toolbar)
  const initialColor = '#0f172a'
  let hue = 0
  let saturation = 0
  let value = 0
  let brushColor = initialColor
  let brushSize = 14
  let brushOpacity = 1
  let brushStyle: BrushStyle = 'ribbon'
  let toolMode: 'draw' | 'erase' = 'draw'
  let isColorMenuOpen = false
  let isBrushMenuOpen = false
  let isSaveMenuOpen = false
  let currentHueColor = '#ff0000'
  let colorMenuRoot: HTMLDivElement | null = null
  let brushMenuRoot: HTMLDivElement | null = null
  let saveMenuRoot: HTMLDivElement | null = null
  let layerMenuRoot: HTMLDivElement | null = null
  let drawingCanvasRef: { getPngDataUrl?: () => string } | null = null
  let hueRingEl: HTMLDivElement | null = null
  let svSquareEl: HTMLDivElement | null = null
  let hueDragging = false
  let svDragging = false
  let layers: LayerData[] = [{ id: 'layer-1', name: 'Layer 1', visible: true }]
  let activeLayerId = 'layer-1'
  let visibleLayerIds: string[] = ['layer-1']
  let showLayerMenu = false
  let recentColors: string[] = []
  let paletteSuggestions: string[] = []
  let lastPaletteStrokeMark = 0

  const brushStyles: Array<{ id: BrushStyle; label: string }> = [
    { id: 'pencil', label: 'Pencil' },
    { id: 'ink', label: 'Ink' },
    { id: 'marker', label: 'Marker' },
    { id: 'airbrush', label: 'Airbrush' },
    { id: 'calligraphy', label: 'Calligraphy' },
    { id: 'watercolor', label: 'Watercolor' },
    { id: 'charcoal', label: 'Charcoal' },
    { id: 'neon', label: 'Neon' },
    { id: 'pixel', label: 'Pixel' },
    { id: 'ribbon', label: 'Ribbon' }
  ]
  const brushStyleOptions: Record<BrushStyle, Parameters<typeof getStroke>[1]> = {
    pencil: {
      thinning: 0.85,
      smoothing: 0.45,
      streamline: 0.2,
      simulatePressure: false,
      easing: (t: number) => t * (2 - t)
    },
    ink: {
      thinning: 0.65,
      smoothing: 0.65,
      streamline: 0.4,
      simulatePressure: false,
      easing: (t: number) => t * t
    },
    marker: {
      thinning: 0.2,
      smoothing: 0.8,
      streamline: 0.55,
      simulatePressure: false,
      easing: (t: number) => t * (2 - t)
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

  const hexToRgb = (hex: string) => {
    const cleaned = hex.replace('#', '')
    const full = cleaned.length === 3 ? cleaned.split('').map((c) => `${c}${c}`).join('') : cleaned
    const num = parseInt(full, 16)
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    }
  }

  const rgbToHex = (r: number, g: number, b: number) =>
    `#${((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1)}`

  const hsvToHex = (h: number, s: number, v: number) => {
    const hh = ((h % 360) + 360) % 360
    const c = v * s
    const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
    const m = v - c
    let r = 0
    let g = 0
    let b = 0
    if (hh < 60) [r, g, b] = [c, x, 0]
    else if (hh < 120) [r, g, b] = [x, c, 0]
    else if (hh < 180) [r, g, b] = [0, c, x]
    else if (hh < 240) [r, g, b] = [0, x, c]
    else if (hh < 300) [r, g, b] = [x, 0, c]
    else [r, g, b] = [c, 0, x]
    return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255)
  }

  const rgbToHsv = (r: number, g: number, b: number) => {
    const rr = r / 255
    const gg = g / 255
    const bb = b / 255
    const max = Math.max(rr, gg, bb)
    const min = Math.min(rr, gg, bb)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
      if (max === rr) h = 60 * (((gg - bb) / delta) % 6)
      else if (max === gg) h = 60 * ((bb - rr) / delta + 2)
      else h = 60 * ((rr - gg) / delta + 4)
    }
    if (h < 0) h += 360
    const s = max === 0 ? 0 : delta / max
    const v = max
    return { h, s, v }
  }

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  const exitEraseMode = () => {
    if (toolMode === 'erase') toolMode = 'draw'
  }

  const updateHueFromPointer = (event: PointerEvent) => {
    if (!hueRingEl) return
    const rect = hueRingEl.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = event.clientX - cx
    const dy = event.clientY - cy
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90
    if (deg < 0) deg += 360
    hue = deg
    exitEraseMode()
  }

  const updateSvFromPointer = (event: PointerEvent) => {
    if (!svSquareEl) return
    const rect = svSquareEl.getBoundingClientRect()
    const x = clamp(event.clientX - rect.left, 0, rect.width)
    const y = clamp(event.clientY - rect.top, 0, rect.height)
    saturation = clamp(x / rect.width, 0, 1)
    value = clamp(1 - y / rect.height, 0, 1)
    exitEraseMode()
  }

  const onHuePointerDown = (event: PointerEvent) => {
    hueDragging = true
    updateHueFromPointer(event)
  }

  const onSvPointerDown = (event: PointerEvent) => {
    event.stopPropagation()
    svDragging = true
    updateSvFromPointer(event)
  }

  const onWindowPointerMove = (event: PointerEvent) => {
    if (hueDragging) updateHueFromPointer(event)
    if (svDragging) updateSvFromPointer(event)
  }

  const onWindowPointerUp = () => {
    hueDragging = false
    svDragging = false
  }

  {
    const rgb = hexToRgb(initialColor)
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
    hue = hsv.h
    saturation = hsv.s
    value = hsv.v
  }

  $: brushColor = hsvToHex(hue, saturation, value)
  $: currentHueColor = hsvToHex(hue, 1, 1)
  $: visibleStrokes = strokes.filter((stroke) => visibleLayerIds.includes(stroke.layerId))

  const rememberColor = (color: string) => {
    recentColors = [color, ...recentColors.filter((c) => c !== color)].slice(0, 10)
  }

  const colorDistance = (a: string, b: string) => {
    const ca = hexToRgb(a)
    const cb = hexToRgb(b)
    return Math.hypot(ca.r - cb.r, ca.g - cb.g, ca.b - cb.b)
  }

  const generatePaletteSuggestions = async () => {
    const used = Array.from(new Set(strokes.map((s) => s.color))).slice(0, 24)
    if (used.length === 0) return
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
    paletteSuggestions = generated.filter(
      (color, idx, arr) =>
        arr.indexOf(color) === idx && used.every((u) => colorDistance(u, color) > 24)
    )
  }

  const addLayer = () => {
    if (layers.length >= 100) return
    const next = `layer-${layers.length + 1}`
    const layer: LayerData = { id: next, name: `Layer ${layers.length + 1}`, visible: true }
    layers = [...layers, layer]
    visibleLayerIds = [...visibleLayerIds, next]
    activeLayerId = next
  }

  const renameLayer = (layerId: string, name: string) => {
    layers = layers.map((layer) => (layer.id === layerId ? { ...layer, name } : layer))
  }

  const toggleLayerVisibility = (layerId: string) => {
    const layer = layers.find((l) => l.id === layerId)
    if (!layer) return
    const nextVisible = !layer.visible
    layers = layers.map((l) => (l.id === layerId ? { ...l, visible: nextVisible } : l))
    visibleLayerIds = layers
      .map((l) => (l.id === layerId ? { ...l, visible: nextVisible } : l))
      .filter((l) => l.visible)
      .map((l) => l.id)
  }

  const onWindowPointerDown = (event: PointerEvent) => {
    const target = event.target as Node | null
    if (isColorMenuOpen) {
      const colorRoot = colorMenuRoot
      if (colorRoot && target && colorRoot.contains(target)) return
      isColorMenuOpen = false
    }
    if (isBrushMenuOpen) {
      const brushRoot = brushMenuRoot
      if (brushRoot && target && brushRoot.contains(target)) return
      isBrushMenuOpen = false
    }
    if (isSaveMenuOpen) {
      const saveRoot = saveMenuRoot
      if (saveRoot && target && saveRoot.contains(target)) return
      isSaveMenuOpen = false
    }
    if (showLayerMenu) {
      const layerRoot = layerMenuRoot
      if (layerRoot && target && layerRoot.contains(target)) return
      showLayerMenu = false
    }
  }

  const getPathFromStroke = (points: number[][]) => {
    if (!points.length) return ''
    const [first, ...rest] = points
    return rest.reduce((acc, [x, y], i, arr) => {
      const [nextX, nextY] = arr[(i + 1) % arr.length]
      acc.push(`Q${x},${y} ${(x + nextX) / 2},${(y + nextY) / 2}`)
      return acc
    }, [`M${first[0]},${first[1]}`]).join(' ')
  }

  const WHITE_LAYER_PREVIEW_DATA_URI =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120" viewBox="0 0 220 120"><rect width="220" height="120" fill="#ffffff"/><rect x="0.5" y="0.5" width="219" height="119" fill="none" stroke="#dbe5f0"/></svg>'
    )

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
      const shifted = stroke.points.map(([x, y, p]) => [
        (x - minX) * scale + pad,
        (y - minY) * scale + pad,
        p
      ]) as [number, number, number][]
      const options = brushStyleOptions[stroke.style] ?? brushStyleOptions.ink
      const outline = getStroke(shifted, { size: Math.max(1, stroke.size * scale), ...options })
      const path = getPathFromStroke(outline as unknown as number[][])
      if (!path) continue
      const p = new Path2D(path)
      pctx.save()
      if (stroke.mode === 'erase') {
        pctx.globalCompositeOperation = 'destination-out'
        pctx.fillStyle = '#000'
      } else {
        pctx.globalCompositeOperation = 'source-over'
        pctx.fillStyle = stroke.color
      }
      pctx.globalAlpha = stroke.opacity
      pctx.fill(p)
      pctx.restore()
    }

    pctx.strokeStyle = '#dbe5f0'
    pctx.strokeRect(0.5, 0.5, width - 1, height - 1)
    return canvas.toDataURL('image/png')
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

  const saveAsPng = () => {
    const dataUrl = drawingCanvasRef?.getPngDataUrl?.()
    if (!dataUrl) return
    const blob = pngBlobFromDataUrl(dataUrl)
    if (!blob) return
    downloadFile(`drawai-${Date.now()}.png`, blob)
    isSaveMenuOpen = false
  }

  const sanitizeLayerFileName = (name: string, fallback: string) => {
    const cleaned = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return cleaned || fallback
  }

  const saveEachLayerAsPng = async () => {
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
    isSaveMenuOpen = false
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

  const saveAsSvg = () => {
    const svg = buildSvgMarkup()
    if (!svg) return
    downloadFile(`drawai-${Date.now()}.svg`, new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    isSaveMenuOpen = false
  }

  const addStroke = (stroke: StrokeData) => {
    const next = {
      ...stroke,
      layerId: activeLayerId
    }
    strokes = [...strokes, next]
    rememberColor(next.color)
    if (strokes.length - lastPaletteStrokeMark >= 40) {
      lastPaletteStrokeMark = strokes.length
      void generatePaletteSuggestions()
    }
    undoneStack = []
    undoneContext = []
    suggestions = []
    loadingSuggestions = false
    modelStatus = 'idle'
    suggestionRequestId += 1
  }

  const applySuggestion = (suggestion: RedoSuggestion) => {
    const projected = suggestion.strokes.map((stroke) => ({ ...stroke, layerId: activeLayerId }))
    strokes = [...strokes, ...projected]
    projected.forEach((stroke) => rememberColor(stroke.color))
    undoneStack = []
    undoneContext = []
    suggestions = []
    loadingSuggestions = false
    modelStatus = 'idle'
    suggestionRequestId += 1
  }

  const regenerateSuggestions = async (context: StrokeData[], current: StrokeData[]) => {
    const requestId = ++suggestionRequestId
    if (context.length === 0) {
      suggestions = []
      loadingSuggestions = false
      modelStatus = 'idle'
      return
    }
    suggestions = []
    loadingSuggestions = true
    try {
      const result = await generateUndoSuggestionsStream(context, current, {
        onSuggestion: async (suggestion) => {
          if (requestId !== suggestionRequestId) return
          suggestions = [...suggestions, suggestion]
          await tick()
        }
      })
      if (requestId !== suggestionRequestId) return
      modelStatus = result.modelStatus
    } finally {
      if (requestId === suggestionRequestId) {
        loadingSuggestions = false
      }
    }
  }

  const undoAndSuggest = async () => {
    if (strokes.length === 0) return
    const requestId = ++suggestionRequestId
    const removed = strokes[strokes.length - 1]
    strokes = strokes.slice(0, -1)
    undoneStack = [...undoneStack, removed]
    const nextUndoneContext = [removed, ...undoneContext].slice(0, MAX_UNDO_CONTEXT)
    undoneContext = nextUndoneContext
    suggestions = []
    loadingSuggestions = true
    try {
      const result = await generateUndoSuggestionsStream(nextUndoneContext, strokes, {
        onSuggestion: async (suggestion) => {
          if (requestId !== suggestionRequestId) return
          suggestions = [...suggestions, suggestion]
          await tick()
        }
      })
      if (requestId !== suggestionRequestId) return
      modelStatus = result.modelStatus
    } finally {
      if (requestId === suggestionRequestId) {
        loadingSuggestions = false
      }
    }
  }

  const stopSuggestionGeneration = () => {
    suggestionRequestId += 1
    loadingSuggestions = false
    modelStatus = 'idle'
  }

  const redoLast = async () => {
    const lastUndone = undoneStack[undoneStack.length - 1]
    if (!lastUndone) return
    const nextUndoneStack = undoneStack.slice(0, -1)
    const nextStrokes = [...strokes, lastUndone]
    undoneStack = nextUndoneStack
    strokes = nextStrokes
    // Remove this stroke from AI undo context so suggestions keep prior undos.
    const idx = undoneContext.findIndex((stroke) => stroke.id === lastUndone.id)
    let nextContext = undoneContext
    if (idx >= 0) {
      nextContext = [...undoneContext.slice(0, idx), ...undoneContext.slice(idx + 1)]
    }
    undoneContext = nextContext
    await regenerateSuggestions(nextContext, nextStrokes)
  }

  const enterFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    }
  }

  const clearAll = () => {
    suggestionRequestId += 1
    strokes = []
    undoneStack = []
    undoneContext = []
    layers = [{ id: 'layer-1', name: 'Layer 1', visible: true }]
    activeLayerId = 'layer-1'
    visibleLayerIds = ['layer-1']
    suggestions = []
    loadingSuggestions = false
    modelStatus = 'idle'
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      undoAndSuggest()
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      redoLast()
    }
  }

  const applyProvider = async (mode: ProviderMode, apiKey?: string) => {
    if (mode === 'groq') {
      const key = (apiKey ?? groqApiKey).trim()
      if (!key) {
        showModelSelector = true
        return
      }
      groqApiKey = key
      setParameterProvider(createGroqParameterProvider(key))
      providerMode = 'groq'
      localStorage.setItem('drawai:model-provider', 'groq')
      localStorage.setItem('drawai:groq-key', key)
    } else {
      resetParameterProvider()
      providerMode = 'local'
      localStorage.setItem('drawai:model-provider', 'local')
    }
    await prewarmSuggestionModel()
  }

  const onSelectModelProvider = async (event: CustomEvent<{ mode: 'local' } | { mode: 'groq'; apiKey: string }>) => {
    const choice = event.detail
    if (choice.mode === 'groq') await applyProvider('groq', choice.apiKey)
    else await applyProvider('local')
    showModelSelector = false
  }

  const onProviderDropdownChange = async (event: Event) => {
    const nextMode = (event.currentTarget as HTMLSelectElement).value as ProviderMode
    if (nextMode === 'groq' && !groqApiKey.trim()) {
      showModelSelector = true
      return
    }
    await applyProvider(nextMode)
  }

  const onProviderWarning = (message: string) => {
    providerWarningMessage = message
    showProviderWarning = true
  }

  const PROJECT_STORAGE_KEY = 'drawai:project-v2'
  const persistProject = () => {
    try {
      const payload = JSON.stringify({
        strokes,
        layers,
        activeLayerId,
        visibleLayerIds,
        recentColors
      })
      localStorage.setItem(PROJECT_STORAGE_KEY, payload)
      const usedBytes = payload.length * 2
      if (usedBytes > 4.5 * 1024 * 1024) {
        onProviderWarning(
          'Local storage is almost full. Save a local file soon or your project can be lost.'
        )
      }
    } catch {
      onProviderWarning('Local storage is full. Save your file locally now to avoid data loss.')
    }
  }

  let persistDebounce: ReturnType<typeof setTimeout> | null = null
  $: {
    strokes
    layers
    activeLayerId
    visibleLayerIds
    recentColors
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = setTimeout(persistProject, 400)
  }

  onMount(() => {
    setProviderWarningHandler(onProviderWarning)
    const provider = localStorage.getItem('drawai:model-provider')
    const storedKey = localStorage.getItem('drawai:groq-key') ?? ''
    groqApiKey = ENV_GROQ_API_KEY || storedKey.trim()

    if (ENV_GROQ_API_KEY) {
      showModelSelector = false
      void applyProvider('groq', ENV_GROQ_API_KEY)
    } else if (provider === 'groq' && groqApiKey) {
      showModelSelector = false
      void applyProvider('groq', groqApiKey)
    } else {
      showModelSelector = true
      providerMode = 'local'
      resetParameterProvider()
    }

    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as {
          strokes?: StrokeData[]
          layers?: LayerData[]
          activeLayerId?: string
          visibleLayerIds?: string[]
          recentColors?: string[]
        }
        if (Array.isArray(parsed.layers) && parsed.layers.length > 0) layers = parsed.layers
        if (Array.isArray(parsed.strokes)) strokes = parsed.strokes
        if (typeof parsed.activeLayerId === 'string') activeLayerId = parsed.activeLayerId
        if (Array.isArray(parsed.visibleLayerIds)) visibleLayerIds = parsed.visibleLayerIds
        if (Array.isArray(parsed.recentColors)) recentColors = parsed.recentColors.slice(0, 10)
        if (strokes.length === 0) {
          layers = [{ id: 'layer-1', name: 'Layer 1', visible: true }]
          activeLayerId = 'layer-1'
          visibleLayerIds = ['layer-1']
        }
      }
    } catch {
      // ignore corrupt persisted state
    }

    return () => {
      setProviderWarningHandler(null)
    }
  })
</script>

<svelte:window
  onkeydown={onKeyDown}
  onpointerdown={onWindowPointerDown}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp}
/>

<main class="app-shell">
  {#if showProviderWarning}
    <div class="provider-warning-overlay">
      <div class="provider-warning-card">
        <h2>Model Warning</h2>
        <p>{providerWarningMessage}</p>
        <div class="provider-warning-actions">
          <button
            type="button"
            onclick={async () => {
              showProviderWarning = false
              await applyProvider('local')
            }}
          >
            Switch to Local
          </button>
          <button
            type="button"
            onclick={() => {
              showProviderWarning = false
              showModelSelector = true
            }}
          >
            New API Key
          </button>
        </div>
      </div>
    </div>
  {/if}
  {#if showModelSelector}
    <ModelSelector
      initialMode={providerMode}
      initialApiKey={groqApiKey}
      on:select={onSelectModelProvider}
    />
  {/if}
  <section class="workspace">
    <div class="left-sliders" aria-label="Brush sliders">
      <div class="slider-box size-slider">
        <div class="slider-visual size-visual" aria-hidden="true"></div>
        <input
          class="vslider"
          type="range"
          min="4"
          max="72"
          step="0.1"
          value={brushSize}
          oninput={(e) => (brushSize = Number((e.currentTarget as HTMLInputElement).value))}
          aria-label="Brush size"
        />
      </div>

      <div class="slider-box opacity-slider">
        <div
          class="slider-visual"
          style={`--from: rgba(${hexToRgb(brushColor).r}, ${hexToRgb(brushColor).g}, ${hexToRgb(brushColor).b}, 1); --to: rgba(${hexToRgb(brushColor).r}, ${hexToRgb(brushColor).g}, ${hexToRgb(brushColor).b}, 0);`}
          aria-hidden="true"
        ></div>
        <input
          class="vslider"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={brushOpacity}
          oninput={(e) => (brushOpacity = Number((e.currentTarget as HTMLInputElement).value))}
          aria-label="Brush opacity"
        />
      </div>
    </div>

    <DrawingCanvas
      bind:this={drawingCanvasRef}
      strokes={visibleStrokes}
      {brushSize}
      {brushColor}
      {brushOpacity}
      {toolMode}
      {brushStyle}
      {activeLayerId}
      on:addstroke={(event) => addStroke(event.detail)}
      on:penDoubleTapUndo={undoAndSuggest}
    />
    <aside class="right-rail">
      {#if paletteSuggestions.length > 0}
        <section class="palette-panel">
          <header>
            <h2><Bot size={13} /> AI Palette</h2>
          </header>
          <div class="dots">
            {#each paletteSuggestions as color}
              <button
                class="dot"
                type="button"
                style={`background:${color}`}
                onclick={() => {
                  const rgb = hexToRgb(color)
                  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
                  hue = hsv.h
                  saturation = hsv.s
                  value = hsv.v
                  rememberColor(color)
                  exitEraseMode()
                }}
                aria-label={`Palette color ${color}`}
              ></button>
            {/each}
          </div>
        </section>
      {/if}
      <div class="redo-panel">
        <SuggestionPanel
          {suggestions}
          {loadingSuggestions}
          {modelStatus}
          on:pick={((event) => applySuggestion(event.detail))}
          on:stop={stopSuggestionGeneration}
        />
      </div>
    </aside>

    <header class="navbar" aria-label="Top toolbar">
      <div class="nav-left">
        <button
          class="nav-icon"
          type="button"
          onclick={undoAndSuggest}
          disabled={strokes.length === 0}
          aria-label="Undo"
          title="Undo"
        >
          <RotateCcw size={16} />
        </button>
        <button
          class="nav-icon"
          type="button"
          onclick={redoLast}
          disabled={undoneStack.length === 0}
          aria-label="Redo last"
          title="Redo"
        >
          <RotateCw size={16} />
        </button>
        <button
          class="nav-icon"
          type="button"
          class:active={toolMode === 'erase'}
          onclick={() => (toolMode = toolMode === 'erase' ? 'draw' : 'erase')}
          aria-label="Eraser"
          aria-pressed={toolMode === 'erase'}
          title="Eraser"
        >
          <Eraser size={16} />
        </button>
        {#if isIPad}
          <button
            class="nav-icon"
            type="button"
            onclick={enterFullscreen}
            aria-label="Fullscreen"
            title="Fullscreen"
          >
            <Expand size={16} />
          </button>
        {/if}
        <button class="nav-icon dangerText" type="button" onclick={clearAll} aria-label="Clear all" title="Clear">
          <Trash2 size={16} />
        </button>
        <div class="picker save-picker" bind:this={saveMenuRoot}>
          <button
            type="button"
            class="nav-icon"
            aria-label="Save"
            aria-expanded={isSaveMenuOpen}
            onclick={() => {
              isSaveMenuOpen = !isSaveMenuOpen
              if (isSaveMenuOpen) {
                isColorMenuOpen = false
                isBrushMenuOpen = false
              }
            }}
            title="Save"
          >
            <Save size={16} />
          </button>
          {#if isSaveMenuOpen}
            <div class="save-dropdown" role="menu" aria-label="Save options">
              <button class="save-option-btn" type="button" onclick={saveAsPng}>PNG</button>
              <button class="save-option-btn" type="button" onclick={saveEachLayerAsPng}>
                Save each layer individually as PNG
              </button>
              <button class="save-option-btn" type="button" onclick={saveAsSvg}>SVG</button>
            </div>
          {/if}
        </div>
        <select
          class="provider-select"
          aria-label="Model provider"
          value={providerMode}
          onchange={onProviderDropdownChange}
          title="Model provider"
        >
          <option value="local">Local</option>
          <option value="groq">Groq</option>
        </select>
      </div>

      <div class="nav-title" aria-hidden="true">
        <img class="nav-title-icon" src={logoUrl} alt="" />
        <span>DrawAI</span>
      </div>

      <div class="nav-right">
        <div class="picker layer-picker" bind:this={layerMenuRoot}>
          <button class="nav-icon" type="button" onclick={() => (showLayerMenu = !showLayerMenu)} title="Layers">
            <Layers3 size={16} />
          </button>
          {#if showLayerMenu}
            <div class="save-dropdown layer-dropdown" role="menu" aria-label="Layer selector">
              <div class="layer-list">
                {#each layers as layer}
                  <div class="layer-card">
                    <img class="layer-preview-image" src={renderLayerPreview(layer.id)} alt={`Preview of ${layer.name}`} />
                    <div class="layer-row">
                      <button
                        class="save-option-btn layer-select-btn"
                        type="button"
                        onclick={() => (activeLayerId = layer.id)}
                        title="Select layer"
                      >
                        Use
                      </button>
                      <input
                        class="layer-name-input"
                        type="text"
                        value={layer.name}
                        maxlength="40"
                        aria-label={`Layer name for ${layer.id}`}
                        oninput={(event) => renameLayer(layer.id, (event.currentTarget as HTMLInputElement).value)}
                      />
                      <label class="layer-check">
                        <input
                          type="checkbox"
                          checked={layer.visible}
                          onchange={() => toggleLayerVisibility(layer.id)}
                        />
                      </label>
                    </div>
                  </div>
                {/each}
              </div>
              <button class="save-option-btn layer-add-btn" type="button" onclick={addLayer}>+ Add Layer</button>
            </div>
          {/if}
        </div>
        <div class="picker color-picker" bind:this={colorMenuRoot}>
          <button
            type="button"
            class="color-swatch"
            aria-label="Selected color"
            aria-expanded={isColorMenuOpen}
            onclick={() => {
              isColorMenuOpen = !isColorMenuOpen
              if (isColorMenuOpen) isBrushMenuOpen = false
            }}
            style={`background:${brushColor}`}
          ></button>

          {#if isColorMenuOpen}
            <div class="color-dropdown" role="menu" aria-label="Choose color">
              <div
                class="wheel"
                bind:this={hueRingEl}
                onpointerdown={onHuePointerDown}
                role="slider"
                tabindex="0"
                aria-label="Base hue"
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(hue)}
              >
                <div
                  class="wheel-marker"
                  style={`left:${50 + Math.cos(((hue - 90) * Math.PI) / 180) * 44}%; top:${50 + Math.sin(((hue - 90) * Math.PI) / 180) * 44}%;`}
                ></div>
                <div
                  class="wheel-inner"
                  style={`background:${currentHueColor}`}
                  bind:this={svSquareEl}
                  onpointerdown={onSvPointerDown}
                  role="slider"
                  tabindex="0"
                  aria-label="Color brightness and saturation"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(value * 100)}
                >
                  <div class="sv-layer white"></div>
                  <div class="sv-layer black"></div>
                  <div class="sv-cursor" style={`left:${saturation * 100}%; top:${(1 - value) * 100}%;`}></div>
                </div>
              </div>
              {#if recentColors.length > 0}
                <div class="dots">
                  {#each recentColors as color}
                    <button
                      class="dot"
                      type="button"
                      onclick={() => {
                        const rgb = hexToRgb(color)
                        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
                        hue = hsv.h
                        saturation = hsv.s
                        value = hsv.v
                        exitEraseMode()
                      }}
                      style={`background:${color}`}
                      aria-label={`Recent color ${color}`}
                    ></button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>

        <div bind:this={brushMenuRoot}>
          <BrushSelector
            value={brushStyle}
            open={isBrushMenuOpen}
            options={brushStyles}
            onToggle={() => {
              isBrushMenuOpen = !isBrushMenuOpen
              if (isBrushMenuOpen) isColorMenuOpen = false
            }}
            onPick={(id) => {
              brushStyle = id
              exitEraseMode()
              isBrushMenuOpen = false
            }}
          />
        </div>
      </div>
    </header>
  </section>

</main>
