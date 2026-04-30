<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { Bot, Eraser, Expand, RotateCcw, RotateCw, Trash2 } from 'lucide-svelte'
  import logoUrl from './assets/logo.png'
  import DrawingCanvas from './lib/components/DrawingCanvas.svelte'
  import BrushSelector from './lib/components/drop_down_components/BrushSelector.svelte'
  import ColorDropDown from './lib/components/drop_down_components/ColorDropDown.svelte'
  import LayerDropDown from './lib/components/drop_down_components/LayerDropDown.svelte'
  import ResolutionDropDown from './lib/components/drop_down_components/ResolutionDropDown.svelte'
  import { canvasPresets, type CanvasPresetId } from './lib/components/drop_down_components/resolutionPresets'
  import ModelSelector from './lib/components/ModelSelector.svelte'
  import SuggestionPanel from './lib/components/SuggestionPanel.svelte'
  import SaveDropDown from './lib/components/drop_down_components/SaveDropDown.svelte'
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
  import { brushStyleOptions } from './lib/brush/brushStyleOptions'
  import {
    loadProjectState,
    loadProviderMode,
    saveProjectState,
    saveProviderMode
  } from './lib/localstorageManager'
  import { hexToRgb, hsvToHex, rgbToHsv } from './lib/color/colorUtils'

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
  let isCanvasMenuOpen = false
  let currentHueColor = '#ff0000'
  let colorMenuRoot: HTMLDivElement | null = null
  let brushMenuRoot: HTMLDivElement | null = null
  let saveMenuRoot: HTMLDivElement | null = null
  let canvasMenuRoot: HTMLDivElement | null = null
  let layerMenuRoot: HTMLDivElement | null = null
  let drawingCanvasRef: { getPngDataUrl?: () => string } | null = null
  let layers: LayerData[] = [{ id: 'layer-1', name: 'Layer 1', visible: true }]
  let activeLayerId = 'layer-1'
  let visibleLayerIds: string[] = ['layer-1']
  let showLayerMenu = false
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

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
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

  const getTopVisibleLayerId = (list: LayerData[]) => {
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].visible) return list[i].id
    }
    return null
  }

  const setActiveLayer = (layerId: string) => {
    activeLayerId = layerId
  }

  const applyLayerState = (
    nextLayers: LayerData[],
    nextVisibleLayerIds: string[],
    nextActiveLayerId: string
  ) => {
    layers = nextLayers
    visibleLayerIds = nextVisibleLayerIds
    activeLayerId = nextActiveLayerId
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
    if (isCanvasMenuOpen) {
      const canvasRoot = canvasMenuRoot
      if (canvasRoot && target && canvasRoot.contains(target)) return
      isCanvasMenuOpen = false
    }
    if (showLayerMenu) {
      const layerRoot = layerMenuRoot
      if (layerRoot && target && layerRoot.contains(target)) return
      showLayerMenu = false
    }
  }

  const closeSaveMenu = () => {
    isSaveMenuOpen = false
  }

  const addStroke = (stroke: StrokeData) => {
    clearUndoSnapshot = null
    const topVisibleLayerId = getTopVisibleLayerId(layers)
    const targetLayerId =
      visibleLayerIds.includes(activeLayerId) ? activeLayerId : (topVisibleLayerId ?? activeLayerId)
    const next = {
      ...stroke,
      layerId: targetLayerId
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
    clearUndoSnapshot = null
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
      keepFullscreen = true
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
        // ignore devices that don't support navigationUI options
      })
    }
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

  const onCanvasPresetChange = (nextId: CanvasPresetId) => {
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
    isCanvasMenuOpen = false
  }

  const onToggleCanvasMenu = () => {
    isCanvasMenuOpen = !isCanvasMenuOpen
    if (isCanvasMenuOpen) {
      isColorMenuOpen = false
      isBrushMenuOpen = false
      isSaveMenuOpen = false
    }
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
      saveProviderMode('groq', key)
    } else {
      resetParameterProvider()
      providerMode = 'local'
      saveProviderMode('local')
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

  const onToggleSaveMenu = () => {
    isSaveMenuOpen = !isSaveMenuOpen
    if (isSaveMenuOpen) {
      isColorMenuOpen = false
      isBrushMenuOpen = false
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
      onProviderWarning(
        'Local storage is almost full. Save a local file soon or your project can be lost.'
      )
    }
    if (persistStatus === 'full') {
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
    setProviderWarningHandler(onProviderWarning)
    const providerState = loadProviderMode()
    groqApiKey = ENV_GROQ_API_KEY || providerState.groqApiKey.trim()

    if (ENV_GROQ_API_KEY) {
      showModelSelector = false
      void applyProvider('groq', ENV_GROQ_API_KEY)
    } else if (providerState.providerMode === 'groq' && groqApiKey) {
      showModelSelector = false
      void applyProvider('groq', groqApiKey)
    } else {
      showModelSelector = true
      providerMode = 'local'
      resetParameterProvider()
    }

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
      setProviderWarningHandler(null)
    }
  })
</script>

<svelte:window
  onkeydown={onKeyDown}
  onpointerdown={onWindowPointerDown}
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
          disabled={strokes.length === 0 && !clearUndoSnapshot}
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
        <SaveDropDown
          open={isSaveMenuOpen}
          onToggle={onToggleSaveMenu}
          onClose={closeSaveMenu}
          {drawingCanvasRef}
          {strokes}
          {layers}
          {visibleStrokes}
          {brushStyleOptions}
          bind:rootEl={saveMenuRoot}
        />
        <ResolutionDropDown
          open={isCanvasMenuOpen}
          onToggle={onToggleCanvasMenu}
          bind:rootEl={canvasMenuRoot}
          {canvasPresetId}
          {canvasWidth}
          {canvasHeight}
          canvasPresetsList={canvasPresets}
          onCanvasPresetChange={onCanvasPresetChange}
        />
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
        <LayerDropDown
          open={showLayerMenu}
          onToggle={() => (showLayerMenu = !showLayerMenu)}
          bind:rootEl={layerMenuRoot}
          {layers}
          {visibleLayerIds}
          {strokes}
          {brushStyleOptions}
          {activeLayerId}
          onActiveLayerChange={setActiveLayer}
          onLayerStateChange={applyLayerState}
          onRenameLayer={renameLayer}
          onAddLayer={addLayer}
        />
        <ColorDropDown
          open={isColorMenuOpen}
          onToggle={() => {
            isColorMenuOpen = !isColorMenuOpen
            if (isColorMenuOpen) isBrushMenuOpen = false
          }}
          bind:rootEl={colorMenuRoot}
          selectedColor={brushColor}
          bind:hue
          bind:saturation
          bind:value
          {currentHueColor}
          {recentColors}
          onColorInteraction={exitEraseMode}
        />

        <div bind:this={brushMenuRoot}>
          <BrushSelector
            value={brushStyle}
            open={isBrushMenuOpen}
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
