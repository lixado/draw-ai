<script lang="ts">
  import { onMount, tick } from 'svelte'
  import DrawingCanvas from './lib/components/DrawingCanvas.svelte'
  import { canvasPresets, type CanvasPresetId } from './lib/components/drop_down_components/ResolutionDropDown.svelte'
  import NavBar from './lib/components/NavBar.svelte'
  import AIPalettePanel from './lib/components/AIPalettePanel.svelte'
  import SuggestionPanel from './lib/components/SuggestionPanel.svelte'
  import type { BrushStyle, LayerData, StrokeData, StrokeStack } from './lib/types'
  import {
    generateUndoSuggestionsStreamNew,
    type RedoSuggestion
  } from './lib/ai/features/redo_suggestion'
  import {
    loadProjectState,
    saveProjectState
  } from './lib/localstorageManager'
  import generatePaletteSuggestions from './lib/ai/features/color_palatte_suggestion'
  import { hexToRgb, hsvToHex, rgbToHsv } from './lib/color/colorUtils'

  let strokes: StrokeData[] = []
  let undoneStack: StrokeStack = []
  let undoneContext: StrokeData[] = []
  let suggestions: RedoSuggestion[] = []
  let loadingSuggestions = false
  let modelStatus = 'idle'
  let suggestionRequestId = 0
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
  let currentHueColor = '#ff0000'
  let drawingCanvasRef: { getPngDataUrl?: () => string } | null = null
  let layers: LayerData[] = [{ id: 'layer-1', name: 'Layer 1', visible: true }]
  let activeLayerId = 'layer-1'
  let visibleLayerIds: string[] = ['layer-1']
  let recentColors: string[] = []
  let paletteSuggestions: string[] = []
  let lastPaletteStrokeMark = 0
  let clearUndoSnapshot:
    | {
        strokes: StrokeData[]
        layers: LayerData[]
        activeLayerId: string
        visibleLayerIds: string[]
      }
    | null = null
  let canvasPresetId: CanvasPresetId = 'infinite'
  let canvasWidth = 0
  let canvasHeight = 0
  let keepFullscreen = false

  const exitEraseMode = () => {
    if (toolMode === 'erase') toolMode = 'draw'
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

  const addStroke = (stroke: StrokeData) => {
    clearUndoSnapshot = null
    const getTopVisibleLayerId = (list: LayerData[]) => {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i].visible) return list[i].id
      }
      return null
    }
    const topVisibleLayerId = getTopVisibleLayerId(layers)
    const targetLayerId =
      visibleLayerIds.includes(activeLayerId) ? activeLayerId : (topVisibleLayerId ?? activeLayerId)
    const next = {
      ...stroke,
      layerId: targetLayerId
    }
    strokes = [...strokes, next]
    rememberColor(next.color)
    if (strokes.length - lastPaletteStrokeMark >= 24) {
      lastPaletteStrokeMark = strokes.length
      void generatePaletteSuggestions(strokes).then((nextPalette) => {
        paletteSuggestions = nextPalette
      })
    }
    undoneStack = []
    undoneContext = []
    suggestions = []
    loadingSuggestions = false
    modelStatus = 'idle'
    suggestionRequestId += 1
  }

  const applySuggestion = (suggestion: RedoSuggestion) => {
    clearUndoSnapshot = null
    const getTopVisibleLayerId = (list: LayerData[]) => {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (list[i].visible) return list[i].id
      }
      return null
    }
    const topVisibleLayerId = getTopVisibleLayerId(layers)
    const targetLayerId =
      visibleLayerIds.includes(activeLayerId) ? activeLayerId : (topVisibleLayerId ?? activeLayerId)
    const projected = suggestion.strokes.map((stroke) => ({ ...stroke, layerId: targetLayerId }))
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
      const result = await generateUndoSuggestionsStreamNew(context, current, {
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
    if (clearUndoSnapshot) {
      strokes = clearUndoSnapshot.strokes
      layers = clearUndoSnapshot.layers
      activeLayerId = clearUndoSnapshot.activeLayerId
      visibleLayerIds = clearUndoSnapshot.visibleLayerIds
      clearUndoSnapshot = null
      suggestions = []
      loadingSuggestions = false
      modelStatus = 'idle'
      suggestionRequestId += 1
      return
    }
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
      const result = await generateUndoSuggestionsStreamNew(nextUndoneContext, strokes, {
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
      keepFullscreen = true
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // ignore devices that don't support navigationUI options
      })
    }
  }

  const onPickPaletteColor = (color: string) => {
    const rgb = hexToRgb(color)
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b)
    hue = hsv.h
    saturation = hsv.s
    value = hsv.v
    rememberColor(color)
    exitEraseMode()
  }

  const clearAll = () => {
    clearUndoSnapshot = {
      strokes: strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => [point[0], point[1], point[2]])
      })),
      layers: layers.map((layer) => ({ ...layer })),
      activeLayerId,
      visibleLayerIds: [...visibleLayerIds]
    }
    suggestionRequestId += 1
    strokes = []
    undoneStack = []
    undoneContext = []
    layers = [{ id: 'layer-1', name: 'Layer 1', visible: true }]
    activeLayerId = 'layer-1'
    visibleLayerIds = ['layer-1']
    canvasPresetId = 'infinite'
    canvasWidth = 0
    canvasHeight = 0
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

  const persistProject = () => {
    const persistStatus = saveProjectState({
        strokes,
        layers,
        activeLayerId,
        visibleLayerIds,
        recentColors,
        canvasPresetId,
        canvasWidth,
        canvasHeight
      })
    if (persistStatus === 'near_limit') {
      alert(
        'Local storage is almost full. Save a local file soon or your project can be lost.'
      )
    }
    if (persistStatus === 'full') {
      alert('Local storage is full. Save your file locally now to avoid data loss.')
    }
  }

  let persistDebounce: ReturnType<typeof setTimeout> | null = null
  $: {
    strokes
    layers
    activeLayerId
    visibleLayerIds
    recentColors
    canvasPresetId
    canvasWidth
    canvasHeight
    if (persistDebounce) clearTimeout(persistDebounce)
    persistDebounce = setTimeout(persistProject, 400)
  }

  onMount(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && keepFullscreen && isIPad) {
        void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)

    const parsed = loadProjectState()
    if (parsed) {
      if (Array.isArray(parsed.layers) && parsed.layers.length > 0) layers = parsed.layers
      if (Array.isArray(parsed.strokes)) strokes = parsed.strokes
      if (typeof parsed.activeLayerId === 'string') activeLayerId = parsed.activeLayerId
      if (Array.isArray(parsed.visibleLayerIds)) visibleLayerIds = parsed.visibleLayerIds
      if (Array.isArray(parsed.recentColors)) recentColors = parsed.recentColors.slice(0, 10)
      if (typeof parsed.canvasPresetId === 'string') {
        const preset = canvasPresets.find((item) => item.id === parsed.canvasPresetId)
        if (preset) {
          canvasPresetId = preset.id
          canvasWidth = preset.width
          canvasHeight = preset.height
        }
      } else if (typeof parsed.canvasWidth === 'number' && typeof parsed.canvasHeight === 'number') {
        canvasWidth = Math.max(128, Math.floor(parsed.canvasWidth))
        canvasHeight = Math.max(128, Math.floor(parsed.canvasHeight))
      }
      if (strokes.length === 0) {
        layers = [{ id: 'layer-1', name: 'Layer 1', visible: true }]
        activeLayerId = 'layer-1'
        visibleLayerIds = ['layer-1']
        canvasPresetId = 'infinite'
        canvasWidth = 0
        canvasHeight = 0
      }
    }

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
    }
  })
</script>

<svelte:window
  onkeydown={onKeyDown}
/>

<main class="app-shell">
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
      {canvasWidth}
      {canvasHeight}
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
      <AIPalettePanel {paletteSuggestions} on:pick={(event) => onPickPaletteColor(event.detail)} />
      <div class="redo-panel">
        <SuggestionPanel
          {suggestions}
          currentStrokes={strokes}
          {loadingSuggestions}
          {modelStatus}
          on:pick={((event) => applySuggestion(event.detail))}
          on:stop={stopSuggestionGeneration}
        />
      </div>
    </aside>

    <NavBar
      {isIPad}
      bind:strokes
      {visibleStrokes}
      bind:undoneStack
      bind:undoneContext
      bind:layers
      bind:visibleLayerIds
      bind:activeLayerId
      bind:toolMode
      bind:brushStyle
      {brushColor}
      {brushOpacity}
      bind:hue
      bind:saturation
      bind:value
      {currentHueColor}
      bind:recentColors
      bind:canvasPresetId
      bind:canvasWidth
      bind:canvasHeight
      {drawingCanvasRef}
      bind:clearUndoSnapshot
      onUndo={undoAndSuggest}
      onRedo={redoLast}
      onClear={clearAll}
      onEnterFullscreen={enterFullscreen}
      onExitEraseMode={exitEraseMode}
    />
  </section>

</main>
